import type { ExportedProject, MidiMapping, Pad, Project, Sample } from "../types/models";
import { dataUrlToBlob, blobToDataUrl, downloadJson, isAudioDataUrl } from "../utils/file";
import { makeId } from "../utils/id";
import { db, getMidiMappings, replaceProjectBundle } from "./storage";

export async function exportProject(projectId: string): Promise<ExportedProject> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error("Project not found.");
  const pads = await db.pads.where("projectId").equals(projectId).toArray();
  const samples = await db.samples.where("projectId").equals(projectId).toArray();
  const blobs = await db.sampleBlobs.where("projectId").equals(projectId).toArray();
  const blobBySample = new Map(blobs.map((entry) => [entry.sampleId, entry.blob]));
  const samplesWithData = await Promise.all(
    samples.map(async (sample) => ({
      ...sample,
      dataUrl: blobBySample.has(sample.id) ? await blobToDataUrl(blobBySample.get(sample.id) as Blob) : undefined
    }))
  );
  return {
    format: "webmpc-project",
    exportedAt: Date.now(),
    project,
    pads,
    samples: samplesWithData,
    midiMappings: await getMidiMappings()
  };
}

export async function downloadProject(projectId: string): Promise<void> {
  const exported = await exportProject(projectId);
  downloadJson(`${exported.project.name.replaceAll(/\W+/g, "-").toLowerCase() || "webmpc"}.webmpc.json`, exported);
}

export async function importProjectFile(file: File): Promise<Project> {
  const parsed = parseExportedProject(await file.text());
  const now = Date.now();
  const idMap = new Map<string, string>();
  const project: Project = { ...stripProjectRemoteId(parsed.project), id: makeId("project"), name: `${parsed.project.name} import`, updatedAt: now };
  const samples = await Promise.all(
    parsed.samples.map(async (sample) => {
      const newId = makeId("sample");
      idMap.set(sample.id, newId);
      const importedSample: Sample = { ...stripSampleRemoteId(sample), id: newId, projectId: project.id, updatedAt: now };
      return { sample: importedSample, blob: sample.dataUrl ? await dataUrlToBlob(sample.dataUrl) : undefined };
    })
  );
  const pads: Pad[] = parsed.pads.map((pad) => ({
    ...pad,
    id: makeId("pad"),
    projectId: project.id,
    sampleId: pad.sampleId ? idMap.get(pad.sampleId) : undefined,
    updatedAt: now
  }));
  const mappings: MidiMapping[] = parsed.midiMappings.map((mapping) => ({ ...mapping, id: makeId("mapping"), updatedAt: now }));
  await replaceProjectBundle(project, pads, samples, mappings);
  return project;
}

function stripProjectRemoteId(project: Project): Omit<Project, "remoteId"> {
  return {
    id: project.id,
    name: project.name,
    bpm: project.bpm,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    version: project.version
  };
}

function stripSampleRemoteId(sample: Sample & { dataUrl?: string }): Omit<Sample, "remoteFileId"> {
  return {
    id: sample.id,
    projectId: sample.projectId,
    hash: sample.hash,
    name: sample.name,
    mimeType: sample.mimeType,
    size: sample.size,
    durationMs: sample.durationMs,
    createdAt: sample.createdAt,
    updatedAt: sample.updatedAt
  };
}

export function parseExportedProject(text: string): ExportedProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Project bundle is not valid JSON.");
  }
  if (!isRecord(parsed) || parsed.format !== "webmpc-project") {
    throw new Error("Unsupported project export format.");
  }
  validateProjectBundlePayload({
    project: parsed.project,
    pads: parsed.pads,
    samples: parsed.samples,
    midiMappings: parsed.midiMappings
  });
  return parsed as ExportedProject;
}

export function validateProjectBundlePayload(payload: { project: unknown; pads: unknown; samples: unknown; midiMappings?: unknown }): void {
  if (
    !isRecord(payload.project) ||
    typeof payload.project.id !== "string" ||
    typeof payload.project.name !== "string" ||
    !isFiniteNumber(payload.project.bpm) ||
    payload.project.bpm < 20 ||
    payload.project.bpm > 300
  ) {
    throw new Error("Project bundle is missing project metadata.");
  }
  const midiMappings = payload.midiMappings ?? [];
  if (!Array.isArray(payload.pads) || !Array.isArray(payload.samples) || !Array.isArray(midiMappings)) {
    throw new Error("Project bundle is missing pad, sample, or MIDI mapping arrays.");
  }
  if (!payload.pads.every(isExportedPad)) {
    throw new Error("Project bundle contains invalid pad data.");
  }
  if (!payload.samples.every(isExportedSample)) {
    throw new Error("Project bundle contains invalid sample data.");
  }
  if (!midiMappings.every(isExportedMidiMapping)) {
    throw new Error("Project bundle contains invalid MIDI mapping data.");
  }
  const samples = payload.samples as Sample[];
  const pads = payload.pads as Pad[];
  const project = payload.project as Project;
  if (pads.some((pad) => pad.projectId !== project.id) || samples.some((sample) => sample.projectId !== project.id)) {
    throw new Error("Project bundle contains data for a different project.");
  }
  const sampleIds = new Set(samples.map((sample) => sample.id));
  if (pads.some((pad) => pad.sampleId !== undefined && !sampleIds.has(pad.sampleId))) {
    throw new Error("Project bundle contains pad sample references that do not exist.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isExportedPad(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    (value.bank === "A" || value.bank === "B" || value.bank === "C" || value.bank === "D") &&
    isIntegerInRange(value.padIndex, 0, 15) &&
    isFiniteNumber(value.gain) &&
    value.gain >= 0 &&
    value.gain <= 1.5 &&
    isFiniteNumber(value.pan) &&
    value.pan >= -1 &&
    value.pan <= 1 &&
    isFiniteNumber(value.pitch) &&
    value.pitch >= -24 &&
    value.pitch <= 24 &&
    isFiniteNumber(value.startMs) &&
    value.startMs >= 0 &&
    typeof value.oneShot === "boolean" &&
    (value.sampleId === undefined || typeof value.sampleId === "string") &&
    (value.midiNote === undefined || isIntegerInRange(value.midiNote, 0, 127)) &&
    (value.endMs === undefined || (isFiniteNumber(value.endMs) && value.endMs >= 0)) &&
    (value.chokeGroup === undefined || typeof value.chokeGroup === "string")
  );
}

function isExportedSample(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.hash === "string" &&
    typeof value.name === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.size === "number" &&
    (value.dataUrl === undefined || (typeof value.dataUrl === "string" && isAudioDataUrl(value.dataUrl)))
  );
}

function isExportedMidiMapping(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isRecord(value.mappings) &&
    Object.values(value.mappings).every(isMidiMappingTarget)
  );
}

function isMidiMappingTarget(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.bank === "A" || value.bank === "B" || value.bank === "C" || value.bank === "D") &&
    isIntegerInRange(value.padIndex, 0, 15)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
