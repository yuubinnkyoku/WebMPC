import PocketBase, { type RecordModel } from "pocketbase";
import type { Pad, Project, Sample } from "../types/models";
import { makeId } from "../utils/id";
import { quotePocketBaseFilterValue } from "../utils/pocketbaseFilter";
import { shouldPruneRemoteSample } from "../utils/remoteSamples";
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
  updatedAt: number;
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
  const payload = { project, pads, samples };
  const remoteId = project.remoteId;
  if (remoteId) {
    const remote = await pb.collection<RemoteProjectRecord>("webmpc_projects").getOne(remoteId).catch(() => undefined);
    const remoteUpdatedAt = remote?.project?.updatedAt;
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
  await db.projects.put({ ...project, remoteId: record.id, updatedAt: Date.now() });
  await saveSyncMetadata({
    projectId,
    remoteId: record.id,
    lastSyncedAt: Date.now(),
    remoteUpdatedAt: Date.parse(record.updated)
  });
  await uploadSampleFiles(record.id, samples);
  await pruneRemoteSampleFiles(record.id, samples);
  return { ...getSyncState(), message: `Synced ${project.name}` };
}

export async function listRemoteProjects(): Promise<RemoteProjectSummary[]> {
  if (!pb) throw new Error("PocketBase URL is not configured.");
  if (!pb.authStore.isValid) throw new Error("Sign in before listing remote projects.");
  const records = await pb.collection<RemoteProjectRecord>("webmpc_projects").getList(1, 50, {
    sort: "-updated"
  });
  return records.items.map((record) => ({
    id: record.id,
    name: record.project?.name ?? "Untitled remote project",
    updatedAt: record.project?.updatedAt ?? Date.parse(record.updated),
    sampleCount: record.samples?.length ?? 0
  }));
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
  const projectId = makeId("project");
  const sampleIdMap = new Map<string, string>();
  const project: Project = {
    ...record.project,
    id: projectId,
    remoteId: record.id,
    name: `${record.project.name} restored`,
    updatedAt: now
  };

  const remoteSampleFiles = await listRemoteSampleFiles(record.id);
  const samples = await Promise.all(
    record.samples.map(async (sample) => {
      const nextSampleId = makeId("sample");
      sampleIdMap.set(sample.id, nextSampleId);
      const restoredSample: Sample = {
        ...sample,
        id: nextSampleId,
        projectId,
        updatedAt: now,
        remoteFileId: sample.remoteFileId
      };
      const remoteFile = remoteSampleFiles.get(sample.id);
      return {
        sample: restoredSample,
        blob: remoteFile ? await downloadRemoteSampleBlob(remoteFile) : undefined
      };
    })
  );

  const pads: Pad[] = record.pads.map((pad) => ({
    ...pad,
    id: makeId("pad"),
    projectId,
    sampleId: pad.sampleId ? sampleIdMap.get(pad.sampleId) : undefined,
    updatedAt: now
  }));

  await replaceProjectBundle(project, pads, samples, []);
  await saveSyncMetadata({
    projectId: project.id,
    remoteId: record.id,
    lastSyncedAt: now,
    remoteUpdatedAt: Date.parse(record.updated)
  });
  return project;
}

async function uploadSampleFiles(remoteProjectId: string, samples: Sample[]): Promise<void> {
  if (!pb) return;
  const blobs = await db.sampleBlobs.bulkGet(samples.map((sample) => sample.id));
  await Promise.all(
    samples.map(async (sample, index) => {
      const blob = blobs[index]?.blob;
      if (!blob) return;
      const data = new FormData();
      data.set("project", remoteProjectId);
      data.set("sampleId", sample.id);
      data.set("file", blob, sample.name);
      const existing = await getRemoteSampleFile(remoteProjectId, sample.id);
      if (existing) {
        await pb.collection("webmpc_samples").update(existing.id, data).catch(() => undefined);
      } else {
        await pb.collection("webmpc_samples").create(data).catch(() => undefined);
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
  const bySampleId = new Map<string, RemoteSampleRecord>();
  records.forEach((record) => {
    if (record.sampleId && !bySampleId.has(record.sampleId)) {
      bySampleId.set(record.sampleId, record);
    }
  });
  return bySampleId;
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
  return response.blob();
}

export type SyncPayload = {
  project: Project;
  pads: Pad[];
  samples: Sample[];
};
