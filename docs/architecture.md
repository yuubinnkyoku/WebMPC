# Architecture

WebMPC is a routing-free Vite React app split into UI, state, storage, audio, MIDI, sync, and import/export modules.

## UI Layer

Components live in `src/components`.

- `ProjectList` creates and selects local projects.
- `ProjectEditor` owns the main workspace.
- `PadGrid` and `PadButton` render the 4x4 banked pad surface.
- `SamplePanel` imports audio, assigns samples, edits pad parameters, and starts MIDI Learn.
- `MidiPanel` and `MidiMonitor` request Web MIDI access and show incoming messages.
- `AudioSetupButton` starts the browser audio engine after a user gesture.
- `SyncPanel` exposes optional PocketBase sign-in and manual sync.
- `SettingsPanel` handles project import/export.

## State Layer

`src/store/useAppStore.ts` uses Zustand for UI/session state only:

- current project ID
- selected bank and pad
- MIDI inputs and monitor messages
- audio and sync status
- MIDI Learn state
- transient pad trigger feedback
- visible errors

Audio blobs and decoded buffers are intentionally kept out of Zustand.

## Storage Layer

`src/services/storage.ts` wraps Dexie and IndexedDB tables:

- `projects`
- `pads`
- `samples`
- `sampleBlobs`
- `midiMappings`
- `syncMetadata`

Project creation seeds four banks of sixteen pads. Bank A includes an MPD218-style note preset for notes 36-51.

## Audio Layer

`src/services/audio.ts` creates `AudioContext` only from the `Start Audio` user action. It decodes local sample blobs into `AudioBuffer`s and sends sample channel data to `public/sample-worklet.js` when AudioWorklet is available. The Worklet processor handles one-shot voices, pitch, pan, velocity gain, start/end trimming, choke groups, and short fades. If AudioWorklet loading fails, the same pad trigger path falls back to `AudioBufferSourceNode`.

## MIDI Layer

`src/services/midi.ts` wraps Web MIDI:

- requests access from a user action
- lists inputs
- subscribes to note and control messages
- treats note-on velocity zero as note-off in labels
- feeds messages to the monitor and pad trigger logic

MIDI Learn updates the selected pad's note mapping in IndexedDB.

## Sync Layer

`src/services/sync.ts` uses PocketBase only when `VITE_POCKETBASE_URL` is configured. Local IndexedDB remains authoritative while playing. Manual sync uploads project metadata, pads, sample metadata, and sample files.

## Import / Export

`src/services/exportImport.ts` exports `.webmpc.json` bundles with metadata and sample blobs encoded as data URLs. Import creates new IDs to avoid overwriting existing local projects.
