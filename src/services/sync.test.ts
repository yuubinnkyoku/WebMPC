import { describe, expect, it } from "vitest";
import { assignRemoteProjectId, getSyncState, listRemoteProjects, restoreRemoteProject, signIn, syncProject, toRemoteSyncPayload, toRestoredProjectBundle } from "./sync";

describe("sync service without PocketBase configuration", () => {
  it("reports that PocketBase is not configured", () => {
    expect(getSyncState()).toEqual({
      configured: false,
      signedIn: false,
      syncing: false,
      message: "PocketBase is not configured"
    });
  });

  it("does not throw when manual sync is requested without configuration", async () => {
    await expect(syncProject("project_missing")).resolves.toMatchObject({
      configured: false,
      signedIn: false,
      message: "PocketBase is not configured"
    });
  });

  it("rejects remote-only operations without configuration", async () => {
    await expect(signIn("user@example.com", "password")).rejects.toThrow("PocketBase URL is not configured.");
    await expect(listRemoteProjects()).rejects.toThrow("PocketBase URL is not configured.");
    await expect(restoreRemoteProject("remote_1")).rejects.toThrow("PocketBase URL is not configured.");
  });

  it("strips local-only sync metadata from remote project payloads", () => {
    const payload = toRemoteSyncPayload(
      {
        id: "project_1",
        name: "Kit",
        bpm: 120,
        createdAt: 1,
        updatedAt: 2,
        version: 3,
        remoteId: "remote_project_1"
      },
      [
        {
          id: "pad_1",
          projectId: "project_1",
          bank: "A",
          padIndex: 0,
          gain: 1,
          pan: 0,
          pitch: 0,
          startMs: 0,
          oneShot: true,
          updatedAt: 2
        }
      ],
      [
        {
          id: "sample_1",
          projectId: "project_1",
          hash: "hash",
          name: "kick.wav",
          mimeType: "audio/wav",
          size: 4,
          createdAt: 1,
          updatedAt: 2,
          remoteFileId: "remote_file_1"
        }
      ]
    );

    expect(payload.project).not.toHaveProperty("remoteId");
    expect(payload.samples[0]).not.toHaveProperty("remoteFileId");
  });

  it("adds the remote id after sync without marking local content edited", () => {
    const project = {
      id: "project_1",
      name: "Kit",
      bpm: 120,
      createdAt: 1,
      updatedAt: 2,
      version: 3
    };

    expect(assignRemoteProjectId(project, "remote_project_1")).toEqual({
      ...project,
      remoteId: "remote_project_1"
    });
    expect(assignRemoteProjectId({ ...project, remoteId: "remote_project_1" }, "remote_project_1")).toBeUndefined();
  });

  it("remaps restored remote project data to fresh local ids", () => {
    const ids = ["project_local", "sample_local", "pad_local_1", "pad_local_2"];
    const bundle = toRestoredProjectBundle(
      "remote_project_1",
      {
        id: "project_remote",
        name: "  Remote Kit  ",
        bpm: 120,
        createdAt: 1,
        updatedAt: 2,
        version: 3,
        remoteId: "stale_remote_project"
      },
      [
        {
          id: "pad_remote_1",
          projectId: "project_remote",
          bank: "A",
          padIndex: 0,
          gain: 1,
          pan: 0,
          pitch: 0,
          startMs: 0,
          oneShot: true,
          sampleId: "sample_remote",
          updatedAt: 2
        },
        {
          id: "pad_remote_2",
          projectId: "project_remote",
          bank: "A",
          padIndex: 1,
          gain: 1,
          pan: 0,
          pitch: 0,
          startMs: 0,
          oneShot: true,
          sampleId: "missing_sample",
          updatedAt: 2
        }
      ],
      [
        {
          id: "sample_remote",
          projectId: "project_remote",
          hash: "hash",
          name: "kick.wav",
          mimeType: "audio/wav",
          size: 4,
          createdAt: 1,
          updatedAt: 2,
          remoteFileId: "stale_remote_file"
        }
      ],
      100,
      () => ids.shift() ?? "unexpected_id"
    );

    expect(bundle.project).toMatchObject({
      id: "project_local",
      remoteId: "remote_project_1",
      name: "Remote Kit restored",
      createdAt: 100,
      updatedAt: 100
    });
    expect(bundle.samples[0]).toEqual({
      id: "sample_local",
      projectId: "project_local",
      hash: "hash",
      name: "kick.wav",
      mimeType: "audio/wav",
      size: 4,
      durationMs: undefined,
      createdAt: 100,
      updatedAt: 100
    });
    expect(bundle.samples[0]).not.toHaveProperty("remoteFileId");
    expect(bundle.pads.map((pad) => ({ id: pad.id, projectId: pad.projectId, sampleId: pad.sampleId, updatedAt: pad.updatedAt }))).toEqual([
      { id: "pad_local_1", projectId: "project_local", sampleId: "sample_local", updatedAt: 100 },
      { id: "pad_local_2", projectId: "project_local", sampleId: undefined, updatedAt: 100 }
    ]);
  });
});
