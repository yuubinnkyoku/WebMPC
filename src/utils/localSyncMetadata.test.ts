import { describe, expect, it } from "vitest";
import { stripProjectRemoteId, stripSampleRemoteFileId } from "./localSyncMetadata";

describe("local sync metadata stripping", () => {
  it("removes local remote project ids from portable project data", () => {
    expect(
      stripProjectRemoteId({
        id: "project_1",
        name: "Kit",
        bpm: 120,
        createdAt: 1,
        updatedAt: 2,
        version: 3,
        remoteId: "remote_1"
      })
    ).toEqual({
      id: "project_1",
      name: "Kit",
      bpm: 120,
      createdAt: 1,
      updatedAt: 2,
      version: 3
    });
  });

  it("removes remote sample file ids from portable sample data", () => {
    expect(
      stripSampleRemoteFileId({
        id: "sample_1",
        projectId: "project_1",
        hash: "hash",
        name: "kick.wav",
        mimeType: "audio/wav",
        size: 4,
        durationMs: 250,
        createdAt: 1,
        updatedAt: 2,
        remoteFileId: "remote_file_1"
      })
    ).toEqual({
      id: "sample_1",
      projectId: "project_1",
      hash: "hash",
      name: "kick.wav",
      mimeType: "audio/wav",
      size: 4,
      durationMs: 250,
      createdAt: 1,
      updatedAt: 2
    });
  });
});
