# AGENTS.md

This file gives coding agents the project-specific rules for working on WebMPC. Follow it together with `README.md`, `docs/architecture.md`, `docs/verification.md`, and any task-specific user instructions.

## Project Goal

WebMPC is a local-first browser sampler for Windows Chrome, Android Chrome, touch pads, and USB MIDI controllers such as the Akai MPD218.

The core experience is:

1. create or open a local project;
2. start the browser audio engine from a user gesture;
3. import WAV, MP3, or OGG samples;
4. assign samples to 4x4 visible pads in the selected bank;
5. play from click, touch, keyboard shortcuts, or MIDI;
6. keep project, pad, MIDI, setting, and sample data available after reload.

Do not turn the app into a server-dependent sampler. Local IndexedDB data must remain the playback source of truth.

## Stack

Use the existing stack unless the task clearly requires otherwise.

- Bun for dependency scripts and lockfile management.
- Vite, React, and TypeScript for the frontend.
- Zustand for UI/session state.
- Dexie and IndexedDB for project, pad, sample, sample blob, MIDI mapping, and sync metadata persistence.
- Web Audio with AudioWorklet when available, with AudioBufferSourceNode fallback.
- Web MIDI for physical controller input.
- PocketBase as an optional manual sync backend.
- Vite PWA for install/offline app-shell behavior.
- Docker Compose for frontend plus optional PocketBase local deployment.

## Commands

Before considering a code change ready, run the relevant checks. For broad changes, run all of these:

```bash
bun install
bun run typecheck
bun run lint
bun run build
bun run test
docker compose config
```

If the environment cannot run one of them, say exactly which command could not be run and why.

For browser smoke checks, use the Vite dev server or production preview:

```bash
bun run dev
bun run preview
```

Confirm at least that the app renders, a project can be selected or created, 16 pads are visible, the major panels appear, no visible error banner appears, and the browser console has no errors.

## Repository Map

Important paths:

- `src/App.tsx`: app shell composition.
- `src/components/`: UI panels and pad surface.
- `src/store/useAppStore.ts`: session/UI state only.
- `src/services/storage.ts`: Dexie schema, transactions, local persistence, project/sample/pad operations.
- `src/services/audio.ts`: AudioContext, sample decode/cache, Worklet/fallback playback.
- `public/sample-worklet.js`: AudioWorklet processor.
- `src/services/midi.ts`: Web MIDI access, input refresh, event conversion.
- `src/services/sync.ts`: optional PocketBase sync/restore logic.
- `src/services/exportImport.ts`: `.webmpc.json` export/import.
- `src/utils/`: small pure helpers; prefer adding tests here for logic-heavy changes.
- `docs/architecture.md`: design overview.
- `docs/verification.md`: acceptance criteria and manual checks.
- `docs/pocketbase.md`: PocketBase collection/API-rule setup.

## State and Persistence Rules

Keep Zustand small. It is for UI/session state such as the current project, selected bank/pad, MIDI monitor messages, audio status, sync status, transient pad feedback, visible errors, and user settings.

Do not store large audio blobs, decoded buffers, active voices, MIDI access objects, or long-lived external resources in persisted Zustand state.

Use IndexedDB through `src/services/storage.ts` for durable app data. Project creation should seed four banks. The visible selected bank should have 16 pads. Bank A defaults to MPD218-style notes 36 through 51.

When deleting a project or sample, keep cleanup transactional where possible. Deleting a sample must remove its metadata and blob and clear pad assignments that referenced it. Deleting a project must remove the project, pads, samples, sample blobs, MIDI mappings, and sync metadata for that local project.

When importing or restoring a project bundle, validate IDs and references carefully. Do not allow cross-project sample assignment, broken pad references, stale sync-owned IDs, or partial writes on invalid input. Restored/imported projects should get fresh local IDs and must not overwrite existing local projects unexpectedly.

## Audio Rules

Never create or resume `AudioContext` before a user gesture. The `Start Audio` flow exists because Chrome requires explicit user interaction.

Keep both playback paths working:

- AudioWorklet path for capable Chrome sessions.
- AudioBufferSourceNode fallback for compatibility.

When changing playback behavior, consider both one-shot and gated samples. Preserve note-off release behavior, `Stop all`, pad-level stop, choke groups, pitch, pan, gain, trim start/end, velocity gain, sample unload, and project unload behavior.

If a change touches `src/services/audio.ts` or `public/sample-worklet.js`, add or update tests for deterministic logic where possible, then do a browser smoke check. Automated browser checks cannot prove audible output, so be explicit when physical audio verification is still manual.

## MIDI Rules

Request Web MIDI access only from a user action. Do not require sysex.

Treat MIDI note-on with velocity zero as note-off. Avoid duplicate listeners when MIDI is enabled or refreshed more than once.

Preserve project-wide MIDI note uniqueness unless a task explicitly changes the mapping model. MIDI Learn should update the selected pad reliably, even if the selected pad changes during the session.

The MPD218 default mapping for bank A is notes 36 through 51. `Apply MPD218` should restore that preset without creating unnecessary writes when the mapping is already current.

## UI Rules

Keep the pad surface usable on desktop and Android Chrome. The 390 x 844 viewport is an important smoke-check size.

Preserve keyboard shortcuts for the visible bank:

- top row: `1 2 3 4`
- second row: `Q W E R`
- third row: `A S D F`
- fourth row: `Z X C V`

Do not let global pad shortcuts fire while the user is typing in form fields.

Prefer clear status text and recoverable error banners over silent failures. Avoid `Invalid Date` in the UI; use formatter helpers and fallbacks.

## PocketBase Sync Rules

PocketBase is optional. The app must remain usable when `VITE_POCKETBASE_URL` is unset, unreachable, or unauthenticated.

Manual sync may upload project metadata, pad mappings, sample metadata, and sample files. Local IndexedDB remains authoritative for playback.

Do not include local-only sync IDs such as remote project IDs or remote sample file IDs inside remote project payloads. Sync metadata belongs in the local `syncMetadata` table.

If the remote project timestamp is newer than the current local project, do not overwrite it. Surface the conflict and use restore/import-as-new behavior instead.

When restoring a remote project, import it as a separate local project. Missing or empty remote sample files should fail cleanly without partial local writes.

## Import / Export Rules

Export uses `.webmpc.json` with sample files embedded as data URLs. It is not currently a zip archive.

Reject malformed bundles, missing sample file data, invalid SHA-256 metadata, empty or invalid data URLs, broken pad references, and cross-project bundle data.

If local sample file data is missing, export must fail rather than writing an incomplete bundle.

## Docker and Environment Rules

Vite environment variables are build-time values. `VITE_POCKETBASE_URL` must be passed as a build argument for Dockerized frontend builds, not treated as a normal runtime-only environment variable.

Keep the Docker build reproducible with the committed `bun.lock`. Do not commit `node_modules`, `dist`, coverage, logs, local `.env` files, or generated PocketBase data.

## Testing Guidance

Prefer tests for pure logic, validation, persistence, import/export, and MIDI/audio calculation behavior. Use fake IndexedDB for storage integration tests.

When fixing a bug, add a regression test unless the bug is only verifiable with hardware or browser permissions.

Useful test areas include:

- MIDI message classification and listener lifecycle.
- Pad ordering, bank shortcuts, and shortcut suppression in form fields.
- Project creation defaults and MPD218 note mapping.
- IndexedDB persistence after reopening.
- Project/sample deletion cleanup.
- Import/export round trips and malformed bundle rejection.
- Audio trim, pitch, gain, pan, choke, stop/release timing, and Worklet sample rendering.
- Settings normalization and timestamp formatting fallbacks.
- PocketBase unconfigured behavior, conflict decisions, restore ID remapping, and failed sample upload handling.

## Manual Checks That Agents Cannot Fully Prove

Be honest about these. Automated tests and browser smoke checks do not fully replace them.

- Audible playback through speakers or headphones.
- Physical MPD218 note-on and note-off behavior.
- Real Android Chrome USB MIDI behavior.
- Browser file picker upload and download capture in restricted automation surfaces.
- Live PocketBase sync with enough records to test pagination.
- Tailscale Serve HTTPS behavior on the actual deployment host.

## Change Discipline

Make focused changes. Avoid broad rewrites unless the task asks for one.

Do not add dependencies casually. If a dependency is necessary, explain why the existing stack cannot reasonably handle the task.

Do not weaken validation to make tests pass. Fix the invalid state instead.

Do not remove fallback paths, manual checks, or docs just because they are inconvenient to automate.

Update docs when behavior changes, especially `README.md`, `docs/architecture.md`, `docs/verification.md`, and `docs/pocketbase.md`.

At the end of a task, report:

- what changed;
- what commands were run;
- what could not be verified;
- what manual hardware/browser checks remain, if any.
