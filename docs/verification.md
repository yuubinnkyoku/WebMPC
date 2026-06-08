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
- project creation with four banks and MPD218 default notes
- project metadata updates
- sample metadata and blob persistence in fake IndexedDB
- project, pad assignment, and sample blob persistence after reopening IndexedDB
- project deletion and sample deletion cleanup paths
- pad/project metadata normalization
- default MPD218 mapping re-application
- decoded sample duration metadata updates
- sync metadata persistence
- project export/import round trips with sample data
- malformed project bundle rejection, including invalid sample data, broken pad references, and cross-project bundle data
- Data URL conversion
- audio file type detection before local sample import
- formatter utilities
- persisted settings normalization, including master gain clamping and invalid payload fallback
- PocketBase filter value quoting
- sync conflict timestamp decisions
- PocketBase unconfigured behavior for sync, sign-in, remote list, and restore paths
- remote sample prune decisions; live PocketBase checks should also confirm all remote sample file records are considered, not only the first page
- project selection fallback behavior

## Browser Smoke Check

With the dev server running, open `http://127.0.0.1:5173` and confirm:

- project list appears
- selected project editor appears
- `Start Audio` appears
- 16 pads appear
- `Import audio`, `MIDI Learn`, `Enable MIDI`, `Sync now`, `Load remote`, `Settings`, and `Export project` appear
- no visible error banner appears
- browser console has no errors

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
- `Load remote` lists remote projects
- `Restore` imports a remote project as a separate local project
- remote-newer conflict does not overwrite remote data and prompts restore

## Android Chrome Checks

1. Open the HTTPS app URL on Android Chrome.
2. Confirm the pad grid fits the viewport.
3. Tap pads and confirm touch feedback.
4. Confirm local project data survives reload.
5. If USB MIDI is available on the device, repeat the MIDI checks.
