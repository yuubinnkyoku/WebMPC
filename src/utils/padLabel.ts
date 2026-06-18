import type { Pad, Sample } from "../types/models";
import { formatSampleName } from "./sampleLoadMessage";

export function formatPadSampleLabel(sample?: Sample): string {
  return sample ? formatSampleName(sample.name) : "Empty";
}

export function formatPadMidiLabel(pad: Pick<Pad, "midiNote">): string {
  return pad.midiNote !== undefined ? `MIDI ${pad.midiNote}` : "No MIDI";
}

export function formatPadAriaLabel(pad: Pick<Pad, "bank" | "padIndex" | "midiNote">, sample?: Sample, shortcut?: string): string {
  return `Pad ${pad.bank}${pad.padIndex + 1}, ${formatPadSampleLabel(sample)}, ${formatPadMidiLabel(pad)}${shortcut ? `, shortcut ${shortcut}` : ""}`;
}
