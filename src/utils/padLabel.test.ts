import { describe, expect, it } from "vitest";
import { formatPadAriaLabel, formatPadMidiLabel, formatPadSampleLabel } from "./padLabel";

describe("pad labels", () => {
  const pad = {
    bank: "A" as const,
    padIndex: 0,
    midiNote: 36
  };

  it("formats empty and assigned sample labels", () => {
    expect(formatPadSampleLabel()).toBe("Empty");
    expect(formatPadSampleLabel({ name: "  kick.wav  " } as never)).toBe("kick.wav");
    expect(formatPadSampleLabel({ name: "   " } as never)).toBe("Unnamed sample");
  });

  it("formats MIDI labels", () => {
    expect(formatPadMidiLabel({ midiNote: 36 })).toBe("MIDI 36");
    expect(formatPadMidiLabel({})).toBe("No MIDI");
  });

  it("formats pad aria labels with optional shortcuts", () => {
    expect(formatPadAriaLabel(pad, { name: "kick.wav" } as never, "1")).toBe("Pad A1, kick.wav, MIDI 36, shortcut 1");
    expect(formatPadAriaLabel({ ...pad, midiNote: undefined }, undefined)).toBe("Pad A1, Empty, No MIDI");
  });
});
