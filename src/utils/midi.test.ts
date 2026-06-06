import { describe, expect, it } from "vitest";
import { isNoteOff, isNoteOn, labelMidiMessage, velocityToGain } from "./midi";

describe("midi utilities", () => {
  it("treats note-on with velocity as a note trigger", () => {
    expect(isNoteOn(0x90, 100)).toBe(true);
    expect(isNoteOn(0x90, 0)).toBe(false);
  });

  it("treats note-on velocity zero as note-off", () => {
    expect(isNoteOff(0x90, 0)).toBe(true);
    expect(isNoteOff(0x80, 64)).toBe(true);
  });

  it("normalizes MIDI velocity to gain", () => {
    expect(velocityToGain(127)).toBe(1);
    expect(velocityToGain(64)).toBeCloseTo(0.5039, 4);
    expect(velocityToGain(200)).toBe(1);
  });

  it("labels MIDI monitor messages", () => {
    expect(labelMidiMessage(0x90, 36, 127)).toBe("Note on 36 velocity 127");
    expect(labelMidiMessage(0xb0, 1, 32)).toBe("CC 1 value 32");
  });
});
