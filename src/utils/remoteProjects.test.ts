import { describe, expect, it } from "vitest";
import { toRemoteProjectSummary } from "./remoteProjects";

describe("remote project summaries", () => {
  it("uses project metadata when available", () => {
    expect(
      toRemoteProjectSummary({
        id: "remote_1",
        project: { name: "  Live set  ", updatedAt: 1000 },
        samples: [{ id: "sample_1" }, { id: "sample_2" }],
        updated: "2026-06-13 05:30:00.000Z"
      })
    ).toEqual({
      id: "remote_1",
      name: "Live set",
      updatedAt: 1000,
      sampleCount: 2
    });
  });

  it("falls back for missing or malformed project metadata", () => {
    expect(
      toRemoteProjectSummary({
        id: "remote_2",
        project: { name: "  ", updatedAt: Number.NaN },
        samples: "bad",
        updated: "2026-06-13 05:30:00.000Z"
      })
    ).toEqual({
      id: "remote_2",
      name: "Untitled remote project",
      updatedAt: Date.parse("2026-06-13 05:30:00.000Z"),
      sampleCount: 0
    });
  });

  it("keeps invalid remote timestamps unknown", () => {
    expect(
      toRemoteProjectSummary({
        id: "remote_3",
        updated: "not a date"
      })
    ).toEqual({
      id: "remote_3",
      name: "Untitled remote project",
      updatedAt: undefined,
      sampleCount: 0
    });
  });
});
