import { useState } from "react";
import { audioEngine } from "../services/audio";
import { createProject, deleteProject } from "../services/storage";
import { useAppStore } from "../store/useAppStore";
import type { Project } from "../types/models";
import { formatTimestamp } from "../utils/format";
import { normalizeProjectName } from "../utils/projectName";

type Props = {
  projects: Project[];
  onRefresh: (projectId?: string) => Promise<void>;
};

export function ProjectList({ projects, onRefresh }: Props) {
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const setError = useAppStore((state) => state.setError);
  const [name, setName] = useState("New kit");

  async function create() {
    try {
      const project = await createProject(normalizeProjectName(name));
      setName(project.name);
      await onRefresh(project.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create project.");
    }
  }

  async function select(project: Project) {
    await onRefresh(project.id);
  }

  async function remove(project: Project) {
    const confirmed = window.confirm(`Delete "${project.name}" and all of its local pads and samples?`);
    if (!confirmed) return;
    try {
      audioEngine.stopAll();
      audioEngine.unloadProject(project.id);
      await deleteProject(project.id);
      await onRefresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete project.");
    }
  }

  return (
    <section className="panel project-list">
      <h2>Projects</h2>
      <div className="inline-form">
        <input aria-label="New project name" value={name} onChange={(event) => setName(event.target.value)} />
        <button onClick={create}>Create</button>
      </div>
      <div className="list">
        {projects.map((project) => (
          <div key={project.id} className={project.id === currentProjectId ? "selected project-row" : "project-row"}>
            <button className="row project-select" aria-current={project.id === currentProjectId ? "true" : undefined} onClick={() => void select(project)}>
              <span>{project.name}</span>
              <small>{formatTimestamp(project.updatedAt)}</small>
            </button>
            <button className="danger-button icon-button" aria-label={`Delete ${project.name}`} onClick={() => void remove(project)}>Delete</button>
          </div>
        ))}
      </div>
    </section>
  );
}
