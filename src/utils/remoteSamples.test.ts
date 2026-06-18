import { describe, expect, it } from "vitest";
import { findMissingSampleBlobNames, mapRemoteSamplesBySampleId, shouldPruneRemoteSample } from "./remoteSamples";

describe("remote sample pruning", () => {
  it("keeps records for samples that still exist locally", () => {
    expect(shouldPruneRemoteSample({ sampleId: "sample_1" }, new Set(["sample_1"]))).toBe(false);
  });

  it("prunes records for samples deleted locally", () => {
    expect(shouldPruneRemoteSample({ sampleId: "sample_2" }, new Set(["sample_1"]))).toBe(true);
  });

  it("prunes malformed records without a sample id", () => {
    expect(shouldPruneRemoteSample({}, new Set(["sample_1"]))).toBe(true);
  });

  it("maps remote records by sample id while keeping the first duplicate", () => {
    const first = { id: "record_1", sampleId: "sample_1" };
    const duplicate = { id: "record_2", sampleId: "sample_1" };
    const second = { id: "record_3", sampleId: "sample_2" };

    expect([...mapRemoteSamplesBySampleId([{}, first, duplicate, second]).entries()]).toEqual([
      ["sample_1", first],
      ["sample_2", second]
    ]);
  });

  it("finds local samples whose blob records are missing", () => {
    const blob = new Blob([new Uint8Array([1])], { type: "audio/wav" });

    expect(
      findMissingSampleBlobNames(
        [
          { id: "sample_1", name: "kick.wav" },
          { id: "sample_2", name: "snare.wav" },
          { id: "sample_3", name: "hat.wav" }
        ],
        [{ blob }, undefined, {}]
      )
    ).toEqual(["snare.wav", "hat.wav"]);
  });
});
