import type { ExportedProject, MidiMapping, Pad, Project, Sample } from "../types/models";
import { dataUrlToBlob, blobToDataUrl, downloadJson } from "../utils/file";
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
  const parsed = JSON.parse(await file.text()) as ExportedProject;
  if (parsed.format !== "webmpc-project") {
    throw new Error("Unsupported project export format.");
  }
  const now = Date.now();
  const idMap = new Map<string, string>();
  const project: Project = { ...parsed.project, id: makeId("project"), name: `${parsed.project.name} import`, updatedAt: now };
  const samples = await Promise.all(
    parsed.samples.map(async (sample) => {
      const newId = makeId("sample");
      idMap.set(sample.id, newId);
      const { dataUrl, ...rest } = sample;
      const importedSample: Sample = { ...rest, id: newId, projectId: project.id, updatedAt: now };
      return { sample: importedSample, blob: dataUrl ? await dataUrlToBlob(dataUrl) : undefined };
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
