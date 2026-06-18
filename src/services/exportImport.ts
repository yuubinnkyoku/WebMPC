import type { ExportedProject, MidiMapping, Pad, Project, Sample } from "../types/models";
import { dataUrlToBlob, blobToDataUrl, downloadJson, isAudioDataUrl } from "../utils/file";
import { makeId } from "../utils/id";
import { stripProjectRemoteId, stripSampleRemoteFileId } from "../utils/localSyncMetadata";
import { normalizeProjectName } from "../utils/projectName";
import { findMissingSampleBlobNames } from "../utils/remoteSamples";
import { formatSampleLoadFailureMessage } from "../utils/sampleLoadMessage";
import { db, getMidiMappings, replaceProjectBundle } from "./storage";

export async function exportProject(projectId: string): Promise<ExportedProject> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error("Project not found.");
  const pads = await db.pads.where("projectId").equals(projectId).toArray();
  const samples = await db.samples.where("projectId").equals(projectId).toArray();
  const blobs = await db.sampleBlobs.where("projectId").equals(projectId).toArray();
  const blobBySample = new Map(blobs.map((entry) => [entry.sampleId, entry.blob]));
  const missingBlobNames = findMissingSampleBlobNames(samples, samples.map((sample) => ({ blob: blobBySample.get(sample.id) })));
  if (missingBlobNames.length > 0) {
    throw new Error(formatSampleLoadFailureMessage("Unable to export missing sample file data for", missingBlobNames) ?? "Unable to export missing sample file data.");
  }
  const samplesWithData = await Promise.all(
    samples.map(async (sample) => ({
      ...stripSampleRemoteFileId(sample),
      dataUrl: await blobToDataUrl(blobBySample.get(sample.id) as Blob)
    }))
  );
  return {
    format: "webmpc-project",
    exportedAt: Date.now(),
    project: stripProjectRemoteId(project),
    pads,
    samples: samplesWithData,
    midiMappings: await getMidiMappings()
  };
}

export async function downloadProject(projectId: string): Promise<void> {
  const exported = await exportProject(projectId);
  downloadJson(formatProjectExportFilename(exported.project.name), exported);
}

export function formatProjectExportFilename(projectName: string): string {
  const slug = projectName
    .trim()
    .normalize("NFKC")
    .replaceAll(/[^\p{L}\p{N}_]+/gu, "-")
    .replaceAll(/^-+|-+$/g, "")
    .toLowerCase();
  return `${slug || "webmpc"}.webmpc.json`;
}

export async function importProjectFile(file: File): Promise<Project> {
  const parsed = parseExportedProject(await file.text());
  const now = Date.now();
  const idMap = new Map<string, string>();
  const project: Project = {
    ...stripProjectRemoteId(parsed.project),
    id: makeId("project"),
    name: normalizeProjectName(`${parsed.project.name} import`),
    createdAt: now,
    updatedAt: now
  };
  const samples = await Promise.all(
    parsed.samples.map(async (sample) => {
      const newId = makeId("sample");
      idMap.set(sample.id, newId);
      const importedSample: Sample = { ...stripSampleRemoteFileId(sample), id: newId, projectId: project.id, createdAt: now, updatedAt: now };
      return { sample: importedSample, blob: await dataUrlToBlob(sample.dataUrl) };
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
  if (!isFiniteNumber(parsed.exportedAt) || parsed.exportedAt < 0) {
    throw new Error("Project bundle is missing export metadata.");
  }
  validateProjectBundlePayload({
    project: parsed.project,
    pads: parsed.pads,
    samples: parsed.samples,
    midiMappings: parsed.midiMappings,
    requireSampleDataUrl: true
  });
  return parsed as ExportedProject;
}

export function validateProjectBundlePayload(payload: { project: unknown; pads: unknown; samples: unknown; midiMappings?: unknown; requireSampleDataUrl?: boolean }): void {
  if (
    !isRecord(payload.project) ||
    typeof payload.project.id !== "string" ||
    typeof payload.project.name !== "string" ||
    !isFiniteNumber(payload.project.bpm) ||
    payload.project.bpm < 20 ||
    payload.project.bpm > 300 ||
    !isFiniteNumber(payload.project.createdAt) ||
    payload.project.createdAt < 0 ||
    !isFiniteNumber(payload.project.updatedAt) ||
    payload.project.updatedAt < 0 ||
    !isIntegerInRange(payload.project.version, 1, Number.MAX_SAFE_INTEGER)
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
  if (!payload.samples.every((sample) => isExportedSample(sample, Boolean(payload.requireSampleDataUrl)))) {
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
  if (!hasCompletePadSet(pads)) {
    throw new Error("Project bundle must contain one pad for each bank position.");
  }
  const midiNotes = pads.flatMap((pad) => (pad.midiNote === undefined ? [] : [pad.midiNote]));
  if (new Set(midiNotes).size !== midiNotes.length) {
    throw new Error("Project bundle contains duplicate MIDI note assignments.");
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
    isFiniteNumber(value.updatedAt) &&
    value.updatedAt >= 0 &&
    (value.sampleId === undefined || typeof value.sampleId === "string") &&
    (value.midiNote === undefined || isIntegerInRange(value.midiNote, 0, 127)) &&
    (value.endMs === undefined || (isFiniteNumber(value.endMs) && value.endMs >= 0)) &&
    (value.chokeGroup === undefined || typeof value.chokeGroup === "string")
  );
}

function isExportedSample(value: unknown, requireDataUrl: boolean): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.hash === "string" &&
    /^[a-f0-9]{64}$/i.test(value.hash) &&
    typeof value.name === "string" &&
    typeof value.mimeType === "string" &&
    isFiniteNumber(value.size) &&
    value.size > 0 &&
    (value.durationMs === undefined || (isFiniteNumber(value.durationMs) && value.durationMs >= 0)) &&
    isFiniteNumber(value.createdAt) &&
    value.createdAt >= 0 &&
    isFiniteNumber(value.updatedAt) &&
    value.updatedAt >= 0 &&
    (requireDataUrl ? typeof value.dataUrl === "string" && isAudioDataUrl(value.dataUrl) : value.dataUrl === undefined || (typeof value.dataUrl === "string" && isAudioDataUrl(value.dataUrl)))
  );
}

function isExportedMidiMapping(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isRecord(value.mappings) ||
    !Object.keys(value.mappings).every(isMidiNoteKey) ||
    !Object.values(value.mappings).every(isMidiMappingTarget) ||
    !isFiniteNumber(value.updatedAt) ||
    value.updatedAt < 0
  ) {
    return false;
  }
  const targets = Object.values(value.mappings).map((target) => {
    const mappingTarget = target as { bank: string; padIndex: number };
    return `${mappingTarget.bank}:${mappingTarget.padIndex}`;
  });
  return new Set(targets).size === targets.length;
}

function isMidiMappingTarget(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.bank === "A" || value.bank === "B" || value.bank === "C" || value.bank === "D") &&
    isIntegerInRange(value.padIndex, 0, 15)
  );
}

function isMidiNoteKey(value: string): boolean {
  return /^(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-7])$/.test(value);
}

function hasCompletePadSet(pads: Pad[]): boolean {
  if (pads.length !== 64) return false;
  const positions = new Set(pads.map((pad) => `${pad.bank}:${pad.padIndex}`));
  return positions.size === 64;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
