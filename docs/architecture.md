# Architecture

WebMPC is a routing-free Vite React app split into UI, state, storage, audio, MIDI, sync, and import/export modules.

## UI Layer

Components live in `src/components`.

- `ProjectList` creates and selects local projects.
- `ProjectEditor` owns the main workspace and project metadata editing.
- `PadGrid` and `PadButton` render the 4x4 banked pad surface.
- `SamplePanel` imports audio, assigns samples, shows sample and MIDI mapping metadata, edits pad parameters including trim, gain, pan, pitch, MIDI note, and choke group, and starts MIDI Learn.
- `MidiPanel` and `MidiMonitor` request Web MIDI access and show incoming messages.
- `AudioSetupButton` starts the browser audio engine after a user gesture.
- `SyncPanel` exposes optional PocketBase sign-in and manual sync.
- `SettingsPanel` handles project import/export.
- `SettingsPanel` exposes session settings such as master gain and also hosts import/export tools.

## State Layer

`src/store/useAppStore.ts` uses Zustand for UI/session state only:

- current project ID
- selected bank and pad
- MIDI inputs and monitor messages
- audio and sync status
- session settings such as master gain
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

`src/services/audio.ts` creates `AudioContext` only from the `Start Audio` user action. It decodes local sample blobs into `AudioBuffer`s, updates decoded sample duration metadata in IndexedDB, and sends sample channel data to `public/sample-worklet.js` when AudioWorklet is available. The Worklet processor handles one-shot voices, pitch, pan, velocity gain, start/end trimming, choke groups, and short fades. If AudioWorklet loading fails, the same pad trigger path falls back to `AudioBufferSourceNode`.

## MIDI Layer

`src/services/midi.ts` wraps Web MIDI:

- requests access from a user action
- lists inputs
- updates UI state when browser MIDI input ports change
- subscribes to note and control messages
- treats note-on velocity zero as note-off in labels
- feeds messages to the monitor and pad trigger logic

MIDI Learn updates the selected pad's note mapping in IndexedDB.

## Sync Layer

`src/services/sync.ts` uses PocketBase only when `VITE_POCKETBASE_URL` is configured. Local IndexedDB remains authoritative while playing. Manual sync uploads project metadata, pads, sample metadata, and sample files. The same service can list remote projects and restore one as a new local IndexedDB project, preserving existing local data while relinking the restored copy to the remote record. Sync and restore update the `syncMetadata` table with local last-sync and remote updated timestamps. When the remote timestamp is newer, sync avoids overwriting it and asks the user to restore the remote copy instead.

## Import / Export

`src/services/exportImport.ts` exports `.webmpc.json` bundles with metadata and sample blobs encoded as data URLs. Import creates new IDs to avoid overwriting existing local projects.
