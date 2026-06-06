import Dexie, { type Table } from "dexie";
import type { Bank, MidiMapping, Pad, Project, Sample, SampleBlob, SyncMetadata } from "../types/models";
import { makeId } from "../utils/id";
import { sha256Blob } from "../utils/hash";

const banks: Bank[] = ["A", "B", "C", "D"];

class WebMpcDatabase extends Dexie {
  projects!: Table<Project, string>;
  pads!: Table<Pad, string>;
  samples!: Table<Sample, string>;
  sampleBlobs!: Table<SampleBlob, string>;
  midiMappings!: Table<MidiMapping, string>;
  syncMetadata!: Table<SyncMetadata, string>;

  constructor() {
    super("webmpc");
    this.version(1).stores({
      projects: "id, updatedAt",
      pads: "id, [projectId+bank+padIndex], projectId, sampleId, midiNote, updatedAt",
      samples: "id, projectId, hash, updatedAt",
      sampleBlobs: "sampleId, projectId, updatedAt",
      midiMappings: "id, name, updatedAt",
      syncMetadata: "id, projectId, remoteId, updatedAt"
    });
  }
}

export const db = new WebMpcDatabase();

function defaultPad(projectId: string, bank: Bank, padIndex: number, note?: number): Pad {
  const now = Date.now();
  return {
    id: makeId("pad"),
    projectId,
    bank,
    padIndex,
    midiNote: note,
    gain: 1,
    pan: 0,
    pitch: 0,
    startMs: 0,
    oneShot: true,
    updatedAt: now
  };
}

export const mpd218Notes = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51];

export async function createProject(name: string): Promise<Project> {
  const now = Date.now();
  const project: Project = {
    id: makeId("project"),
    name,
    bpm: 120,
    createdAt: now,
    updatedAt: now,
    version: 1
  };
  const pads = banks.flatMap((bank) =>
    Array.from({ length: 16 }, (_, index) => defaultPad(project.id, bank, index, bank === "A" ? mpd218Notes[index] : undefined))
  );
  await db.transaction("rw", db.projects, db.pads, async () => {
    await db.projects.add(project);
    await db.pads.bulkAdd(pads);
  });
  return project;
}

export async function listProjects(): Promise<Project[]> {
  return db.projects.orderBy("updatedAt").reverse().toArray();
}

export async function getProject(projectId: string): Promise<Project | undefined> {
  return db.projects.get(projectId);
}

export async function updateProject(project: Project): Promise<void> {
  await db.projects.put({ ...project, updatedAt: Date.now(), version: project.version + 1 });
}

export async function getPads(projectId: string): Promise<Pad[]> {
  return db.pads.where("projectId").equals(projectId).toArray();
}

export async function savePad(pad: Pad): Promise<void> {
  await db.pads.put({ ...pad, updatedAt: Date.now() });
  await touchProject(pad.projectId);
}

export async function getSamples(projectId: string): Promise<Sample[]> {
  return db.samples.where("projectId").equals(projectId).toArray();
}

export async function importSample(projectId: string, file: File, durationMs?: number): Promise<Sample> {
  const now = Date.now();
  const hash = await sha256Blob(file);
  const sample: Sample = {
    id: makeId("sample"),
    projectId,
    hash,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    durationMs,
    createdAt: now,
    updatedAt: now
  };
  await db.transaction("rw", db.samples, db.sampleBlobs, db.projects, async () => {
    await db.samples.add(sample);
    await db.sampleBlobs.add({ sampleId: sample.id, projectId, blob: file, updatedAt: now });
    await touchProject(projectId);
  });
  return sample;
}

export async function putImportedSample(sample: Sample, blob: Blob): Promise<void> {
  await db.transaction("rw", db.samples, db.sampleBlobs, async () => {
    await db.samples.put(sample);
    await db.sampleBlobs.put({ sampleId: sample.id, projectId: sample.projectId, blob, updatedAt: Date.now() });
  });
}

export async function getSampleBlob(sampleId: string): Promise<Blob | undefined> {
  return (await db.sampleBlobs.get(sampleId))?.blob;
}

export async function getMidiMappings(): Promise<MidiMapping[]> {
  return db.midiMappings.toArray();
}

export async function saveMidiMapping(mapping: MidiMapping): Promise<void> {
  await db.midiMappings.put({ ...mapping, updatedAt: Date.now() });
}

export async function ensureDefaultMapping(): Promise<MidiMapping> {
  const existing = await db.midiMappings.where("name").equals("MPD218 default").first();
  if (existing) return existing;
  const mappings = Object.fromEntries(mpd218Notes.map((note, index) => [String(note), { bank: "A" as const, padIndex: index }]));
  const mapping: MidiMapping = {
    id: makeId("mapping"),
    name: "MPD218 default",
    deviceName: "MPD218",
    mappings,
    updatedAt: Date.now()
  };
  await saveMidiMapping(mapping);
  return mapping;
}

export async function touchProject(projectId: string): Promise<void> {
  const project = await db.projects.get(projectId);
  if (project) {
    await db.projects.put({ ...project, updatedAt: Date.now(), version: project.version + 1 });
  }
}

export async function replaceProjectBundle(project: Project, pads: Pad[], samples: Array<{ sample: Sample; blob?: Blob }>, mappings: MidiMapping[]): Promise<void> {
  await db.transaction("rw", [db.projects, db.pads, db.samples, db.sampleBlobs, db.midiMappings], async () => {
    await db.projects.put(project);
    await db.pads.where("projectId").equals(project.id).delete();
    await db.samples.where("projectId").equals(project.id).delete();
    await db.sampleBlobs.where("projectId").equals(project.id).delete();
    await db.pads.bulkPut(pads);
    if (samples.length > 0) {
      await db.samples.bulkPut(samples.map(({ sample }) => sample));
      await db.sampleBlobs.bulkPut(
        samples.flatMap(({ sample, blob }) => (blob ? [{ sampleId: sample.id, projectId: sample.projectId, blob, updatedAt: Date.now() }] : []))
      );
    }
    if (mappings.length > 0) await db.midiMappings.bulkPut(mappings);
  });
}
