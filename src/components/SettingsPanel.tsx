import { downloadProject, importProjectFile } from "../services/exportImport";
import { useAppStore } from "../store/useAppStore";

type Props = {
  projectId?: string;
  onRefresh: () => Promise<void>;
};

export function SettingsPanel({ projectId, onRefresh }: Props) {
  const setCurrentProjectId = useAppStore((state) => state.setCurrentProjectId);
  const setError = useAppStore((state) => state.setError);

  async function importFile(file?: File) {
    if (!file) return;
    try {
      const project = await importProjectFile(file);
      setCurrentProjectId(project.id);
      await onRefresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to import project.");
    }
  }

  async function exportCurrent() {
    if (!projectId) return;
    try {
      await downloadProject(projectId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to export project.");
    }
  }

  return (
    <section className="panel">
      <h2>Import / Export</h2>
      <div className="button-row">
        <button disabled={!projectId} onClick={() => void exportCurrent()}>Export project</button>
        <label className="file-button">
          Import project
          <input type="file" accept=".json,.webmpc.json,application/json" onChange={(event) => void importFile(event.target.files?.[0])} />
        </label>
      </div>
    </section>
  );
}
