import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectEditor } from "./components/ProjectEditor";
import { ProjectList } from "./components/ProjectList";
import { ensureDefaultMapping, getPads, getProject, getSamples, listProjects } from "./services/storage";
import { useAppStore } from "./store/useAppStore";
import type { Pad, Project, Sample } from "./types/models";
import { chooseProjectId } from "./utils/projectSelection";

export default function App() {
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const setCurrentProjectId = useAppStore((state) => state.setCurrentProjectId);
  const error = useAppStore((state) => state.error);
  const setError = useAppStore((state) => state.setError);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pads, setPads] = useState<Pad[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);

  const currentProject = useMemo(() => projects.find((project) => project.id === currentProjectId), [currentProjectId, projects]);

  const refresh = useCallback(async (preferredProjectId?: string) => {
    const nextProjects = await listProjects();
    setProjects(nextProjects);
    const storeProjectId = useAppStore.getState().currentProjectId;
    const selectedId = chooseProjectId(nextProjects.map((project) => project.id), preferredProjectId, storeProjectId);
    if (selectedId !== storeProjectId) setCurrentProjectId(selectedId);
    if (selectedId) {
      const [project, nextPads, nextSamples] = await Promise.all([getProject(selectedId), getPads(selectedId), getSamples(selectedId)]);
      if (!project) {
        setCurrentProjectId(undefined);
        setPads([]);
        setSamples([]);
        setLoading(false);
        return;
      }
      setPads(nextPads);
      setSamples(nextSamples);
    } else {
      setPads([]);
      setSamples([]);
    }
    setLoading(false);
  }, [setCurrentProjectId]);

  useEffect(() => {
    void ensureDefaultMapping().then(() => refresh()).catch((error: unknown) => {
      setError(error instanceof Error ? error.message : "Unable to initialize app.");
      setLoading(false);
    });
  }, [refresh, setError]);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>WebMPC</h1>
          <p>Local-first sampler for Chrome, MPD218, and touch pads</p>
        </div>
        {loading ? <span className="chip">Loading</span> : null}
      </header>
      {error ? (
        <div className="error">
          <span>{error}</span>
          <button onClick={() => setError(undefined)}>Dismiss</button>
        </div>
      ) : null}
      <div className="layout">
        <aside>
          <ProjectList projects={projects} onRefresh={refresh} />
        </aside>
        <ProjectEditor project={currentProject} pads={pads} samples={samples} onRefresh={refresh} />
      </div>
    </div>
  );
}
