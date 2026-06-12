import { downloadProject, importProjectFile } from "../services/exportImport";
import { audioEngine } from "../services/audio";
import { getSamples } from "../services/storage";
import { useAppStore } from "../store/useAppStore";
import { useState } from "react";

type Props = {
  projectId?: string;
  onRefresh: (projectId?: string) => Promise<void>;
};

export function SettingsPanel({ projectId, onRefresh }: Props) {
  const masterGain = useAppStore((state) => state.settings.masterGain);
  const setMasterGain = useAppStore((state) => state.setMasterGain);
  const setError = useAppStore((state) => state.setError);
  const [toolStatus, setToolStatus] = useState("Ready");

  async function importFile(file?: File) {
    if (!file) return;
    try {
      const project = await importProjectFile(file);
      await audioEngine.loadProjectSamples(await getSamples(project.id));
      await onRefresh(project.id);
      setToolStatus(`Imported ${project.name}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to import project.");
      setToolStatus("Import failed");
    }
  }

  async function exportCurrent() {
    if (!projectId) return;
    try {
      await downloadProject(projectId);
      setToolStatus("Export created");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to export project.");
      setToolStatus("Export failed");
    }
  }

  return (
    <section className="panel">
      <h2>Settings</h2>
      <label className="field">
        Master gain
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterGain}
          onChange={(event) => {
            const value = Number(event.target.value);
            setMasterGain(value);
            audioEngine.setMasterGain(value);
          }}
        />
      </label>
      <p>{Math.round(masterGain * 100)}%</p>
      <h2 className="subheading">Import / Export</h2>
      <div className="button-row">
        <button disabled={!projectId} onClick={() => void exportCurrent()} aria-label="Export current project">Export project</button>
        <label className="file-button">
          Import project
          <input
            aria-label="Import project bundle"
            type="file"
            accept=".json,.webmpc.json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void importFile(file);
            }}
          />
        </label>
      </div>
      <p aria-live="polite">{toolStatus}</p>
    </section>
  );
}
