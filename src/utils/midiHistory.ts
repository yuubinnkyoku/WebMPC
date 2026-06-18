import type { MidiMessage } from "../types/models";

export const MIDI_HISTORY_LIMIT = 30;

export function prependMidiMessage(messages: MidiMessage[], message: MidiMessage, limit = MIDI_HISTORY_LIMIT): MidiMessage[] {
  return [message, ...messages].slice(0, Math.max(0, limit));
}
