import PocketBase, { type RecordModel } from "pocketbase";
import type { Pad, Project, Sample } from "../types/models";
import { makeId } from "../utils/id";
import { stripProjectRemoteId, stripSampleRemoteFileId } from "../utils/localSyncMetadata";
import { quotePocketBaseFilterValue } from "../utils/pocketbaseFilter";
import { getRemoteProjectUpdatedAt, parsePocketBaseUpdatedAt } from "../utils/pocketbaseRecord";
import { normalizeProjectName } from "../utils/projectName";
import { toRemoteProjectSummary } from "../utils/remoteProjects";
import { findMissingSampleBlobNames, mapRemoteSamplesBySampleId, shouldPruneRemoteSample } from "../utils/remoteSamples";
import { formatSampleLoadFailureMessage, formatSampleName } from "../utils/sampleLoadMessage";
import { decideSyncConflict } from "../utils/syncConflict";
import { validateProjectBundlePayload } from "./exportImport";
import { db, getPads, getSamples, replaceProjectBundle, saveSyncMetadata } from "./storage";

export type SyncState = {
  configured: boolean;
  signedIn: boolean;
  syncing: boolean;
  message: string;
};

export type RemoteProjectSummary = {
  id: string;
  name: string;
  updatedAt?: number;
  sampleCount: number;
};

type RemoteProjectRecord = RecordModel & {
  project?: Project;
  pads?: Pad[];
  samples?: Sample[];
};

type RemoteSampleRecord = RecordModel & {
  project?: string;
  sampleId?: string;
  file?: string | string[];
};

const pocketBaseUrl = import.meta.env.VITE_POCKETBASE_URL as string | undefined;
const pb = pocketBaseUrl ? new PocketBase(pocketBaseUrl) : undefined;

export function getSyncState(): SyncState {
  return {
    configured: Boolean(pb),
    signedIn: Boolean(pb?.authStore.isValid),
    syncing: false,
    message: pb ? "PocketBase configured" : "PocketBase is not configured"
  };
}

export async function signIn(email: string, password: string): Promise<SyncState> {
  if (!pb) throw new Error("PocketBase URL is not configured.");
  await pb.collection("users").authWithPassword(email, password);
  return { ...getSyncState(), message: "Signed in" };
}

export function signOut(): SyncState {
  pb?.authStore.clear();
  return { ...getSyncState(), message: "Signed out" };
}

export async function syncProject(projectId: string): Promise<SyncState> {
  if (!pb) return { ...getSyncState(), message: "PocketBase is not configured" };
  if (!pb.authStore.isValid) return { ...getSyncState(), message: "Sign in before syncing" };
  const project = await db.projects.get(projectId);
  if (!project) throw new Error("Project not found.");
  const pads = await getPads(projectId);
  const samples = await getSamples(projectId);
  const sampleBlobs = await getRequiredSampleBlobs(samples, "Unable to upload missing sample file data for");
  const payload = toRemoteSyncPayload(project, pads, samples);
  const remoteId = project.remoteId;
  if (remoteId) {
    const remote = await pb.collection<RemoteProjectRecord>("webmpc_projects").getOne(remoteId).catch(() => undefined);
    const remoteUpdatedAt = getRemoteProjectUpdatedAt(remote?.project?.updatedAt, remote?.updated);
    const conflict = decideSyncConflict(project.updatedAt, remoteUpdatedAt);
    if (conflict.remoteIsNewer) {
      await saveSyncMetadata({
        projectId,
        remoteId,
        remoteUpdatedAt
      });
      return { ...getSyncState(), message: conflict.message ?? "Remote project is newer." };
    }
  }
  const record = remoteId
    ? await pb.collection("webmpc_projects").update(remoteId, payload)
    : await pb.collection("webmpc_projects").create(payload);
  const projectWithRemoteId = assignRemoteProjectId(project, record.id);
  if (projectWithRemoteId) {
    await db.projects.put(projectWithRemoteId);
  }
  await uploadSampleFiles(record.id, samples, sampleBlobs);
  await pruneRemoteSampleFiles(record.id, samples);
  const syncedAt = Date.now();
  await saveSyncMetadata({
    projectId,
    remoteId: record.id,
    lastSyncedAt: syncedAt,
    remoteUpdatedAt: parsePocketBaseUpdatedAt(record.updated)
  });
  return { ...getSyncState(), message: `Synced ${project.name}` };
}

export async function listRemoteProjects(): Promise<RemoteProjectSummary[]> {
  if (!pb) throw new Error("PocketBase URL is not configured.");
  if (!pb.authStore.isValid) throw new Error("Sign in before listing remote projects.");
  const records = await pb.collection<RemoteProjectRecord>("webmpc_projects").getFullList({
    sort: "-updated"
  });
  return records.map(toRemoteProjectSummary);
}

export async function restoreRemoteProject(remoteId: string): Promise<Project> {
  if (!pb) throw new Error("PocketBase URL is not configured.");
  if (!pb.authStore.isValid) throw new Error("Sign in before restoring remote projects.");
  const record = await pb.collection<RemoteProjectRecord>("webmpc_projects").getOne(remoteId);
  if (!record.project || !Array.isArray(record.pads) || !Array.isArray(record.samples)) {
    throw new Error("Remote project is missing required WebMPC fields.");
  }
  try {
    validateProjectBundlePayload({ project: record.project, pads: record.pads, samples: record.samples, midiMappings: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Remote project contains invalid WebMPC data.";
    throw new Error(`Remote project contains invalid WebMPC data: ${message}`);
  }

  const now = Date.now();
  const restoredBundle = toRestoredProjectBundle(record.id, record.project, record.pads, record.samples, now, makeId);

  const remoteSampleFiles = await listRemoteSampleFiles(record.id);
  const samples = await Promise.all(
    record.samples.map(async (sample, index) => {
      const remoteFile = remoteSampleFiles.get(sample.id);
      return {
        sample: restoredBundle.samples[index],
        blob: remoteFile ? await downloadRemoteSampleBlob(remoteFile) : undefined
      };
    })
  );
  const missingBlobNames = findMissingSampleBlobNames(
    samples.map(({ sample }) => sample),
    samples.map(({ blob }) => (blob ? { blob } : undefined))
  );
  if (missingBlobNames.length > 0) {
    throw new Error(formatSampleLoadFailureMessage("Unable to restore missing remote sample file data for", missingBlobNames) ?? "Unable to restore missing remote sample file data.");
  }

  await replaceProjectBundle(restoredBundle.project, restoredBundle.pads, samples, []);
  await saveSyncMetadata({
    projectId: restoredBundle.project.id,
    remoteId: record.id,
    lastSyncedAt: now,
    remoteUpdatedAt: parsePocketBaseUpdatedAt(record.updated)
  });
  return restoredBundle.project;
}

async function getRequiredSampleBlobs(samples: Sample[], errorPrefix: string): Promise<Blob[]> {
  const records = await db.sampleBlobs.bulkGet(samples.map((sample) => sample.id));
  const missingBlobNames = findMissingSampleBlobNames(samples, records);
  if (missingBlobNames.length > 0) {
    throw new Error(formatSampleLoadFailureMessage(errorPrefix, missingBlobNames) ?? "Missing sample file data.");
  }
  return records.map((record) => record?.blob as Blob);
}

async function uploadSampleFiles(remoteProjectId: string, samples: Sample[], blobs: Blob[]): Promise<void> {
  if (!pb) return;
  await Promise.all(
    samples.map(async (sample, index) => {
      const blob = blobs[index];
      const data = new FormData();
      data.set("project", remoteProjectId);
      data.set("sampleId", sample.id);
      data.set("file", blob, sample.name);
      const existing = await getRemoteSampleFile(remoteProjectId, sample.id);
      try {
        if (existing) {
          await pb.collection("webmpc_samples").update(existing.id, data);
        } else {
          await pb.collection("webmpc_samples").create(data);
        }
      } catch {
        throw new Error(`Unable to upload sample file ${formatSampleName(sample.name)}.`);
      }
    })
  );
}

async function pruneRemoteSampleFiles(remoteProjectId: string, samples: Sample[]): Promise<void> {
  if (!pb) return;
  const localSampleIds = new Set(samples.map((sample) => sample.id));
  const records = await listRemoteSampleFileRecords(remoteProjectId);
  await Promise.all(
    records
      .filter((record) => shouldPruneRemoteSample(record, localSampleIds))
      .map((record) => pb.collection("webmpc_samples").delete(record.id).catch(() => undefined))
  );
}

async function listRemoteSampleFileRecords(remoteProjectId: string): Promise<RemoteSampleRecord[]> {
  if (!pb) return [];
  return pb.collection<RemoteSampleRecord>("webmpc_samples").getFullList({
    filter: `project = ${quotePocketBaseFilterValue(remoteProjectId)}`,
    sort: "-updated"
  });
}

async function listRemoteSampleFiles(remoteProjectId: string): Promise<Map<string, RemoteSampleRecord>> {
  const records = await listRemoteSampleFileRecords(remoteProjectId);
  return mapRemoteSamplesBySampleId(records);
}

async function getRemoteSampleFile(remoteProjectId: string, sampleId: string): Promise<RemoteSampleRecord | undefined> {
  if (!pb) return undefined;
  return pb
    .collection<RemoteSampleRecord>("webmpc_samples")
    .getFirstListItem(`project = ${quotePocketBaseFilterValue(remoteProjectId)} && sampleId = ${quotePocketBaseFilterValue(sampleId)}`)
    .catch(() => undefined);
}

async function downloadRemoteSampleBlob(record: RemoteSampleRecord): Promise<Blob | undefined> {
  if (!pb) return undefined;
  const fileName = Array.isArray(record.file) ? record.file[0] : record.file;
  if (!fileName) return undefined;
  const response = await fetch(pb.files.getURL(record, fileName));
  if (!response.ok) return undefined;
  const blob = await response.blob();
  return blob.size > 0 ? blob : undefined;
}

export type SyncPayload = {
  project: Omit<Project, "remoteId">;
  pads: Pad[];
  samples: Array<Omit<Sample, "remoteFileId">>;
};

export function toRemoteSyncPayload(project: Project, pads: Pad[], samples: Sample[]): SyncPayload {
  return {
    project: stripProjectRemoteId(project),
    pads,
    samples: samples.map(stripSampleRemoteFileId)
  };
}

export function assignRemoteProjectId(project: Project, remoteId: string): Project | undefined {
  return project.remoteId === remoteId ? undefined : { ...project, remoteId };
}

export function toRestoredProjectBundle(
  remoteId: string,
  remoteProject: Project,
  remotePads: Pad[],
  remoteSamples: Sample[],
  now: number,
  nextId: (prefix: string) => string
): { project: Project; pads: Pad[]; samples: Sample[] } {
  const projectId = nextId("project");
  const sampleIdMap = new Map<string, string>();
  const project: Project = {
    ...remoteProject,
    id: projectId,
    remoteId,
    name: normalizeProjectName(`${normalizeProjectName(remoteProject.name)} restored`),
    createdAt: now,
    updatedAt: now
  };
  const samples = remoteSamples.map((sample) => {
    const nextSampleId = nextId("sample");
    sampleIdMap.set(sample.id, nextSampleId);
    return {
      ...stripSampleRemoteFileId(sample),
      id: nextSampleId,
      projectId,
      createdAt: now,
      updatedAt: now
    };
  });
  const pads = remotePads.map((pad) => ({
    ...pad,
    id: nextId("pad"),
    projectId,
    sampleId: pad.sampleId ? sampleIdMap.get(pad.sampleId) : undefined,
    updatedAt: now
  }));
  return { project, pads, samples };
}
