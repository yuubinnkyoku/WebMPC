import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AudioEngineState } from "../services/audio";
import type { Bank, MidiMessage } from "../types/models";
import { prependMidiMessage } from "../utils/midiHistory";
import { defaultUserSettings, normalizeMasterGain, normalizeUserSettings, type UserSettings } from "../utils/settings";

type SyncViewState = {
  configured: boolean;
  signedIn: boolean;
  syncing: boolean;
  message: string;
};

type SettingsState = UserSettings;

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
  settings: SettingsState;
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
  setMasterGain: (masterGain: number) => void;
  flashPad: (bank: Bank, padIndex: number) => void;
  setError: (error?: string) => void;
};

type PersistedAppState = Pick<AppState, "settings">;

export const useAppStore = create<AppState>()(
  persist<AppState, [], [], PersistedAppState>((set) => ({
  selectedBank: "A",
  selectedPadIndex: 0,
  midiEnabled: false,
  midiInputs: [],
  midiMessages: [],
  audio: { ready: false, usingWorklet: false, message: "Audio stopped" },
  sync: { configured: false, signedIn: false, syncing: false, message: "PocketBase is not configured" },
  settings: defaultUserSettings,
  triggeredPads: {},
  setCurrentProjectId: (id) => set({ currentProjectId: id }),
  setSelectedBank: (bank) => set({ selectedBank: bank }),
  setSelectedPadIndex: (index) => set({ selectedPadIndex: index }),
  setMidi: (enabled, inputs) => set({ midiEnabled: enabled, midiInputs: inputs }),
  pushMidiMessage: (message) =>
    set((state) => ({ midiMessages: prependMidiMessage(state.midiMessages, message) })),
  setLearningPad: (pad) => set({ learningPad: pad }),
  setAudio: (audio) => set({ audio }),
  setSync: (sync) => set({ sync }),
  setMasterGain: (masterGain) => set({ settings: { masterGain: normalizeMasterGain(masterGain) } }),
  flashPad: (bank, padIndex) => {
    const key = `${bank}:${padIndex}`;
    const triggeredAt = Date.now();
    set((state) => ({ triggeredPads: { ...state.triggeredPads, [key]: triggeredAt } }));
    window.setTimeout(() => {
      set((state) => {
        if (state.triggeredPads[key] !== triggeredAt) return state;
        const next = { ...state.triggeredPads };
        delete next[key];
        return { triggeredPads: next };
      });
    }, 180);
  },
  setError: (error) => set({ error })
}), {
  name: "webmpc-settings",
  partialize: (state) => ({ settings: state.settings }),
  merge: (persistedState, currentState) => ({
    ...currentState,
    settings: normalizeUserSettings(
      typeof persistedState === "object" && persistedState !== null && "settings" in persistedState
        ? persistedState.settings
        : undefined
    )
  })
}));
