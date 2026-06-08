import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { exportProject, importProjectFile, parseExportedProject } from "./exportImport";
import {
  applyMidiMapping,
  createProject,
  db,
  deleteSample,
  deleteProject,
  ensureDefaultMapping,
  getPads,
  getProject,
  getSampleBlob,
  getSamples,
  getSyncMetadata,
  importSample,
  savePad,
  saveSyncMetadata,
  updateProject,
  updateSampleDuration
} from "./storage";

async function resetDatabase(): Promise<void> {
  await db.delete();
  await db.open();
}

describe("local storage and project bundles", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("creates a project with four pad banks and MPD218 defaults on bank A", async () => {
    const project = await createProject("Storage test");
    const pads = await getPads(project.id);

    expect(pads).toHaveLength(64);
    expect(pads.filter((pad) => pad.bank === "A")).toHaveLength(16);
    expect(pads.find((pad) => pad.bank === "A" && pad.padIndex === 0)?.midiNote).toBe(36);
    expect(pads.find((pad) => pad.bank === "A" && pad.padIndex === 15)?.midiNote).toBe(51);
  });

  it("stores sample metadata and audio blobs outside Zustand state", async () => {
    const project = await createProject("Sample test");
    const file = new File([new Uint8Array([1, 2, 3, 4])], "kick.wav", { type: "audio/wav" });
    const sample = await importSample(project.id, file, 100);
    const samples = await getSamples(project.id);
    const blob = await getSampleBlob(sample.id);

    expect(samples).toHaveLength(1);
    expect(samples[0]?.name).toBe("kick.wav");
    expect(blob?.size).toBe(4);
  });

  it("keeps project, pad assignment, and sample blob available after reopening IndexedDB", async () => {
    const project = await createProject("Reload test");
    const file = new File([new Uint8Array([4, 3, 2, 1])], "reload.wav", { type: "audio/wav" });
    const sample = await importSample(project.id, file, 150);
    const pads = await getPads(project.id);
    const targetPad = pads.find((pad) => pad.bank === "A" && pad.padIndex === 4);
    expect(targetPad).toBeDefined();
    await savePad({ ...targetPad!, sampleId: sample.id, gain: 0.8 });

    db.close();
    await db.open();

    const reloadedProject = await getProject(project.id);
    const reloadedPads = await getPads(project.id);
    const reloadedSamples = await getSamples(project.id);
    const reloadedBlob = await getSampleBlob(sample.id);
    const reloadedPad = reloadedPads.find((pad) => pad.id === targetPad!.id);

    expect(reloadedProject?.name).toBe("Reload test");
    expect(reloadedSamples[0]?.name).toBe("reload.wav");
    expect(reloadedBlob?.size).toBe(4);
    expect(reloadedPad?.sampleId).toBe(sample.id);
    expect(reloadedPad?.gain).toBe(0.8);
  });

  it("rejects non-audio sample files before storing blobs", async () => {
    const project = await createProject("Reject sample test");
    const file = new File([new Uint8Array([1, 2, 3, 4])], "notes.txt", { type: "text/plain" });

    await expect(importSample(project.id, file)).rejects.toThrow("Sample file must be an audio file.");
    expect(await getSamples(project.id)).toHaveLength(0);
  });

  it("deletes sample metadata, blobs, and pad assignments", async () => {
    const project = await createProject("Delete sample test");
    const file = new File([new Uint8Array([5, 6, 7])], "clap.wav", { type: "audio/wav" });
    const sample = await importSample(project.id, file, 120);
    const pads = await getPads(project.id);
    const targetPad = pads.find((pad) => pad.bank === "A" && pad.padIndex === 2);
    expect(targetPad).toBeDefined();
    await savePad({ ...targetPad!, sampleId: sample.id });

    await deleteSample(sample.id);
    const samples = await getSamples(project.id);
    const blob = await getSampleBlob(sample.id);
    const updatedPads = await getPads(project.id);

    expect(samples).toHaveLength(0);
    expect(blob).toBeUndefined();
    expect(updatedPads.find((pad) => pad.id === targetPad!.id)?.sampleId).toBeUndefined();
  });

  it("updates decoded sample duration after audio loading", async () => {
    const project = await createProject("Duration test");
    const file = new File([new Uint8Array([1, 2, 3, 4])], "hat.wav", { type: "audio/wav" });
    const sample = await importSample(project.id, file);

    await updateSampleDuration(sample.id, 321);
    const samples = await getSamples(project.id);

    expect(samples[0]?.durationMs).toBe(321);
  });

  it("updates project metadata and increments the version", async () => {
    const project = await createProject("Metadata test");
    await updateProject({ ...project, name: "Renamed kit", bpm: 95 });

    const updated = await getProject(project.id);
    expect(updated?.name).toBe("Renamed kit");
    expect(updated?.bpm).toBe(95);
    expect(updated?.version).toBe(project.version + 1);
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
  });

  it("normalizes project metadata before saving", async () => {
    const project = await createProject("   ");
    expect(project.name).toBe("New kit");

    await updateProject({ ...project, name: "  ".padEnd(160, "x"), bpm: Number.NaN });
    const updated = await getProject(project.id);

    expect(updated?.name).toHaveLength(120);
    expect(updated?.bpm).toBe(120);
  });

  it("normalizes pad controls before saving", async () => {
    const project = await createProject("Normalize pad test");
    const pads = await getPads(project.id);
    const targetPad = pads.find((pad) => pad.bank === "A" && pad.padIndex === 0);
    expect(targetPad).toBeDefined();

    await savePad({
      ...targetPad!,
      gain: Number.NaN,
      pan: 2,
      pitch: -99,
      startMs: -10,
      endMs: Number.POSITIVE_INFINITY,
      midiNote: 128
    });
    const updatedPads = await getPads(project.id);
    const updatedPad = updatedPads.find((pad) => pad.id === targetPad!.id);

    expect(updatedPad?.gain).toBe(1);
    expect(updatedPad?.pan).toBe(1);
    expect(updatedPad?.pitch).toBe(-24);
    expect(updatedPad?.startMs).toBe(0);
    expect(updatedPad?.endMs).toBeUndefined();
    expect(updatedPad?.midiNote).toBeUndefined();
  });

  it("touches project metadata when pad state changes", async () => {
    const project = await createProject("Pad touch test");
    const pads = await getPads(project.id);
    const targetPad = pads.find((pad) => pad.bank === "A" && pad.padIndex === 0);
    expect(targetPad).toBeDefined();

    await savePad({ ...targetPad!, gain: 0.5 });
    const updated = await getProject(project.id);

    expect(updated?.version).toBe(project.version + 1);
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
  });

  it("deletes a project and its local pads, samples, blobs, and sync metadata", async () => {
    const project = await createProject("Delete project test");
    const file = new File([new Uint8Array([1, 9, 9])], "rim.wav", { type: "audio/wav" });
    const sample = await importSample(project.id, file, 90);
    await saveSyncMetadata({
      projectId: project.id,
      remoteId: "remote_delete",
      lastSyncedAt: 2000,
      remoteUpdatedAt: 1900
    });

    await deleteProject(project.id);

    expect(await getProject(project.id)).toBeUndefined();
    expect(await getPads(project.id)).toHaveLength(0);
    expect(await getSamples(project.id)).toHaveLength(0);
    expect(await getSampleBlob(sample.id)).toBeUndefined();
    expect(await getSyncMetadata(project.id)).toBeUndefined();
  });

  it("stores sync metadata for a project", async () => {
    const project = await createProject("Sync metadata test");
    await saveSyncMetadata({
      projectId: project.id,
      remoteId: "remote_1",
      lastSyncedAt: 1000,
      remoteUpdatedAt: 900
    });
    await saveSyncMetadata({
      projectId: project.id,
      remoteId: "remote_1",
      lastSyncedAt: 2000,
      remoteUpdatedAt: 1900
    });

    const metadata = await getSyncMetadata(project.id);
    expect(metadata?.remoteId).toBe("remote_1");
    expect(metadata?.lastSyncedAt).toBe(2000);
    expect(metadata?.remoteUpdatedAt).toBe(1900);
  });

  it("applies the default MPD218 MIDI mapping to project pads", async () => {
    const project = await createProject("Apply mapping test");
    const pads = await getPads(project.id);
    const firstPad = pads.find((pad) => pad.bank === "A" && pad.padIndex === 0);
    const lastPad = pads.find((pad) => pad.bank === "A" && pad.padIndex === 15);
    expect(firstPad).toBeDefined();
    expect(lastPad).toBeDefined();
    await savePad({ ...firstPad!, midiNote: undefined });
    await savePad({ ...lastPad!, midiNote: 99 });
    await ensureDefaultMapping();

    await applyMidiMapping(project.id);
    const updatedPads = await getPads(project.id);

    expect(updatedPads.find((pad) => pad.bank === "A" && pad.padIndex === 0)?.midiNote).toBe(36);
    expect(updatedPads.find((pad) => pad.bank === "A" && pad.padIndex === 15)?.midiNote).toBe(51);
  });

  it("exports and imports a project with pads and sample files", async () => {
    const project = await createProject("Bundle test");
    await db.projects.put({ ...project, remoteId: "remote_original" });
    const file = new File([new Uint8Array([9, 8, 7, 6])], "snare.wav", { type: "audio/wav" });
    const sample = await importSample(project.id, file, 250);
    await db.samples.put({ ...sample, remoteFileId: "remote_file_original" });
    const pads = await getPads(project.id);
    const targetPad = pads.find((pad) => pad.bank === "A" && pad.padIndex === 0);
    expect(targetPad).toBeDefined();
    await savePad({ ...targetPad!, sampleId: sample.id, gain: 0.75, pitch: 2 });

    const exported = await exportProject(project.id);
    expect(exported.samples[0]?.dataUrl).toContain("data:audio/wav");

    const bundle = new File([JSON.stringify(exported)], "bundle.webmpc.json", { type: "application/json" });
    const importedProject = await importProjectFile(bundle);
    const importedPads = await getPads(importedProject.id);
    const importedSamples = await getSamples(importedProject.id);
    const importedPad = importedPads.find((pad) => pad.bank === "A" && pad.padIndex === 0);
    const importedBlob = importedSamples[0] ? await getSampleBlob(importedSamples[0].id) : undefined;

    expect(importedProject.id).not.toBe(project.id);
    expect(importedProject.remoteId).toBeUndefined();
    expect(importedSamples).toHaveLength(1);
    expect(importedSamples[0]?.remoteFileId).toBeUndefined();
    expect(importedPad?.sampleId).toBe(importedSamples[0]?.id);
    expect(importedPad?.gain).toBe(0.75);
    expect(importedPad?.pitch).toBe(2);
    expect(importedBlob?.size).toBe(4);
  });

  it("rejects malformed project bundles before importing", async () => {
    expect(() => parseExportedProject("{")).toThrow("Project bundle is not valid JSON.");
    expect(() => parseExportedProject(JSON.stringify({ format: "other" }))).toThrow("Unsupported project export format.");
    expect(() => parseExportedProject(JSON.stringify({ format: "webmpc-project", project: {}, pads: [], samples: [], midiMappings: [] }))).toThrow(
      "Project bundle is missing project metadata."
    );
    expect(() =>
      parseExportedProject(
        JSON.stringify({
          format: "webmpc-project",
          project: { id: "project_1", name: "Broken", bpm: 120 },
          pads: {},
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle is missing pad, sample, or MIDI mapping arrays.");
    expect(() =>
      parseExportedProject(
        JSON.stringify({
          format: "webmpc-project",
          project: { id: "project_1", name: "Broken", bpm: 999 },
          pads: [],
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle is missing project metadata.");
    expect(() =>
      parseExportedProject(
        JSON.stringify({
          format: "webmpc-project",
          project: { id: "project_1", name: "Broken", bpm: 120 },
          pads: [],
          samples: [
            {
              id: "sample_1",
              projectId: "project_1",
              hash: "hash",
              name: "kick.wav",
              mimeType: "audio/wav",
              size: 4,
              dataUrl: "https://example.com/kick.wav"
            }
          ],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains invalid sample data.");
    expect(() =>
      parseExportedProject(
        JSON.stringify({
          format: "webmpc-project",
          project: { id: "project_1", name: "Broken", bpm: 120 },
          pads: [
            {
              id: "pad_1",
              projectId: "project_1",
              bank: "A",
              padIndex: 0,
              sampleId: "missing_sample",
              gain: 1,
              pan: 0,
              pitch: 0,
              startMs: 0,
              oneShot: true,
              updatedAt: 1
            }
          ],
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains pad sample references that do not exist.");
    expect(() =>
      parseExportedProject(
        JSON.stringify({
          format: "webmpc-project",
          project: { id: "project_1", name: "Broken", bpm: 120 },
          pads: [
            {
              id: "pad_1",
              projectId: "project_2",
              bank: "A",
              padIndex: 0,
              gain: 1,
              pan: 0,
              pitch: 0,
              startMs: 0,
              oneShot: true,
              updatedAt: 1
            }
          ],
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains data for a different project.");
    expect(() =>
      parseExportedProject(
        JSON.stringify({
          format: "webmpc-project",
          project: { id: "project_1", name: "Broken", bpm: 120 },
          pads: [],
          samples: [
            {
              id: "sample_1",
              projectId: "project_2",
              hash: "hash",
              name: "kick.wav",
              mimeType: "audio/wav",
              size: 4
            }
          ],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains data for a different project.");
    expect(() =>
      parseExportedProject(
        JSON.stringify({
          format: "webmpc-project",
          project: { id: "project_1", name: "Broken", bpm: 120 },
          pads: [
            {
              id: "pad_1",
              projectId: "project_1",
              bank: "A",
              padIndex: 16,
              midiNote: 128,
              gain: 1,
              pan: 0,
              pitch: 0,
              startMs: 0,
              oneShot: true,
              updatedAt: 1
            }
          ],
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains invalid pad data.");
    expect(() =>
      parseExportedProject(
        JSON.stringify({
          format: "webmpc-project",
          project: { id: "project_1", name: "Broken", bpm: 120 },
          pads: [],
          samples: [],
          midiMappings: [{ id: "mapping_1", name: "Bad", mappings: { "36": { bank: "A", padIndex: 99 } }, updatedAt: 1 }]
        })
      )
    ).toThrow("Project bundle contains invalid MIDI mapping data.");
  });
});
