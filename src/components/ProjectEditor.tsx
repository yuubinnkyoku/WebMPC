import { type KeyboardEvent, useEffect, useState } from "react";
import { audioEngine } from "../services/audio";
import { updateProject } from "../services/storage";
import { getSyncState } from "../services/sync";
import { useAppStore } from "../store/useAppStore";
import type { Pad, Project, Sample } from "../types/models";
import { AudioSetupButton } from "./AudioSetupButton";
import { MidiPanel } from "./MidiPanel";
import { PadGrid } from "./PadGrid";
import { SamplePanel } from "./SamplePanel";
import { SettingsPanel } from "./SettingsPanel";
import { SyncPanel } from "./SyncPanel";

type Props = {
  project?: Project;
  pads: Pad[];
  samples: Sample[];
  onRefresh: (projectId?: string) => Promise<void>;
};

export function ProjectEditor({ project, pads, samples, onRefresh }: Props) {
  const setSync = useAppStore((state) => state.setSync);
  const setError = useAppStore((state) => state.setError);
  const [draftName, setDraftName] = useState("");
  const [draftBpm, setDraftBpm] = useState(120);

  useEffect(() => {
    setSync(getSyncState());
  }, [setSync]);

  useEffect(() => {
    setDraftName(project?.name ?? "");
    setDraftBpm(project?.bpm ?? 120);
  }, [project?.id, project?.name, project?.bpm]);

  async function loadSamples() {
    await audioEngine.loadProjectSamples(samples);
    if (project) await onRefresh(project.id);
  }

  async function saveProjectMetadata(updates: Partial<Pick<Project, "name" | "bpm">>) {
    if (!project) return;
    const name = updates.name?.trim() || project.name;
    const bpm = updates.bpm ? Math.max(20, Math.min(300, updates.bpm)) : project.bpm;
    if (name === project.name && bpm === project.bpm) return;
    try {
      await updateProject({
        ...project,
        name,
        bpm
      });
      await onRefresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update project.");
    }
  }

  function saveOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
  }

  if (!project) {
    return (
      <main className="editor empty">
        <section className="panel">
          <h2>No project selected</h2>
          <p>Create or import a project to start assigning samples.</p>
        </section>
        <SettingsPanel onRefresh={onRefresh} />
      </main>
    );
  }

  return (
    <main className="editor">
      <div className="editor-head">
        <div>
          <h1>{project.name}</h1>
          <p>{project.bpm} BPM · version {project.version}</p>
        </div>
        <div className="project-fields">
          <label className="field compact-field">
            Name
            <input
              value={draftName}
              onBlur={() => void saveProjectMetadata({ name: draftName })}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={saveOnEnter}
            />
          </label>
          <label className="field compact-field bpm-field">
            BPM
            <input
              type="number"
              min={20}
              max={300}
              value={draftBpm}
              onBlur={() => void saveProjectMetadata({ bpm: draftBpm })}
              onChange={(event) => setDraftBpm(Number(event.target.value))}
              onKeyDown={saveOnEnter}
            />
          </label>
        </div>
      </div>
      <AudioSetupButton onReady={loadSamples} />
      <div className="workspace">
        <PadGrid pads={pads} samples={samples} onPadChanged={onRefresh} />
        <div className="side">
          <SamplePanel projectId={project.id} pads={pads} samples={samples} onRefresh={onRefresh} />
          <MidiPanel projectId={project.id} pads={pads} onRefresh={onRefresh} />
          <SyncPanel projectId={project.id} onRefresh={onRefresh} />
          <SettingsPanel projectId={project.id} onRefresh={onRefresh} />
        </div>
      </div>
    </main>
  );
}
