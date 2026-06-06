import { useEffect } from "react";
import { audioEngine } from "../services/audio";
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
  onRefresh: () => Promise<void>;
};

export function ProjectEditor({ project, pads, samples, onRefresh }: Props) {
  const setSync = useAppStore((state) => state.setSync);

  useEffect(() => {
    setSync(getSyncState());
  }, [setSync]);

  async function loadSamples() {
    await audioEngine.loadProjectSamples(samples);
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
      </div>
      <AudioSetupButton onReady={loadSamples} />
      <div className="workspace">
        <PadGrid pads={pads} samples={samples} onPadChanged={onRefresh} />
        <div className="side">
          <SamplePanel projectId={project.id} pads={pads} samples={samples} onRefresh={onRefresh} />
          <MidiPanel pads={pads} onRefresh={onRefresh} />
          <SyncPanel projectId={project.id} />
          <SettingsPanel projectId={project.id} onRefresh={onRefresh} />
        </div>
      </div>
    </main>
  );
}
