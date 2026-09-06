import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectEditor } from "./components/ProjectEditor";
import { ProjectList } from "./components/ProjectList";
import { ensureDefaultMapping, getPads, getProject, getSamples, listProjects } from "./services/storage";
import { useAppStore } from "./store/useAppStore";
import type { Pad, Project, Sample } from "./types/models";
import { ProjectRefreshCoordinator } from "./utils/projectSelection";

export default function App() {
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const setCurrentProjectId = useAppStore((state) => state.setCurrentProjectId);
  const error = useAppStore((state) => state.error);
  const setError = useAppStore((state) => state.setError);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pads, setPads] = useState<Pad[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshCoordinator = useRef(new ProjectRefreshCoordinator());

  const currentProject = useMemo(() => projects.find((project) => project.id === currentProjectId), [currentProjectId, projects]);

  const refresh = useCallback(async (preferredProjectId?: string) => {
    const request = refreshCoordinator.current.begin(preferredProjectId);
    const nextProjects = await listProjects();
    const storeProjectId = useAppStore.getState().currentProjectId;
    const selectedId = refreshCoordinator.current.choose(nextProjects.map((project) => project.id), storeProjectId);
    if (selectedId) {
      const [project, nextPads, nextSamples] = await Promise.all([getProject(selectedId), getPads(selectedId), getSamples(selectedId)]);
      if (!refreshCoordinator.current.isCurrent(request)) return;
      if (!project) {
        refreshCoordinator.current.commit();
        setProjects(nextProjects.filter((candidate) => candidate.id !== selectedId));
        setCurrentProjectId(undefined);
        setPads([]);
        setSamples([]);
        setLoading(false);
        return;
      }
      refreshCoordinator.current.commit(selectedId);
      setProjects(nextProjects);
      if (selectedId !== storeProjectId) setCurrentProjectId(selectedId);
      setPads(nextPads);
      setSamples(nextSamples);
    } else {
      if (!refreshCoordinator.current.isCurrent(request)) return;
      refreshCoordinator.current.commit();
      setProjects(nextProjects);
      if (storeProjectId !== undefined) setCurrentProjectId(undefined);
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
