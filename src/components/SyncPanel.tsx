import { useCallback, useEffect, useState } from "react";
import { audioEngine } from "../services/audio";
import { getSamples, getSyncMetadata } from "../services/storage";
import { getSyncState, listRemoteProjects, restoreRemoteProject, signIn, signOut, syncProject, type RemoteProjectSummary } from "../services/sync";
import { useAppStore } from "../store/useAppStore";

type Props = {
  projectId?: string;
  onRefresh: (projectId?: string) => Promise<void>;
};

export function SyncPanel({ projectId, onRefresh }: Props) {
  const sync = useAppStore((state) => state.sync);
  const setSync = useAppStore((state) => state.setSync);
  const setError = useAppStore((state) => state.setError);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remoteProjects, setRemoteProjects] = useState<RemoteProjectSummary[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | undefined>();

  const refreshLastSyncedAt = useCallback(async (nextProjectId = projectId) => {
    if (!nextProjectId) {
      setLastSyncedAt(undefined);
      return;
    }
    const metadata = await getSyncMetadata(nextProjectId);
    setLastSyncedAt(metadata?.lastSyncedAt);
  }, [projectId]);

  useEffect(() => {
    void refreshLastSyncedAt(projectId);
  }, [projectId, refreshLastSyncedAt, sync.message]);

  async function login() {
    try {
      setSync(await signIn(email, password));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to sign in.");
    }
  }

  async function syncNow() {
    if (!projectId) return;
    try {
      setSync({ ...getSyncState(), syncing: true, message: "Syncing..." });
      setSync(await syncProject(projectId));
      await refreshLastSyncedAt(projectId);
      await onRefresh(projectId);
    } catch (error) {
      setSync({ ...getSyncState(), message: "Sync failed" });
      setError(error instanceof Error ? error.message : "Unable to sync.");
    }
  }

  async function loadRemoteProjects() {
    try {
      setSync({ ...getSyncState(), syncing: true, message: "Loading remote projects..." });
      const projects = await listRemoteProjects();
      setRemoteProjects(projects);
      setSync({ ...getSyncState(), message: `Loaded ${projects.length} remote project${projects.length === 1 ? "" : "s"}` });
    } catch (error) {
      setSync({ ...getSyncState(), message: "Remote list failed" });
      setError(error instanceof Error ? error.message : "Unable to list remote projects.");
    }
  }

  async function restore(remoteId: string) {
    try {
      setSync({ ...getSyncState(), syncing: true, message: "Restoring project..." });
      const project = await restoreRemoteProject(remoteId);
      await audioEngine.loadProjectSamples(await getSamples(project.id));
      await onRefresh(project.id);
      await refreshLastSyncedAt(project.id);
      setSync({ ...getSyncState(), message: `Restored ${project.name}` });
    } catch (error) {
      setSync({ ...getSyncState(), message: "Restore failed" });
      setError(error instanceof Error ? error.message : "Unable to restore project.");
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Sync</h2>
        <div className="button-row">
          <button disabled={!projectId || !sync.configured || !sync.signedIn || sync.syncing} onClick={() => void syncNow()}>Sync now</button>
          <button disabled={!sync.configured || !sync.signedIn || sync.syncing} onClick={() => void loadRemoteProjects()}>Load remote</button>
        </div>
      </div>
      <p>{sync.message}</p>
      <p>{lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : "Not synced yet"}</p>
      {sync.configured && !sync.signedIn ? (
        <div className="inline-form">
          <input placeholder="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input placeholder="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button onClick={() => void login()}>Sign in</button>
        </div>
      ) : null}
      {sync.signedIn ? <button onClick={() => setSync(signOut())}>Sign out</button> : null}
      {remoteProjects.length > 0 ? (
        <div className="remote-list">
          {remoteProjects.map((project) => (
            <div className="remote-row" key={project.id}>
              <div>
                <strong>{project.name}</strong>
                <small>{project.sampleCount} samples · {new Date(project.updatedAt).toLocaleString()}</small>
              </div>
              <button disabled={sync.syncing} onClick={() => void restore(project.id)}>Restore</button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
