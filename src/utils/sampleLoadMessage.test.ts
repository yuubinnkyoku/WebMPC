import { describe, expect, it } from "vitest";
import { formatSampleLoadFailureMessage, formatSampleName } from "./sampleLoadMessage";

describe("sample load failure messages", () => {
  it("formats sample names for error messages", () => {
    expect(formatSampleName("  kick.wav  ")).toBe("kick.wav");
    expect(formatSampleName("   ")).toBe("Unnamed sample");
  });

  it("returns no message when every sample loaded", () => {
    expect(formatSampleLoadFailureMessage("Unable to load", [])).toBeUndefined();
  });

  it("uses singular copy for one failed sample", () => {
    expect(formatSampleLoadFailureMessage("Unable to load", ["kick.wav"])).toBe("Unable to load 1 sample: kick.wav");
  });

  it("falls back for blank failed sample names", () => {
    expect(formatSampleLoadFailureMessage("Unable to load", ["   "])).toBe("Unable to load 1 sample: Unnamed sample");
  });

  it("limits long failed sample lists", () => {
    expect(formatSampleLoadFailureMessage("Imported project, but could not load", ["a.wav", "b.wav", "c.wav", "d.wav", "e.wav"])).toBe(
      "Imported project, but could not load 5 samples: a.wav, b.wav, c.wav, and 2 more"
    );
  });
});
