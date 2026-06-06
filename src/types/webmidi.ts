export type MidiInput = {
  id: string;
  name?: string;
  manufacturer?: string;
  state?: string;
  connection?: string;
  onmidimessage: ((event: MidiMessageEventLike) => void) | null;
};

export type MidiMessageEventLike = {
  data: Uint8Array;
  timeStamp: number;
  currentTarget: MidiInput | null;
};

export type MidiAccess = {
  inputs: { values: () => Iterable<MidiInput> };
  onstatechange: ((event: { port: MidiInput }) => void) | null;
};

export type MidiCapableNavigator = {
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MidiAccess>;
};
