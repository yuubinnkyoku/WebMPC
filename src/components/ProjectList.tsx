import { useState } from "react";
import { createProject } from "../services/storage";
import { useAppStore } from "../store/useAppStore";
import type { Project } from "../types/models";

type Props = {
  projects: Project[];
  onRefresh: () => Promise<void>;
};

export function ProjectList({ projects, onRefresh }: Props) {
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const setCurrentProjectId = useAppStore((state) => state.setCurrentProjectId);
  const setError = useAppStore((state) => state.setError);
  const [name, setName] = useState("New kit");

  async function create() {
    try {
      const project = await createProject(name.trim() || "New kit");
      setCurrentProjectId(project.id);
      await onRefresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create project.");
    }
  }

  return (
    <section className="panel project-list">
      <h2>Projects</h2>
      <div className="inline-form">
        <input value={name} onChange={(event) => setName(event.target.value)} />
        <button onClick={create}>Create</button>
      </div>
      <div className="list">
        {projects.map((project) => (
          <button key={project.id} className={project.id === currentProjectId ? "selected row" : "row"} onClick={() => setCurrentProjectId(project.id)}>
            <span>{project.name}</span>
            <small>{new Date(project.updatedAt).toLocaleString()}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
