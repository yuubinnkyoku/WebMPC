# Verification

This page maps WebMPC acceptance criteria to practical evidence.

## Automated Checks

Run these before shipping:

```bash
bun run typecheck
bun run lint
bun run build
bun run test
docker compose config
```

Current automated test coverage includes:

- MIDI message classification and monitor labels
- Web MIDI support detection, non-sysex access requests, input refresh, note-on/note-off/control-change event conversion, and old-access detachment on reconnect
- MIDI monitor history ordering and capped history size
- pad bank order, visible pad sorting, keyboard shortcut mapping, form-field shortcut suppression, and accessibility labels for bank, sample, MIDI, and shortcut states
- project creation with four banks and MPD218 default notes/mapping
- project name normalization for local edits and imported bundles
- project metadata updates based on the stored version, stale-caller version progression, immutable/sync-owned field preservation, and no-op project save detection
- sample metadata and blob persistence in fake IndexedDB
- missing-parent project, pad, sample, and sync-metadata update rejection; immutable pad position enforcement; cross-project sample assignment rejection; replacement-bundle pad/sample/MIDI mapping validation; cross-project/cross-mapping ID ownership protection; sample Blob size and SHA-256 content matching; and transactional rollback of failed project-bundle replacement writes
- project, pad assignment, and sample blob persistence after reopening IndexedDB
- project deletion and sample deletion cleanup paths
- pad/project metadata normalization, no-op pad save detection, and replaced project bundles
- default MPD218 mapping re-application, including no-op detection when the mapping is already current
- project-wide MIDI note uniqueness across manual edits, MIDI Learn saves, preset application, imported bundles, and remote restores
- MIDI mapping normalization, unique names, no-op saves, valid note/target ranges, one-note-per-target enforcement, and missing-project application rejection
- decoded sample duration metadata updates and invalid duration fallback
- playback trim windows, pitch-to-playback-rate conversion, and pitch-adjusted fallback playback duration
- AudioWorklet sample rendering, pan/gain, pitch-independent stop release timing, choke groups, and sample/project unload release paths
- sync metadata persistence and invalid timestamp normalization
- stale sync metadata cleanup when a project bundle is replaced
- project export/import round trips with sample data, local sync ID stripping, and rejection of missing sample file data
- project export filename formatting, including Unicode project names
- malformed project bundle rejection, including missing export metadata, invalid SHA-256 metadata, missing/empty/invalid sample data, broken pad references, and cross-project bundle data
- Data URL conversion and strict non-empty audio base64 Data URL validation
- audio file type and non-empty file validation before local sample import
- formatter utilities
- timestamp and time-of-day formatter fallbacks for invalid values
- sample load failure message formatting and long failed-sample list truncation
- persisted settings normalization, including master gain clamping and invalid payload fallback
- PocketBase filter value quoting
- PocketBase record timestamp parsing, including malformed timestamp fallback
- remote project summary normalization, including missing names, unknown or malformed project timestamps, and sample counts
- sync conflict timestamp decisions
- PocketBase unconfigured behavior for sync, sign-in, remote list, restore paths, remote payload stripping, post-sync remote ID assignment without local edit timestamp/version churn, and restored remote bundle ID remapping
- configured PocketBase sign-in/sign-out state and failed sample-upload retry behavior without duplicate remote project creation or false last-synced timestamps
- remote sample prune decisions, duplicate remote sample-file selection, and missing local blob detection; live PocketBase checks should also confirm all remote sample file records are considered, not only the first page
- project selection fallback behavior

The Docker frontend build is pinned to Bun 1.3.14, requires the committed `bun.lock`, and excludes local dependencies, build output, Git history, environment files, coverage, and logs from the build context.

## Browser Smoke Check

With the dev server running, open the Vite URL printed by `bun run dev` such as `http://127.0.0.1:5173`. If that port is already occupied, Vite may use the next available port.

- project list appears
- selected project editor appears
- `Start Audio` appears
- 16 pads appear
- `Import audio`, `MIDI Learn`, `Enable MIDI`, `Sync now`, `Load remote`, `Settings`, and `Export project` appear
- no visible error banner appears
- browser console has no errors
- at a 390 x 844 viewport, the main UI still shows the controls above, 16 pads, no visible error banner, no `Invalid Date`, no browser console errors, and no document-level horizontal overflow

Latest local smoke evidence: on 2026-06-17, `bun run dev` served `http://localhost:5173/`; desktop and 390 x 844 viewport checks both showed 16 pads, no `Invalid Date`, no visible error text, no console errors, and no document-level horizontal overflow on mobile.

On 2026-06-18, a browser flow created a new project, initialized audio, changed pad A1 pitch to `+12`, reloaded the page, and confirmed that the project and pitch value persisted with no console errors. File-picker upload and download capture are not supported by the automated browser surface, so sample blob persistence and export/import remain covered by the IndexedDB integration tests above and the manual checks below.

Also on 2026-06-18, the production build was served with `bun run preview` on `http://localhost:4173/`. The app, manifest, service worker, and `sample-worklet.js` returned HTTP 200. After one controlled reload, the preview server was stopped; the app shell still rendered without console errors and a separate request for `sample-worklet.js` returned the cached AudioWorklet source, confirming both are available from the generated service worker precache.

## Manual Hardware Checks

These require Windows Chrome, speakers or headphones, and an MPD218 or another USB MIDI controller.

1. Open the app over HTTPS.
2. Click `Start Audio`.
3. Import a WAV, MP3, or OGG sample.
4. Assign the sample to pad A1.
5. Click pad A1 and confirm audible playback.
6. Press `1` and confirm pad A1 triggers; use `Q`, `A`, or `Z` to confirm the shortcut grid follows the visible bank.
7. Adjust gain, pan, pitch, trim, choke group, and master gain.
8. Confirm playback changes accordingly.
9. Trigger a long sample or gated pad, click `Stop all`, and confirm playback stops.
10. Turn off `One-shot`, hold the on-screen pad or its keyboard shortcut, then release and confirm playback stops.
11. Click `Enable MIDI` and grant browser permission.
12. Hit the physical pad mapped to MIDI note 36.
13. Confirm the MIDI monitor shows the note and the assigned sample plays.
14. Turn off `One-shot` for the assigned pad, hold the physical pad, then release it and confirm MIDI note-off stops playback.
15. Change a pad MIDI note, click `Apply MPD218`, and confirm bank A notes return to 36-51.
16. Use `MIDI Learn` on another pad, hit a physical pad, and confirm the mapping changes.
17. Use `Clear MIDI` and confirm the physical pad no longer triggers that WebMPC pad.

## Persistence Checks

1. Create a project.
2. Import a sample and assign it to a pad.
3. Reload the page.
4. Confirm the project, pad assignment, MIDI note, and sample metadata remain.
5. Click `Start Audio`.
6. Confirm the sample can be played again from the on-screen pad.
7. Change master gain, reload the page, and confirm the setting remains.
8. Delete the local project and confirm it disappears from the project list after confirmation.

## Import / Export Checks

1. Export a project from Settings.
2. Import the downloaded `.webmpc.json`.
3. Confirm a separate imported project appears.
4. Confirm the original project remains.
5. Confirm assigned sample data exists in the imported project.

## PocketBase Checks

Follow `docs/pocketbase.md` for setup and collection rules, then verify:

- sign-in succeeds when PocketBase is configured
- app remains usable when PocketBase is not configured
- `Sync now` creates or updates remote project and sample records
- synced remote project JSON does not include local-only project `remoteId` or sample `remoteFileId` metadata
- missing local sample file data is rejected before remote project writes; sample file upload failures surface as sync errors instead of a successful sync message, and do not update the local last-synced timestamp
- successful sync records last-synced state in sync metadata without marking unchanged local project content as edited
- `Load remote` lists remote projects, including projects beyond the first PocketBase page when enough records exist
- `Restore` imports a remote project as a separate local project and fails without partial local writes when remote sample files are missing or empty
- restored sample metadata receives fresh local IDs and does not keep stale remote file IDs from the remote project payload
- remote-newer conflict does not overwrite remote data and prompts restore

## Android Chrome Checks

1. Open the HTTPS app URL on Android Chrome.
2. Confirm the pad grid fits the viewport.
3. Tap pads and confirm touch feedback.
4. Confirm local project data survives reload.
5. If USB MIDI is available on the device, repeat the MIDI checks.
