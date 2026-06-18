import Dexie, { type Table } from "dexie";
import type { Bank, MidiMapping, Pad, Project, Sample, SampleBlob, SyncMetadata } from "../types/models";
import { BANKS } from "../utils/banks";
import { isAudioFile } from "../utils/file";
import { makeId } from "../utils/id";
import { sha256Blob } from "../utils/hash";
import { createMpd218Mappings, getMpd218NoteForPad, MPD218_DEVICE_NAME, MPD218_MAPPING_NAME, MPD218_NOTES } from "../utils/mpd218";
import { normalizeProjectName } from "../utils/projectName";

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

export const mpd218Notes = MPD218_NOTES;

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
  const pads = BANKS.flatMap((bank) =>
    Array.from({ length: 16 }, (_, index) => defaultPad(project.id, bank, index, getMpd218NoteForPad(bank, index)))
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
  await db.transaction("rw", db.projects, async () => {
    const existing = await db.projects.get(project.id);
    if (!existing) {
      throw new Error("Project not found.");
    }
    const name = normalizeProjectName(project.name);
    const bpm = clampFinite(project.bpm, 20, 300, 120);
    if (existing.name === name && existing.bpm === bpm) return;
    await db.projects.put({
      ...existing,
      name,
      bpm,
      updatedAt: Date.now(),
      version: existing.version + 1
    });
  });
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
  await db.transaction("rw", db.pads, db.projects, db.samples, async () => {
    const normalizedPad = normalizePad(pad);
    const existing = await db.pads.get(pad.id);
    if (!existing) {
      throw new Error("Pad not found.");
    }
    if (
      existing.projectId !== normalizedPad.projectId ||
      existing.bank !== normalizedPad.bank ||
      existing.padIndex !== normalizedPad.padIndex
    ) {
      throw new Error("Pad identity cannot be changed.");
    }
    if (!(await db.projects.get(normalizedPad.projectId))) {
      throw new Error("Pad project does not exist.");
    }
    if (normalizedPad.sampleId) {
      const sample = await db.samples.get(normalizedPad.sampleId);
      if (!sample || sample.projectId !== normalizedPad.projectId) {
        throw new Error("Assigned sample does not belong to this project.");
      }
    }
    const duplicateMidiPads =
      normalizedPad.midiNote === undefined
        ? []
        : (await db.pads.where("midiNote").equals(normalizedPad.midiNote).toArray()).filter(
            (candidate) => candidate.projectId === normalizedPad.projectId && candidate.id !== normalizedPad.id
          );
    const currentChanged = !arePadsEquivalent(existing, normalizedPad);
    if (!currentChanged && duplicateMidiPads.length === 0) return;
    await db.pads.bulkPut([
      ...duplicateMidiPads.map((candidate) => ({ ...candidate, midiNote: undefined, updatedAt: now })),
      ...(currentChanged ? [{ ...normalizedPad, updatedAt: now }] : [])
    ]);
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
  if (file.size <= 0) {
    throw new Error("Sample file must not be empty.");
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
    durationMs: normalizeOptionalDuration(durationMs),
    createdAt: now,
    updatedAt: now
  };
  await db.transaction("rw", db.samples, db.sampleBlobs, db.projects, async () => {
    if (!(await db.projects.get(projectId))) {
      throw new Error("Project not found.");
    }
    await db.samples.add(sample);
    await db.sampleBlobs.add({ sampleId: sample.id, projectId, blob: file, updatedAt: now });
    await touchProjectRecord(projectId, now);
  });
  return sample;
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
    if (!sample) return;
    const normalizedDurationMs = normalizeOptionalDuration(durationMs);
    if (sample.durationMs === normalizedDurationMs) return;
    await db.samples.put({ ...sample, durationMs: normalizedDurationMs, updatedAt: now });
    await touchProjectRecord(sample.projectId, now);
  });
}

export async function getMidiMappings(): Promise<MidiMapping[]> {
  return db.midiMappings.toArray();
}

export async function saveMidiMapping(mapping: MidiMapping): Promise<void> {
  const normalized = normalizeMidiMapping(mapping);
  await db.transaction("rw", db.midiMappings, async () => {
    const [existingById, existingByName] = await Promise.all([
      db.midiMappings.get(normalized.id),
      db.midiMappings.where("name").equals(normalized.name).first()
    ]);
    if (existingByName && existingByName.id !== normalized.id) {
      throw new Error(`MIDI mapping "${normalized.name}" already exists.`);
    }
    if (existingById && areMidiMappingsEquivalent(existingById, normalized)) return;
    await db.midiMappings.put({ ...normalized, updatedAt: Date.now() });
  });
}

export async function applyMidiMapping(projectId: string, mappingName = MPD218_MAPPING_NAME): Promise<void> {
  if (!(await db.projects.get(projectId))) {
    throw new Error("Project not found.");
  }
  const mapping = await db.midiMappings.where("name").equals(mappingName).first();
  if (!mapping) {
    throw new Error(`MIDI mapping "${mappingName}" was not found.`);
  }
  const pads = await getPads(projectId);
  const padsByPosition = new Map(pads.map((pad) => [`${pad.bank}:${pad.padIndex}`, pad]));
  const desiredNoteByPadId = new Map<string, number>();
  const mappedNotes = new Set<number>();
  for (const [note, target] of Object.entries(mapping.mappings)) {
    const pad = padsByPosition.get(`${target.bank}:${target.padIndex}`);
    const midiNote = Number(note);
    if (pad && isIntegerInRange(midiNote, 0, 127)) {
      desiredNoteByPadId.set(pad.id, midiNote);
      mappedNotes.add(midiNote);
    }
  }
  const now = Date.now();
  const updatedPads = pads.flatMap((pad) => {
    const desiredNote = desiredNoteByPadId.get(pad.id);
    const midiNote = desiredNote ?? (pad.midiNote !== undefined && mappedNotes.has(pad.midiNote) ? undefined : pad.midiNote);
    if (pad.midiNote === midiNote) return [];
    return [{ ...pad, midiNote, updatedAt: now }];
  });
  if (updatedPads.length === 0) return;
  await db.transaction("rw", db.pads, db.projects, async () => {
    await db.pads.bulkPut(updatedPads);
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

function normalizeMidiMapping(mapping: MidiMapping): MidiMapping {
  const name = mapping.name.trim();
  if (!mapping.id || !name) {
    throw new Error("MIDI mapping requires an ID and name.");
  }
  const targets = new Set<string>();
  for (const [note, target] of Object.entries(mapping.mappings)) {
    const midiNote = Number(note);
    const targetKey = `${target.bank}:${target.padIndex}`;
    if (
      !/^(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-7])$/.test(note) ||
      !isIntegerInRange(midiNote, 0, 127) ||
      !BANKS.includes(target.bank) ||
      !isIntegerInRange(target.padIndex, 0, 15) ||
      targets.has(targetKey)
    ) {
      throw new Error("MIDI mapping contains an invalid or duplicate target.");
    }
    targets.add(targetKey);
  }
  return {
    ...mapping,
    name,
    deviceName: mapping.deviceName?.trim() || undefined
  };
}

function areMidiMappingsEquivalent(left: MidiMapping, right: MidiMapping): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.deviceName === right.deviceName &&
    JSON.stringify(left.mappings) === JSON.stringify(right.mappings)
  );
}

function arePadsEquivalent(left: Pad, right: Pad): boolean {
  return (
    left.id === right.id &&
    left.projectId === right.projectId &&
    left.bank === right.bank &&
    left.padIndex === right.padIndex &&
    left.midiNote === right.midiNote &&
    left.sampleId === right.sampleId &&
    left.gain === right.gain &&
    left.pan === right.pan &&
    left.pitch === right.pitch &&
    left.startMs === right.startMs &&
    left.endMs === right.endMs &&
    left.chokeGroup === right.chokeGroup &&
    left.oneShot === right.oneShot
  );
}

function normalizeSample(sample: Sample): Sample {
  return {
    ...sample,
    durationMs: normalizeOptionalDuration(sample.durationMs)
  };
}

function normalizeOptionalPositive(value: number, max: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(value, max);
}

function normalizeOptionalDuration(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
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

export async function getSyncMetadata(projectId: string): Promise<SyncMetadata | undefined> {
  return db.syncMetadata.where("projectId").equals(projectId).first();
}

export async function saveSyncMetadata(metadata: Omit<SyncMetadata, "id" | "updatedAt">): Promise<SyncMetadata> {
  return db.transaction("rw", db.syncMetadata, db.projects, async () => {
    if (!(await db.projects.get(metadata.projectId))) {
      throw new Error("Project not found.");
    }
    const existing = await getSyncMetadata(metadata.projectId);
    const now = Date.now();
    const next: SyncMetadata = {
      id: existing?.id ?? makeId("sync"),
      ...existing,
      ...normalizeSyncMetadataInput(metadata),
      updatedAt: now
    };
    await db.syncMetadata.put(next);
    return next;
  });
}

function normalizeSyncMetadataInput(metadata: Omit<SyncMetadata, "id" | "updatedAt">): Omit<SyncMetadata, "id" | "updatedAt"> {
  return {
    ...metadata,
    remoteId: metadata.remoteId?.trim() || undefined,
    lastSyncedAt: normalizeOptionalTimestamp(metadata.lastSyncedAt),
    remoteUpdatedAt: normalizeOptionalTimestamp(metadata.remoteUpdatedAt)
  };
}

function normalizeOptionalTimestamp(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export async function ensureDefaultMapping(): Promise<MidiMapping> {
  const existing = await db.midiMappings.where("name").equals(MPD218_MAPPING_NAME).first();
  if (existing) return existing;
  const mapping: MidiMapping = {
    id: makeId("mapping"),
    name: MPD218_MAPPING_NAME,
    deviceName: MPD218_DEVICE_NAME,
    mappings: createMpd218Mappings(),
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
  const normalizedProject = normalizeProject(project);
  const normalizedPads = pads.map(normalizePad);
  const normalizedSamples = samples.map(({ sample, blob }) => ({ sample: normalizeSample(sample), blob }));
  await validateReplacementBundle(normalizedProject, normalizedPads, normalizedSamples, mappings);
  await db.transaction("rw", [db.projects, db.pads, db.samples, db.sampleBlobs, db.midiMappings, db.syncMetadata], async () => {
    await validateReplacementRecordOwnership(normalizedProject.id, normalizedPads, normalizedSamples);
    await validateReplacementMappingOwnership(mappings);
    await db.projects.put(normalizedProject);
    await db.pads.where("projectId").equals(project.id).delete();
    await db.samples.where("projectId").equals(project.id).delete();
    await db.sampleBlobs.where("projectId").equals(project.id).delete();
    await db.syncMetadata.where("projectId").equals(project.id).delete();
    await db.pads.bulkPut(normalizedPads);
    if (normalizedSamples.length > 0) {
      await db.samples.bulkPut(normalizedSamples.map(({ sample }) => sample));
      await db.sampleBlobs.bulkPut(
        normalizedSamples.map(({ sample, blob }) => ({
          sampleId: sample.id,
          projectId: sample.projectId,
          blob: blob as Blob,
          updatedAt: Date.now()
        }))
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

async function validateReplacementRecordOwnership(
  projectId: string,
  pads: Pad[],
  samples: Array<{ sample: Sample }>
): Promise<void> {
  const existingPads = await db.pads.bulkGet(pads.map((pad) => pad.id));
  if (existingPads.some((pad) => pad && pad.projectId !== projectId)) {
    throw new Error("Project bundle contains a pad ID owned by another project.");
  }
  const existingSamples = await db.samples.bulkGet(samples.map(({ sample }) => sample.id));
  if (existingSamples.some((sample) => sample && sample.projectId !== projectId)) {
    throw new Error("Project bundle contains a sample ID owned by another project.");
  }
}

async function validateReplacementMappingOwnership(mappings: MidiMapping[]): Promise<void> {
  const existingMappings = await db.midiMappings.bulkGet(mappings.map((mapping) => mapping.id));
  if (existingMappings.some((existing, index) => existing && existing.name !== mappings[index]?.name)) {
    throw new Error("Project bundle contains a MIDI mapping ID owned by another mapping.");
  }
}

async function validateReplacementBundle(
  project: Project,
  pads: Pad[],
  samples: Array<{ sample: Sample; blob?: Blob }>,
  mappings: MidiMapping[]
): Promise<void> {
  if (
    !project.id ||
    !Number.isFinite(project.createdAt) ||
    project.createdAt < 0 ||
    !Number.isFinite(project.updatedAt) ||
    project.updatedAt < 0 ||
    !Number.isInteger(project.version) ||
    project.version < 1
  ) {
    throw new Error("Project bundle contains invalid project metadata.");
  }
  if (pads.length !== BANKS.length * 16) {
    throw new Error("Project bundle must contain one pad for each bank position.");
  }
  const padIds = new Set<string>();
  const positions = new Set<string>();
  const midiNotes = new Set<number>();
  for (const pad of pads) {
    const position = `${pad.bank}:${pad.padIndex}`;
    if (
      !pad.id ||
      pad.projectId !== project.id ||
      !BANKS.includes(pad.bank) ||
      !isIntegerInRange(pad.padIndex, 0, 15) ||
      padIds.has(pad.id) ||
      positions.has(position)
    ) {
      throw new Error("Project bundle contains invalid or duplicate pad data.");
    }
    if (pad.midiNote !== undefined && midiNotes.has(pad.midiNote)) {
      throw new Error("Project bundle contains duplicate MIDI note assignments.");
    }
    padIds.add(pad.id);
    positions.add(position);
    if (pad.midiNote !== undefined) midiNotes.add(pad.midiNote);
  }
  const sampleIds = new Set<string>();
  for (const { sample, blob } of samples) {
    if (
      !sample.id ||
      sample.projectId !== project.id ||
      sampleIds.has(sample.id) ||
      !/^[a-f0-9]{64}$/i.test(sample.hash) ||
      !sample.name ||
      !sample.mimeType ||
      !Number.isFinite(sample.size) ||
      sample.size <= 0 ||
      !Number.isFinite(sample.createdAt) ||
      sample.createdAt < 0 ||
      !Number.isFinite(sample.updatedAt) ||
      sample.updatedAt < 0
    ) {
      throw new Error("Project bundle contains invalid or duplicate sample data.");
    }
    if (!blob || blob.size <= 0) {
      throw new Error(`Project bundle is missing sample file data for ${sample.name || "unnamed sample"}.`);
    }
    if (blob.size !== sample.size) {
      throw new Error(`Project bundle sample file size does not match metadata for ${sample.name}.`);
    }
    if ((await sha256Blob(blob)).toLowerCase() !== sample.hash.toLowerCase()) {
      throw new Error(`Project bundle sample file hash does not match metadata for ${sample.name}.`);
    }
    sampleIds.add(sample.id);
  }
  if (pads.some((pad) => pad.sampleId && !sampleIds.has(pad.sampleId))) {
    throw new Error("Project bundle contains pad sample references that do not exist.");
  }
  const mappingIds = new Set<string>();
  const mappingNames = new Set<string>();
  for (const mapping of mappings) {
    const mappingTargets = new Set<string>();
    if (
      !mapping.id ||
      !mapping.name ||
      mappingIds.has(mapping.id) ||
      mappingNames.has(mapping.name) ||
      !Number.isFinite(mapping.updatedAt) ||
      mapping.updatedAt < 0 ||
      Object.entries(mapping.mappings).some(([note, target]) => {
        const midiNote = Number(note);
        const targetKey = `${target.bank}:${target.padIndex}`;
        const invalid =
          !/^(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-7])$/.test(note) ||
          !isIntegerInRange(midiNote, 0, 127) ||
          !BANKS.includes(target.bank) ||
          !isIntegerInRange(target.padIndex, 0, 15) ||
          mappingTargets.has(targetKey);
        mappingTargets.add(targetKey);
        return invalid;
      })
    ) {
      throw new Error("Project bundle contains invalid MIDI mapping data.");
    }
    mappingIds.add(mapping.id);
    mappingNames.add(mapping.name);
  }
}
