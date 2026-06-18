import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Blob } from "../utils/hash";
import { exportProject, formatProjectExportFilename, importProjectFile, parseExportedProject, validateProjectBundlePayload } from "./exportImport";
import {
  applyMidiMapping,
  createProject,
  db,
  deleteSample,
  deleteProject,
  ensureDefaultMapping,
  getPads,
  getProject,
  getMidiMappings,
  getSampleBlob,
  getSamples,
  getSyncMetadata,
  importSample,
  replaceProjectBundle,
  saveMidiMapping,
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

  it("rejects empty audio sample files before storing blobs", async () => {
    const project = await createProject("Reject empty sample test");
    const file = new File([], "empty.wav", { type: "audio/wav" });

    await expect(importSample(project.id, file)).rejects.toThrow("Sample file must not be empty.");
    expect(await getSamples(project.id)).toHaveLength(0);
  });

  it("rejects sample imports for missing projects without orphaned records", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "orphan.wav", { type: "audio/wav" });

    await expect(importSample("project_missing", file)).rejects.toThrow("Project not found.");

    expect(await db.samples.toArray()).toHaveLength(0);
    expect(await db.sampleBlobs.toArray()).toHaveLength(0);
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
    const invalidDurationFile = new File([new Uint8Array([4, 3, 2, 1])], "bad-duration.wav", { type: "audio/wav" });
    const invalidDurationSample = await importSample(project.id, invalidDurationFile, Number.NaN);
    expect(invalidDurationSample.durationMs).toBeUndefined();

    const file = new File([new Uint8Array([1, 2, 3, 4])], "hat.wav", { type: "audio/wav" });
    const sample = await importSample(project.id, file);
    await updateSampleDuration(sample.id, 321);
    await updateSampleDuration(invalidDurationSample.id, -10);
    const samples = await getSamples(project.id);

    expect(samples.find((item) => item.id === sample.id)?.durationMs).toBe(321);
    expect(samples.find((item) => item.id === invalidDurationSample.id)?.durationMs).toBeUndefined();
  });

  it("updates project metadata and increments the version", async () => {
    const project = await createProject("Metadata test");
    await updateProject({ ...project, name: "  Metadata test  " });
    expect((await getProject(project.id))?.version).toBe(project.version);

    await updateProject({ ...project, name: "Renamed kit", bpm: 95 });
    await updateProject({ ...project, name: "Renamed again", bpm: 96 });

    const updated = await getProject(project.id);
    expect(updated?.name).toBe("Renamed again");
    expect(updated?.bpm).toBe(96);
    expect(updated?.version).toBe(project.version + 2);
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
  });

  it("preserves immutable and sync-owned project fields during metadata updates", async () => {
    const project = await createProject("Immutable project");
    await db.projects.put({ ...project, remoteId: "remote_1" });

    await updateProject({
      ...project,
      name: "Updated project",
      createdAt: 999,
      updatedAt: 999,
      version: 999,
      remoteId: "remote_tampered"
    });

    expect(await getProject(project.id)).toMatchObject({
      name: "Updated project",
      createdAt: project.createdAt,
      version: project.version + 1,
      remoteId: "remote_1"
    });
  });

  it("normalizes project metadata before saving", async () => {
    const project = await createProject("   ");
    expect(project.name).toBe("New kit");

    await updateProject({ ...project, name: "  ".padEnd(160, "x"), bpm: Number.NaN });
    const updated = await getProject(project.id);

    expect(updated?.name).toHaveLength(120);
    expect(updated?.bpm).toBe(120);
  });

  it("rejects updates and sync metadata for missing projects", async () => {
    const missingProject = {
      id: "project_missing",
      name: "Missing",
      bpm: 120,
      createdAt: 1,
      updatedAt: 1,
      version: 1
    };

    await expect(updateProject(missingProject)).rejects.toThrow("Project not found.");
    await expect(saveSyncMetadata({ projectId: missingProject.id, remoteId: "remote_missing" })).rejects.toThrow("Project not found.");

    expect(await db.projects.toArray()).toHaveLength(0);
    expect(await db.syncMetadata.toArray()).toHaveLength(0);
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

  it("rejects missing pads and cross-project sample assignments", async () => {
    const firstProject = await createProject("First project");
    const secondProject = await createProject("Second project");
    const sample = await importSample(secondProject.id, new File([new Uint8Array([1, 2, 3])], "other.wav", { type: "audio/wav" }));
    const firstPads = await getPads(firstProject.id);
    const targetPad = firstPads.find((pad) => pad.bank === "A" && pad.padIndex === 0);
    expect(targetPad).toBeDefined();
    const beforeProject = await getProject(firstProject.id);

    await expect(savePad({ ...targetPad!, id: "pad_missing" })).rejects.toThrow("Pad not found.");
    await expect(savePad({ ...targetPad!, projectId: "project_missing" })).rejects.toThrow("Pad identity cannot be changed.");
    await expect(savePad({ ...targetPad!, bank: "B" })).rejects.toThrow("Pad identity cannot be changed.");
    await expect(savePad({ ...targetPad!, padIndex: 1 })).rejects.toThrow("Pad identity cannot be changed.");
    await expect(savePad({ ...targetPad!, sampleId: "sample_missing" })).rejects.toThrow("Assigned sample does not belong to this project.");
    await expect(savePad({ ...targetPad!, sampleId: sample.id })).rejects.toThrow("Assigned sample does not belong to this project.");

    expect(await getPads(firstProject.id)).toEqual(firstPads);
    expect(await getProject(firstProject.id)).toEqual(beforeProject);
  });

  it("touches project metadata when pad state changes", async () => {
    const project = await createProject("Pad touch test");
    const pads = await getPads(project.id);
    const targetPad = pads.find((pad) => pad.bank === "A" && pad.padIndex === 0);
    expect(targetPad).toBeDefined();

    await savePad({ ...targetPad! });
    expect((await getProject(project.id))?.version).toBe(project.version);

    await savePad({ ...targetPad!, gain: 0.5 });
    const updated = await getProject(project.id);

    expect(updated?.version).toBe(project.version + 1);
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(project.updatedAt);
  });

  it("moves a MIDI note assignment to the most recently saved pad", async () => {
    const project = await createProject("MIDI note move test");
    const pads = await getPads(project.id);
    const firstPad = pads.find((pad) => pad.bank === "A" && pad.padIndex === 0);
    const secondPad = pads.find((pad) => pad.bank === "A" && pad.padIndex === 1);
    expect(firstPad?.midiNote).toBe(36);
    expect(secondPad).toBeDefined();

    await savePad({ ...secondPad!, midiNote: 36 });

    const updatedPads = await getPads(project.id);
    expect(updatedPads.find((pad) => pad.id === firstPad?.id)?.midiNote).toBeUndefined();
    expect(updatedPads.find((pad) => pad.id === secondPad?.id)?.midiNote).toBe(36);
    expect((await getProject(project.id))?.version).toBe(project.version + 1);
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

  it("normalizes sync metadata before saving", async () => {
    const project = await createProject("Sync metadata normalize test");
    await saveSyncMetadata({
      projectId: project.id,
      remoteId: "   ",
      lastSyncedAt: Number.NaN,
      remoteUpdatedAt: Number.POSITIVE_INFINITY
    });

    const metadata = await getSyncMetadata(project.id);
    expect(metadata?.remoteId).toBeUndefined();
    expect(metadata?.lastSyncedAt).toBeUndefined();
    expect(metadata?.remoteUpdatedAt).toBeUndefined();
  });

  it("clears stale sync metadata when replacing a project bundle", async () => {
    const project = await createProject("Replace bundle test");
    const pads = await getPads(project.id);
    const replacementBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/wav" });
    const sample: Awaited<ReturnType<typeof importSample>> = {
      id: "sample_replaced",
      projectId: project.id,
      hash: await sha256Blob(replacementBlob),
      name: "replaced.wav",
      mimeType: "audio/wav",
      size: 4,
      durationMs: Number.NaN,
      createdAt: 1,
      updatedAt: 1
    };
    await saveSyncMetadata({
      projectId: project.id,
      remoteId: "remote_replace",
      lastSyncedAt: 1000,
      remoteUpdatedAt: 900
    });

    await replaceProjectBundle(
      { ...project, name: "  Replaced bundle  ", bpm: Number.NaN },
      pads.map((pad, index) => (index === 0 ? { ...pad, gain: Number.NaN, pan: -2, midiNote: 200 } : pad)),
      [{ sample, blob: replacementBlob }],
      []
    );

    const replacedPads = await getPads(project.id);
    const replacedSamples = await getSamples(project.id);
    expect(await getSyncMetadata(project.id)).toBeUndefined();
    expect((await getProject(project.id))?.name).toBe("Replaced bundle");
    expect((await getProject(project.id))?.bpm).toBe(120);
    expect(replacedPads.find((pad) => pad.id === pads[0]?.id)?.gain).toBe(1);
    expect(replacedPads.find((pad) => pad.id === pads[0]?.id)?.pan).toBe(-1);
    expect(replacedPads.find((pad) => pad.id === pads[0]?.id)?.midiNote).toBeUndefined();
    expect(replacedSamples[0]?.durationMs).toBeUndefined();
  });

  it("rolls back a project bundle replacement when a write fails", async () => {
    const project = await createProject("Rollback bundle test");
    const file = new File([new Uint8Array([7, 8, 9])], "original.wav", { type: "audio/wav" });
    const sample = await importSample(project.id, file, 100);
    const pads = await getPads(project.id);
    const targetPad = pads.find((pad) => pad.bank === "A" && pad.padIndex === 0);
    expect(targetPad).toBeDefined();
    await savePad({ ...targetPad!, sampleId: sample.id });
    const beforeProject = await getProject(project.id);
    const beforePads = await getPads(project.id);

    vi.spyOn(db.pads, "bulkPut").mockRejectedValueOnce(new Error("injected write failure"));
    await expect(
      replaceProjectBundle(
        { ...project, name: "Should roll back" },
        pads,
        [{ sample, blob: file }],
        []
      )
    ).rejects.toThrow("injected write failure");

    expect(await getProject(project.id)).toEqual(beforeProject);
    expect(await getPads(project.id)).toEqual(beforePads);
    expect(await getSamples(project.id)).toEqual([sample]);
    expect((await getSampleBlob(sample.id))?.size).toBe(file.size);
  });

  it("rejects malformed replacement bundles before changing existing data", async () => {
    const project = await createProject("Invalid bundle test");
    const pads = await getPads(project.id);
    const beforeProject = await getProject(project.id);
    const beforePads = await getPads(project.id);
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/wav" });
    const sample = {
      id: "sample_bundle",
      projectId: project.id,
      hash: await sha256Blob(blob),
      name: "bundle.wav",
      mimeType: "audio/wav",
      size: 4,
      createdAt: 1,
      updatedAt: 1
    };

    await expect(replaceProjectBundle(project, pads.slice(1), [], [])).rejects.toThrow(
      "Project bundle must contain one pad for each bank position."
    );
    await expect(
      replaceProjectBundle(project, pads.map((pad, index) => (index === 1 ? { ...pad, id: pads[0]!.id } : pad)), [], [])
    ).rejects.toThrow("Project bundle contains invalid or duplicate pad data.");
    await expect(
      replaceProjectBundle(
        project,
        pads.map((pad, index) => (index < 2 ? { ...pad, midiNote: 36 } : pad)),
        [],
        []
      )
    ).rejects.toThrow("Project bundle contains duplicate MIDI note assignments.");
    await expect(
      replaceProjectBundle(project, pads.map((pad, index) => (index === 0 ? { ...pad, sampleId: sample.id } : pad)), [{ sample }], [])
    ).rejects.toThrow("Project bundle is missing sample file data for bundle.wav.");
    await expect(
      replaceProjectBundle(
        project,
        pads,
        [{ sample, blob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }) }],
        []
      )
    ).rejects.toThrow("Project bundle sample file size does not match metadata for bundle.wav.");
    await expect(
      replaceProjectBundle(
        project,
        pads,
        [{ sample, blob: new Blob([new Uint8Array([4, 3, 2, 1])], { type: "audio/wav" }) }],
        []
      )
    ).rejects.toThrow("Project bundle sample file hash does not match metadata for bundle.wav.");
    await expect(
      replaceProjectBundle(
        project,
        pads.map((pad, index) => (index === 0 ? { ...pad, sampleId: "sample_missing" } : pad)),
        [{ sample, blob }],
        []
      )
    ).rejects.toThrow("Project bundle contains pad sample references that do not exist.");
    await expect(
      replaceProjectBundle(project, pads, [], [
        {
          id: "mapping_invalid",
          name: "Invalid",
          mappings: { "128": { bank: "A", padIndex: 0 } },
          updatedAt: 1
        }
      ])
    ).rejects.toThrow("Project bundle contains invalid MIDI mapping data.");
    await expect(
      replaceProjectBundle(project, pads, [], [
        { id: "mapping_duplicate", name: "One", mappings: {}, updatedAt: 1 },
        { id: "mapping_duplicate", name: "Two", mappings: {}, updatedAt: 1 }
      ])
    ).rejects.toThrow("Project bundle contains invalid MIDI mapping data.");

    expect(await getProject(project.id)).toEqual(beforeProject);
    expect(await getPads(project.id)).toEqual(beforePads);
    expect(await getSamples(project.id)).toHaveLength(0);
  });

  it("does not overwrite pad or sample IDs owned by another project", async () => {
    const firstProject = await createProject("Bundle owner one");
    const secondProject = await createProject("Bundle owner two");
    const firstPads = await getPads(firstProject.id);
    const secondPads = await getPads(secondProject.id);
    const secondFile = new File([new Uint8Array([9, 8, 7, 6])], "owned.wav", { type: "audio/wav" });
    const secondSample = await importSample(secondProject.id, secondFile);
    const beforeFirstPads = await getPads(firstProject.id);
    const beforeSecondPads = await getPads(secondProject.id);
    const beforeSecondSamples = await getSamples(secondProject.id);

    await expect(
      replaceProjectBundle(
        firstProject,
        firstPads.map((pad, index) => (index === 0 ? { ...pad, id: secondPads[0]!.id } : pad)),
        [],
        []
      )
    ).rejects.toThrow("Project bundle contains a pad ID owned by another project.");

    await expect(
      replaceProjectBundle(
        firstProject,
        firstPads,
        [{ sample: { ...secondSample, projectId: firstProject.id }, blob: secondFile }],
        []
      )
    ).rejects.toThrow("Project bundle contains a sample ID owned by another project.");

    expect(await getPads(firstProject.id)).toEqual(beforeFirstPads);
    expect(await getPads(secondProject.id)).toEqual(beforeSecondPads);
    expect(await getSamples(secondProject.id)).toEqual(beforeSecondSamples);
    expect((await getSampleBlob(secondSample.id))?.size).toBe(secondFile.size);
  });

  it("does not overwrite a MIDI mapping ID owned by a different mapping", async () => {
    const project = await createProject("Mapping owner project");
    const pads = await getPads(project.id);
    await saveMidiMapping({
      id: "mapping_owned",
      name: "Existing mapping",
      mappings: {},
      updatedAt: 1
    });

    await expect(
      replaceProjectBundle(project, pads, [], [
        {
          id: "mapping_owned",
          name: "Imported mapping",
          mappings: {},
          updatedAt: 1
        }
      ])
    ).rejects.toThrow("Project bundle contains a MIDI mapping ID owned by another mapping.");

    expect(await getMidiMappings()).toEqual([
      {
        id: "mapping_owned",
        name: "Existing mapping",
        mappings: {},
        updatedAt: expect.any(Number)
      }
    ]);
  });

  it("validates MIDI mappings and keeps mapping names unique", async () => {
    const mapping = {
      id: "mapping_custom",
      name: "  Custom mapping  ",
      deviceName: "  Controller  ",
      mappings: {
        "36": { bank: "A" as const, padIndex: 0 }
      },
      updatedAt: 1
    };
    await saveMidiMapping(mapping);
    const saved = (await getMidiMappings())[0];
    expect(saved).toMatchObject({
      id: "mapping_custom",
      name: "Custom mapping",
      deviceName: "Controller"
    });
    const savedUpdatedAt = saved?.updatedAt;

    await saveMidiMapping({ ...mapping, name: "Custom mapping", deviceName: "Controller" });
    expect((await getMidiMappings())[0]?.updatedAt).toBe(savedUpdatedAt);

    await expect(
      saveMidiMapping({ ...mapping, id: "mapping_duplicate_name", name: "Custom mapping" })
    ).rejects.toThrow('MIDI mapping "Custom mapping" already exists.');
    await expect(
      saveMidiMapping({ ...mapping, id: "mapping_bad_note", name: "Bad note", mappings: { "128": { bank: "A", padIndex: 0 } } })
    ).rejects.toThrow("MIDI mapping contains an invalid or duplicate target.");
    await expect(
      saveMidiMapping({
        ...mapping,
        id: "mapping_duplicate_target",
        name: "Duplicate target",
        mappings: {
          "36": { bank: "A", padIndex: 0 },
          "37": { bank: "A", padIndex: 0 }
        }
      })
    ).rejects.toThrow("MIDI mapping contains an invalid or duplicate target.");
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

  it("clears mapped MPD218 notes from non-target pads", async () => {
    const project = await createProject("Mapping duplicate cleanup");
    const pads = await getPads(project.id);
    const bankBPad = pads.find((pad) => pad.bank === "B" && pad.padIndex === 0);
    expect(bankBPad).toBeDefined();
    await db.pads.put({ ...bankBPad!, midiNote: 36 });
    await ensureDefaultMapping();

    await applyMidiMapping(project.id);

    const updatedPads = await getPads(project.id);
    expect(updatedPads.find((pad) => pad.bank === "A" && pad.padIndex === 0)?.midiNote).toBe(36);
    expect(updatedPads.find((pad) => pad.id === bankBPad?.id)?.midiNote).toBeUndefined();
  });

  it("rejects mapping application for missing projects", async () => {
    await ensureDefaultMapping();
    await expect(applyMidiMapping("project_missing")).rejects.toThrow("Project not found.");
  });

  it("does not touch the project when applying an already-current MIDI mapping", async () => {
    const project = await createProject("No-op mapping test");
    await ensureDefaultMapping();

    await applyMidiMapping(project.id);
    const unchanged = await getProject(project.id);

    expect(unchanged?.version).toBe(project.version);
    expect(unchanged?.updatedAt).toBe(project.updatedAt);
  });

  it("exports and imports a project with pads and sample files", async () => {
    const project = await createProject("Bundle test");
    await ensureDefaultMapping();
    await db.projects.put({ ...project, remoteId: "remote_original" });
    const file = new File([new Uint8Array([9, 8, 7, 6])], "snare.wav", { type: "audio/wav" });
    const sample = await importSample(project.id, file, 250);
    await db.samples.put({ ...sample, remoteFileId: "remote_file_original" });
    const pads = await getPads(project.id);
    const targetPad = pads.find((pad) => pad.bank === "A" && pad.padIndex === 0);
    expect(targetPad).toBeDefined();
    await savePad({ ...targetPad!, sampleId: sample.id, gain: 0.75, pitch: 2 });

    const exported = await exportProject(project.id);
    expect(exported.project.remoteId).toBeUndefined();
    expect(exported.samples[0]?.dataUrl).toContain("data:audio/wav");
    expect(exported.samples[0]?.remoteFileId).toBeUndefined();

    const beforeImport = Date.now();
    exported.project.name = "  ".padEnd(160, "x");
    const bundle = new File([JSON.stringify(exported)], "bundle.webmpc.json", { type: "application/json" });
    const importedProject = await importProjectFile(bundle);
    await importProjectFile(bundle);
    const importedPads = await getPads(importedProject.id);
    const importedSamples = await getSamples(importedProject.id);
    const importedPad = importedPads.find((pad) => pad.bank === "A" && pad.padIndex === 0);
    const importedBlob = importedSamples[0] ? await getSampleBlob(importedSamples[0].id) : undefined;
    const midiMappings = await getMidiMappings();

    expect(importedProject.id).not.toBe(project.id);
    expect(importedProject.remoteId).toBeUndefined();
    expect(importedProject.name).toHaveLength(120);
    expect(importedProject.createdAt).toBeGreaterThanOrEqual(beforeImport);
    expect(importedProject.updatedAt).toBeGreaterThanOrEqual(beforeImport);
    expect(importedSamples).toHaveLength(1);
    expect(importedSamples[0]?.remoteFileId).toBeUndefined();
    expect(importedSamples[0]?.createdAt).toBeGreaterThanOrEqual(beforeImport);
    expect(importedSamples[0]?.updatedAt).toBeGreaterThanOrEqual(beforeImport);
    expect(importedPad?.sampleId).toBe(importedSamples[0]?.id);
    expect(importedPad?.gain).toBe(0.75);
    expect(importedPad?.pitch).toBe(2);
    expect(importedBlob?.size).toBe(4);
    expect(midiMappings.filter((mapping) => mapping.name === "MPD218 default")).toHaveLength(1);
  });

  it("rejects project export when sample file data is missing locally", async () => {
    const project = await createProject("Missing blob export test");
    const file = new File([new Uint8Array([1, 2, 3, 4])], "missing.wav", { type: "audio/wav" });
    const sample = await importSample(project.id, file);
    await db.sampleBlobs.delete(sample.id);

    await expect(exportProject(project.id)).rejects.toThrow("Unable to export missing sample file data for 1 sample: missing.wav");
  });

  it("formats project export filenames", () => {
    expect(formatProjectExportFilename("  Live Set!  ")).toBe("live-set.webmpc.json");
    expect(formatProjectExportFilename("テスト Kit ０１")).toBe("テスト-kit-01.webmpc.json");
    expect(formatProjectExportFilename("!!!")).toBe("webmpc.webmpc.json");
  });

  it("rejects malformed project bundles before importing", async () => {
    const validProject = { id: "project_1", name: "Broken", bpm: 120, createdAt: 1, updatedAt: 1, version: 1 };
    const projectBundle = (payload: Record<string, unknown>) =>
      JSON.stringify({
        format: "webmpc-project",
        exportedAt: 1,
        ...payload
      });
    const validSample = {
      id: "sample_1",
      projectId: "project_1",
      hash: "a".repeat(64),
      name: "kick.wav",
      mimeType: "audio/wav",
      size: 4,
      dataUrl: "data:audio/wav;base64,AQIDBA==",
      createdAt: 1,
      updatedAt: 1
    };
    const validPads = ["A", "B", "C", "D"].flatMap((bank) =>
      Array.from({ length: 16 }, (_, padIndex) => ({
        id: `pad_${bank}_${padIndex}`,
        projectId: "project_1",
        bank,
        padIndex,
        gain: 1,
        pan: 0,
        pitch: 0,
        startMs: 0,
        oneShot: true,
        updatedAt: 1
      }))
    );

    expect(() => parseExportedProject("{")).toThrow("Project bundle is not valid JSON.");
    expect(() => parseExportedProject(JSON.stringify({ format: "other" }))).toThrow("Unsupported project export format.");
    expect(() => parseExportedProject(JSON.stringify({ format: "webmpc-project", exportedAt: Number.NaN }))).toThrow(
      "Project bundle is missing export metadata."
    );
    expect(() => parseExportedProject(projectBundle({ project: {}, pads: [], samples: [], midiMappings: [] }))).toThrow(
      "Project bundle is missing project metadata."
    );
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: {},
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle is missing pad, sample, or MIDI mapping arrays.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: { ...validProject, bpm: 999 },
          pads: validPads,
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle is missing project metadata.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: [],
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle must contain one pad for each bank position.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads.map((pad, index) => (index < 2 ? { ...pad, midiNote: 36 } : pad)),
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains duplicate MIDI note assignments.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads.map((pad, index) => (index === 1 ? { ...pad, bank: "A", padIndex: 0 } : pad)),
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle must contain one pad for each bank position.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads,
          samples: [
            {
              ...validSample,
              hash: "not-a-sha256"
            }
          ],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains invalid sample data.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads,
          samples: [
            {
              ...validSample,
              size: 0
            }
          ],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains invalid sample data.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads,
          samples: [
            {
              ...validSample,
              dataUrl: undefined
            }
          ],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains invalid sample data.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads,
          samples: [
            {
              ...validSample,
              dataUrl: "data:audio/wav;base64,"
            }
          ],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains invalid sample data.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads,
          samples: [
            {
              ...validSample,
              dataUrl: "https://example.com/kick.wav"
            }
          ],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains invalid sample data.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads.map((pad, index) => (index === 0 ? { ...pad, sampleId: "missing_sample" } : pad)),
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains pad sample references that do not exist.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads.map((pad, index) => (index === 0 ? { ...pad, projectId: "project_2" } : pad)),
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains data for a different project.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads,
          samples: [
            {
              ...validSample,
              projectId: "project_2",
            }
          ],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains data for a different project.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads.map((pad, index) => (index === 0 ? { ...pad, padIndex: 16, midiNote: 128 } : pad)),
          samples: [],
          midiMappings: []
        })
      )
    ).toThrow("Project bundle contains invalid pad data.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads,
          samples: [],
          midiMappings: [{ id: "mapping_1", name: "Bad", mappings: { "36": { bank: "A", padIndex: 99 } }, updatedAt: 1 }]
        })
      )
    ).toThrow("Project bundle contains invalid MIDI mapping data.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads,
          samples: [],
          midiMappings: [{ id: "mapping_1", name: "Bad", mappings: { "": { bank: "A", padIndex: 0 } }, updatedAt: 1 }]
        })
      )
    ).toThrow("Project bundle contains invalid MIDI mapping data.");
    expect(() =>
      parseExportedProject(
        projectBundle({
          project: validProject,
          pads: validPads,
          samples: [],
          midiMappings: [{
            id: "mapping_1",
            name: "Duplicate target",
            mappings: { "36": { bank: "A", padIndex: 0 }, "37": { bank: "A", padIndex: 0 } },
            updatedAt: 1
          }]
        })
      )
    ).toThrow("Project bundle contains invalid MIDI mapping data.");

    expect(() =>
      validateProjectBundlePayload({
        project: validProject,
        pads: validPads,
        samples: [{ ...validSample, dataUrl: undefined }],
        midiMappings: []
      })
    ).not.toThrow();
  });
});
