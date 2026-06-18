import { describe, expect, it } from "vitest";
import type { MidiMessage } from "../types/models";
import { MIDI_HISTORY_LIMIT, prependMidiMessage } from "./midiHistory";

function message(id: string): MidiMessage {
  return {
    id,
    receivedAt: 1,
    inputName: "input",
    status: 0x90,
    command: 0x90,
    channel: 0,
    data1: 36,
    data2: 100,
    label: id
  };
}

describe("MIDI history", () => {
  it("puts the newest message first", () => {
    expect(prependMidiMessage([message("old")], message("new")).map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("keeps at most the configured history limit", () => {
    const existing = Array.from({ length: MIDI_HISTORY_LIMIT }, (_, index) => message(`old_${index}`));

    const next = prependMidiMessage(existing, message("new"));

    expect(next).toHaveLength(MIDI_HISTORY_LIMIT);
    expect(next[0]?.id).toBe("new");
    expect(next.at(-1)?.id).toBe("old_28");
  });

  it("handles zero or negative limits as empty history", () => {
    expect(prependMidiMessage([message("old")], message("new"), 0)).toEqual([]);
    expect(prependMidiMessage([message("old")], message("new"), -1)).toEqual([]);
  });
});
