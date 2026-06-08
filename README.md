# WebMPC

WebMPC is a local-first browser sampler for Windows Chrome, Android Chrome, touch pads, and USB MIDI controllers such as the Akai MPD218. Samples and project data are stored in IndexedDB so playback does not depend on a server.

## Target Environment

- Windows Chrome with Web MIDI enabled by default.
- Android Chrome for touch playback and project access.
- USB MIDI through an MPD218 or another class-compliant controller.
- HTTPS for production use. Tailscale Serve HTTPS is a good fit for private Tailnet access.

## Local Development

Install dependencies and start the Vite dev server:

```bash
bun install
bun run dev
```

Open the printed local URL in Chrome. Use `bun run typecheck`, `bun run build`, and `bun run lint` before shipping changes. See [docs/verification.md](docs/verification.md) for the full verification checklist.

## Basic Flow

1. Click `Start Audio`. Chrome requires AudioContext startup from a user gesture, and WebMPC does not create one before this action.
2. Create a project.
3. Edit the project name or BPM from the project header when needed.
4. Import a WAV, MP3, or OGG sample.
5. Select a pad and assign the sample.
6. Click, tap, or use the pad keyboard shortcuts to play. The selected bank maps to `1 2 3 4`, `Q W E R`, `A S D F`, and `Z X C V`.
7. Use `Stop all` if a long or gated sample needs to be silenced immediately.
8. Adjust master gain in Settings if needed.
9. Enable MIDI and grant browser permission.
10. Hit an MPD218 pad. Bank A uses notes 36-51 by default.
11. Use `Apply MPD218` in the MIDI panel if you want to restore the default note mapping.
12. Use MIDI Learn on a selected pad if your controller sends different notes.
13. Delete an assigned sample when you want to remove its IndexedDB blob and clear any pads that reference it.
14. Delete a local project when you want to remove its pads, samples, sample blobs, and sync metadata.

## Local Storage

Dexie stores projects, pads, sample metadata, sample blobs, MIDI mappings, and sync metadata in IndexedDB. Large audio blobs are not stored in React or Zustand state. Reloading the page keeps project, pad, MIDI mapping, and sample data available locally. User settings such as master gain are stored separately in browser localStorage. Sample duration is recorded when the browser audio engine has decoded the local file. Deleting a sample removes its metadata and blob, then clears pad assignments that referenced it. Deleting a project removes its local pads, samples, sample blobs, and sync metadata.

## PocketBase Sync

PocketBase is optional. Set:

```bash
VITE_POCKETBASE_URL=http://127.0.0.1:8090
```

The app remains usable when PocketBase is not configured or unavailable. Manual sync sends project metadata, pad mappings, sample metadata, and sample files to PocketBase collections named `webmpc_projects` and `webmpc_samples`. Sync also attempts to prune remote sample-file records that no longer exist locally when the PocketBase Delete rule allows it. `Load remote` lists synced projects and `Restore` imports a remote project as a new local project without deleting existing local data. Local IndexedDB remains the playback source of truth.

Successful sync and restore operations update local sync metadata with the remote record ID, last synced time, and remote updated timestamp.

If the remote project timestamp is newer than the current local project, WebMPC does not overwrite it during `Sync now`. Use `Load remote` and `Restore` to import the newer remote copy as a separate local project.

See [docs/pocketbase.md](docs/pocketbase.md) for concrete collection fields and recommended API rules.

## Import And Export

Use the Import / Export panel to download a `.webmpc.json` project bundle. The export includes project metadata, pad mappings, sample metadata, MIDI mappings, and sample files as data URLs when available.

The project bundle path is covered by Vitest with fake IndexedDB so project creation, pad defaults, sample blob persistence, and export/import round trips are checked without a browser.

## Docker Compose

Build and run the frontend with PocketBase:

```bash
docker compose up --build
```

Frontend: `http://localhost:8080`

PocketBase: `http://localhost:8090`

To point the built frontend at a different PocketBase URL, set the build argument before composing:

```bash
VITE_POCKETBASE_URL=https://your-tailnet-host:8090 docker compose up --build
```

Create the PocketBase collections before syncing:

- `webmpc_projects`: JSON-capable fields for `project`, `pads`, and `samples`.
- `webmpc_samples`: relation or text field for `project`, text field for `sampleId`, and file field for `file`.

## Tailscale Serve HTTPS

On the machine running Docker Compose, expose the frontend privately:

```bash
tailscale serve --https=443 http://127.0.0.1:8080
```

Use the HTTPS Tailnet URL in Chrome. HTTPS is important for reliable browser permission behavior around MIDI and PWA features.

## Proxmox LXC Notes

- Use a Debian or Ubuntu LXC with Docker enabled.
- Store `pocketbase_data` on persistent storage.
- Keep the service private to your Tailnet unless you intentionally publish it.
- USB MIDI is normally connected to the client browser device, not the server.

## Android Chrome Notes

Android Chrome works well for touch pads and local project storage. Web MIDI support on Android varies by device and USB mode, so keep on-screen pads available. Use HTTPS for the served app.

The app includes a PWA manifest and service worker setup through Vite PWA. The manifest launches at `/` with `/` scope, and the generated service worker precaches the app shell plus the public `sample-worklet.js` asset so the AudioWorklet script remains available from the installed app cache. Install behavior depends on Chrome, HTTPS, and the current service worker cache; local IndexedDB remains the source of saved projects and samples.

## Known Limitations

- AudioWorklet is used when Chrome can load it; AudioBufferSourceNode remains as a compatibility fallback.
- PocketBase conflict resolution is basic and manual-sync-first.
- Export is JSON with embedded data URLs rather than a zip archive.
- Sequencing and recording are not implemented; WebMPC is currently a playable sampler surface.

## Troubleshooting

- No sound: click `Start Audio`, then re-import or reload samples if needed.
- MIDI missing: use Windows Chrome, click `Enable MIDI`, and grant browser permission.
- MPD218 pads mismatch: select a pad, click `MIDI Learn`, then hit the physical pad.
- Sync unavailable: check `VITE_POCKETBASE_URL`, PocketBase auth, and collection names.
- Reload lost data: confirm the same browser profile is being used and IndexedDB or localStorage was not cleared.
