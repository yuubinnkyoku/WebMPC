export type Bank = "A" | "B" | "C" | "D";

export type Project = {
  id: string;
  name: string;
  bpm: number;
  createdAt: number;
  updatedAt: number;
  version: number;
  remoteId?: string;
};

export type Pad = {
  id: string;
  projectId: string;
  bank: Bank;
  padIndex: number;
  midiNote?: number;
  sampleId?: string;
  gain: number;
  pan: number;
  pitch: number;
  startMs: number;
  endMs?: number;
  chokeGroup?: string;
  oneShot: boolean;
  updatedAt: number;
};

export type Sample = {
  id: string;
  projectId: string;
  hash: string;
  name: string;
  mimeType: string;
  size: number;
  durationMs?: number;
  createdAt: number;
  updatedAt: number;
  remoteFileId?: string;
};

export type SampleBlob = {
  sampleId: string;
  projectId: string;
  blob: Blob;
  updatedAt: number;
};

export type MidiMapping = {
  id: string;
  name: string;
  deviceName?: string;
  mappings: Record<string, { bank: Bank; padIndex: number }>;
  updatedAt: number;
};

export type SyncMetadata = {
  id: string;
  projectId: string;
  remoteId?: string;
  lastSyncedAt?: number;
  remoteUpdatedAt?: number;
  updatedAt: number;
};

export type MidiMessage = {
  id: string;
  receivedAt: number;
  inputName: string;
  status: number;
  command: number;
  channel: number;
  data1: number;
  data2: number;
  label: string;
};

export type ExportedProject = {
  format: "webmpc-project";
  exportedAt: number;
  project: Project;
  pads: Pad[];
  samples: Array<Sample & { dataUrl?: string }>;
  midiMappings: MidiMapping[];
};
