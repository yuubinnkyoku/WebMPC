import { useState } from "react";
import { getSyncState, signIn, signOut, syncProject } from "../services/sync";
import { useAppStore } from "../store/useAppStore";

type Props = {
  projectId?: string;
};

export function SyncPanel({ projectId }: Props) {
  const sync = useAppStore((state) => state.sync);
  const setSync = useAppStore((state) => state.setSync);
  const setError = useAppStore((state) => state.setError);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
    } catch (error) {
      setSync({ ...getSyncState(), message: "Sync failed" });
      setError(error instanceof Error ? error.message : "Unable to sync.");
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Sync</h2>
        <button disabled={!projectId || !sync.configured} onClick={() => void syncNow()}>Sync now</button>
      </div>
      <p>{sync.message}</p>
      {sync.configured && !sync.signedIn ? (
        <div className="inline-form">
          <input placeholder="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input placeholder="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button onClick={() => void login()}>Sign in</button>
        </div>
      ) : null}
      {sync.signedIn ? <button onClick={() => setSync(signOut())}>Sign out</button> : null}
    </section>
  );
}
