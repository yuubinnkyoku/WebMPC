import { create } from "zustand";
import type { AudioEngineState } from "../services/audio";
import type { Bank, MidiMessage } from "../types/models";

type SyncViewState = {
  configured: boolean;
  signedIn: boolean;
  syncing: boolean;
  message: string;
};

type AppState = {
  currentProjectId?: string;
  selectedBank: Bank;
  selectedPadIndex: number;
  midiEnabled: boolean;
  midiInputs: string[];
  midiMessages: MidiMessage[];
  learningPad?: { bank: Bank; padIndex: number };
  audio: AudioEngineState;
  sync: SyncViewState;
  triggeredPads: Record<string, number>;
  error?: string;
  setCurrentProjectId: (id?: string) => void;
  setSelectedBank: (bank: Bank) => void;
  setSelectedPadIndex: (index: number) => void;
  setMidi: (enabled: boolean, inputs: string[]) => void;
  pushMidiMessage: (message: MidiMessage) => void;
  setLearningPad: (pad?: { bank: Bank; padIndex: number }) => void;
  setAudio: (audio: AudioEngineState) => void;
  setSync: (sync: SyncViewState) => void;
  flashPad: (bank: Bank, padIndex: number) => void;
  setError: (error?: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  selectedBank: "A",
  selectedPadIndex: 0,
  midiEnabled: false,
  midiInputs: [],
  midiMessages: [],
  audio: { ready: false, usingWorklet: false, message: "Audio stopped" },
  sync: { configured: false, signedIn: false, syncing: false, message: "PocketBase is not configured" },
  triggeredPads: {},
  setCurrentProjectId: (id) => set({ currentProjectId: id }),
  setSelectedBank: (bank) => set({ selectedBank: bank }),
  setSelectedPadIndex: (index) => set({ selectedPadIndex: index }),
  setMidi: (enabled, inputs) => set({ midiEnabled: enabled, midiInputs: inputs }),
  pushMidiMessage: (message) =>
    set((state) => ({ midiMessages: [message, ...state.midiMessages].slice(0, 30) })),
  setLearningPad: (pad) => set({ learningPad: pad }),
  setAudio: (audio) => set({ audio }),
  setSync: (sync) => set({ sync }),
  flashPad: (bank, padIndex) => {
    const key = `${bank}:${padIndex}`;
    set((state) => ({ triggeredPads: { ...state.triggeredPads, [key]: Date.now() } }));
    window.setTimeout(() => {
      set((state) => {
        const next = { ...state.triggeredPads };
        delete next[key];
        return { triggeredPads: next };
      });
    }, 180);
  },
  setError: (error) => set({ error })
}));
