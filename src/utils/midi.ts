export function isNoteOn(command: number, velocity: number): boolean {
  return command === 0x90 && velocity > 0;
}

export function isNoteOff(command: number, velocity: number): boolean {
  return command === 0x80 || (command === 0x90 && velocity === 0);
}

export function velocityToGain(velocity: number): number {
  return Math.max(0, Math.min(1, velocity / 127));
}

export function labelMidiMessage(command: number, data1: number, data2: number): string {
  if (isNoteOn(command, data2)) return `Note on ${data1} velocity ${data2}`;
  if (isNoteOff(command, data2)) return `Note off ${data1}`;
  if (command === 0xb0) return `CC ${data1} value ${data2}`;
  return `MIDI ${command.toString(16)} ${data1} ${data2}`;
}
