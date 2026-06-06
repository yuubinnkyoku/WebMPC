import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { exportProject, importProjectFile } from "./exportImport";
import {
  createProject,
  db,
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

  it("exports and imports a project with pads and sample files", async () => {
    const project = await createProject("Bundle test");
    const file = new File([new Uint8Array([9, 8, 7, 6])], "snare.wav", { type: "audio/wav" });
    const sample = await importSample(project.id, file, 250);
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
    expect(importedSamples).toHaveLength(1);
    expect(importedPad?.sampleId).toBe(importedSamples[0]?.id);
    expect(importedPad?.gain).toBe(0.75);
    expect(importedPad?.pitch).toBe(2);
    expect(importedBlob?.size).toBe(4);
  });
});
