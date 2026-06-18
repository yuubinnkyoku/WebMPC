import type { Bank, Pad } from "../types/models";

export function getVisiblePads(pads: Pad[], selectedBank: Bank): Pad[] {
  return pads.filter((pad) => pad.bank === selectedBank).sort((a, b) => a.padIndex - b.padIndex);
}
