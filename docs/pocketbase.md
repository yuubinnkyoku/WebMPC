# PocketBase Setup

WebMPC works without PocketBase. Configure PocketBase only when you want manual backup, sync, and restore across devices.

## Environment

Set `VITE_POCKETBASE_URL` before building the frontend:

```bash
VITE_POCKETBASE_URL=https://your-tailnet-host:8090 docker compose up --build
```

For local development, use `.env.local`:

```bash
VITE_POCKETBASE_URL=http://127.0.0.1:8090
```

## Collections

Create these collections in the PocketBase admin UI.

### `webmpc_projects`

Fields:

- `project`: JSON, required
- `pads`: JSON, required
- `samples`: JSON, required

Recommended API rules:

- List/Search: `@request.auth.id != ""`
- View: `@request.auth.id != ""`
- Create: `@request.auth.id != ""`
- Update: `@request.auth.id != ""`
- Delete: disabled unless you explicitly want remote deletes

The app stores project metadata, pad mappings, and sample metadata here. Local IndexedDB remains the playback source of truth.

### `webmpc_samples`

Fields:

- `project`: Text or Relation to `webmpc_projects`, required
- `sampleId`: Text, required
- `file`: File, required

Recommended API rules:

- List/Search: `@request.auth.id != ""`
- View: `@request.auth.id != ""`
- Create: `@request.auth.id != ""`
- Update: `@request.auth.id != ""`
- Delete: `@request.auth.id != ""` if you want sync to prune remote sample files that were deleted locally; otherwise disable it

The app uploads one record per local sample. On sync, an existing `project + sampleId` record is updated; otherwise a new record is created. After upload, WebMPC attempts to delete remote sample records that no longer exist in the local project. If the `webmpc_samples` Delete rule is disabled, stale remote file records can remain in PocketBase, but project metadata and restore behavior still follow the current local sample list.

## Restore Behavior

`Load remote` lists records from `webmpc_projects`. `Restore` imports the selected remote project as a new local project:

- existing local projects are not deleted
- restored pads and samples receive new local IDs
- downloaded sample files are saved into local IndexedDB
- the restored project keeps the remote record ID for future sync

## Conflict Behavior

When `Sync now` sees that the remote project timestamp is newer than the current local project, it does not overwrite the remote record. The UI reports the conflict and leaves local data intact. Use `Load remote` and `Restore` to bring the remote copy down as a separate local project, then decide which copy to keep working on.

## Manual Verification Checklist

Use this checklist after PocketBase is running and the collections above exist.

1. Build the frontend with `VITE_POCKETBASE_URL` pointing at PocketBase.
2. Sign in from the WebMPC Sync panel.
3. Create a local project, import a small sample, assign it to a pad, and click `Sync now`.
4. Confirm PocketBase has one `webmpc_projects` record and at least one `webmpc_samples` record.
5. Delete the local sample, click `Sync now`, and confirm the `webmpc_samples` record is removed when the collection Delete rule allows it.
6. Open WebMPC in another browser profile or device, sign in, click `Load remote`, and restore the project.
7. Confirm the restored project appears as a separate local project and the original local project was not deleted.
8. Edit the remote `project.updatedAt` in PocketBase to be newer than the local project timestamp.
9. Click `Sync now` on the older local project.
10. Confirm WebMPC reports that the remote project is newer and does not overwrite the remote record.

## Tailscale

Expose PocketBase and the frontend inside the Tailnet. Keep PocketBase private unless you intentionally publish it.

```bash
tailscale serve --https=443 http://127.0.0.1:8080
```

If PocketBase is served from another Tailnet host, rebuild the frontend with that HTTPS URL in `VITE_POCKETBASE_URL`.
