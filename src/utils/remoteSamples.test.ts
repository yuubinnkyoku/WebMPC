import { describe, expect, it } from "vitest";
import { shouldPruneRemoteSample } from "./remoteSamples";

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
});
