import type { Bank, MidiMapping } from "../types/models";

export const MPD218_BANK: Bank = "A";
export const MPD218_NOTES = [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51];
export const MPD218_MAPPING_NAME = "MPD218 default";
export const MPD218_DEVICE_NAME = "MPD218";

export function getMpd218NoteForPad(bank: Bank, padIndex: number): number | undefined {
  return bank === MPD218_BANK ? MPD218_NOTES[padIndex] : undefined;
}

export function createMpd218Mappings(): MidiMapping["mappings"] {
  return Object.fromEntries(MPD218_NOTES.map((note, index) => [String(note), { bank: MPD218_BANK, padIndex: index }]));
}
