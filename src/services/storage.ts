import Dexie, { type Table } from "dexie";
import type { Bank, MidiMapping, Pad, Project, Sample, SampleBlob, SyncMetadata } from "../types/models";
import { isAudioFile } from "../utils/file";
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
    name: normalizeProjectName(name),
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
  await db.projects.put({ ...normalizeProject(project), updatedAt: Date.now(), version: project.version + 1 });
}

export async function deleteProject(projectId: string): Promise<void> {
  await db.transaction("rw", [db.projects, db.pads, db.samples, db.sampleBlobs, db.syncMetadata], async () => {
    await db.projects.delete(projectId);
    await db.pads.where("projectId").equals(projectId).delete();
    await db.samples.where("projectId").equals(projectId).delete();
    await db.sampleBlobs.where("projectId").equals(projectId).delete();
    await db.syncMetadata.where("projectId").equals(projectId).delete();
  });
}

export async function getPads(projectId: string): Promise<Pad[]> {
  return db.pads.where("projectId").equals(projectId).toArray();
}

export async function savePad(pad: Pad): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.pads, db.projects, async () => {
    await db.pads.put({ ...normalizePad(pad), updatedAt: now });
    await touchProjectRecord(pad.projectId, now);
  });
}

export async function getSamples(projectId: string): Promise<Sample[]> {
  return db.samples.where("projectId").equals(projectId).toArray();
}

export async function importSample(projectId: string, file: File, durationMs?: number): Promise<Sample> {
  if (!isAudioFile(file)) {
    throw new Error("Sample file must be an audio file.");
  }
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
    await touchProjectRecord(projectId, now);
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

export async function deleteSample(sampleId: string): Promise<void> {
  const sample = await db.samples.get(sampleId);
  if (!sample) return;
  const now = Date.now();
  await db.transaction("rw", db.samples, db.sampleBlobs, db.pads, db.projects, async () => {
    const assignedPads = await db.pads.where("sampleId").equals(sampleId).toArray();
    if (assignedPads.length > 0) {
      await db.pads.bulkPut(assignedPads.map((pad) => ({ ...pad, sampleId: undefined, updatedAt: now })));
    }
    await db.samples.delete(sampleId);
    await db.sampleBlobs.delete(sampleId);
    await touchProjectRecord(sample.projectId, now);
  });
}

export async function updateSampleDuration(sampleId: string, durationMs: number): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.samples, db.projects, async () => {
    const sample = await db.samples.get(sampleId);
    if (!sample || sample.durationMs === durationMs) return;
    await db.samples.put({ ...sample, durationMs, updatedAt: now });
    await touchProjectRecord(sample.projectId, now);
  });
}

export async function getMidiMappings(): Promise<MidiMapping[]> {
  return db.midiMappings.toArray();
}

export async function saveMidiMapping(mapping: MidiMapping): Promise<void> {
  await db.midiMappings.put({ ...mapping, updatedAt: Date.now() });
}

export async function applyMidiMapping(projectId: string, mappingName = "MPD218 default"): Promise<void> {
  const mapping = await db.midiMappings.where("name").equals(mappingName).first();
  if (!mapping) {
    throw new Error(`MIDI mapping "${mappingName}" was not found.`);
  }
  const pads = await getPads(projectId);
  const padsByPosition = new Map(pads.map((pad) => [`${pad.bank}:${pad.padIndex}`, pad]));
  const now = Date.now();
  const updatedPads = Object.entries(mapping.mappings).flatMap(([note, target]) => {
    const pad = padsByPosition.get(`${target.bank}:${target.padIndex}`);
    const midiNote = Number(note);
    return pad && isIntegerInRange(midiNote, 0, 127) ? [{ ...normalizePad({ ...pad, midiNote }), updatedAt: now }] : [];
  });
  await db.transaction("rw", db.pads, db.projects, async () => {
    if (updatedPads.length > 0) {
      await db.pads.bulkPut(updatedPads);
    }
    await touchProjectRecord(projectId, now);
  });
}

function normalizePad(pad: Pad): Pad {
  return {
    ...pad,
    gain: clampFinite(pad.gain, 0, 1.5, 1),
    pan: clampFinite(pad.pan, -1, 1, 0),
    pitch: clampFinite(pad.pitch, -24, 24, 0),
    startMs: clampFinite(pad.startMs, 0, 600000, 0),
    endMs: pad.endMs === undefined ? undefined : normalizeOptionalPositive(pad.endMs, 600000),
    midiNote: pad.midiNote === undefined || !isIntegerInRange(pad.midiNote, 0, 127) ? undefined : pad.midiNote
  };
}

function normalizeOptionalPositive(value: number, max: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(value, max);
}

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function isIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    name: normalizeProjectName(project.name),
    bpm: clampFinite(project.bpm, 20, 300, 120)
  };
}

function normalizeProjectName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : "New kit";
}

export async function getSyncMetadata(projectId: string): Promise<SyncMetadata | undefined> {
  return db.syncMetadata.where("projectId").equals(projectId).first();
}

export async function saveSyncMetadata(metadata: Omit<SyncMetadata, "id" | "updatedAt">): Promise<SyncMetadata> {
  const existing = await getSyncMetadata(metadata.projectId);
  const now = Date.now();
  const next: SyncMetadata = {
    id: existing?.id ?? makeId("sync"),
    ...existing,
    ...metadata,
    updatedAt: now
  };
  await db.syncMetadata.put(next);
  return next;
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
  await touchProjectRecord(projectId);
}

async function touchProjectRecord(projectId: string, updatedAt = Date.now()): Promise<void> {
  const project = await db.projects.get(projectId);
  if (project) {
    await db.projects.put({ ...project, updatedAt, version: project.version + 1 });
  }
}

export async function replaceProjectBundle(project: Project, pads: Pad[], samples: Array<{ sample: Sample; blob?: Blob }>, mappings: MidiMapping[]): Promise<void> {
  await db.transaction("rw", [db.projects, db.pads, db.samples, db.sampleBlobs, db.midiMappings, db.syncMetadata], async () => {
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
    if (mappings.length > 0) {
      const mappingsToSave = await Promise.all(
        mappings.map(async (mapping) => {
          const existing = await db.midiMappings.where("name").equals(mapping.name).first();
          return existing ? { ...mapping, id: existing.id } : mapping;
        })
      );
      await db.midiMappings.bulkPut(mappingsToSave);
    }
  });
}
