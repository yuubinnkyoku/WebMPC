import { audioEngine } from "../services/audio";
import { deleteSample, importSample, savePad } from "../services/storage";
import { useAppStore } from "../store/useAppStore";
import type { Pad, Sample } from "../types/models";
import { formatBytes, formatDurationMs } from "../utils/format";
import { parseOptionalNumberInput, parseRequiredNumberInput } from "../utils/numberInput";

type Props = {
  projectId: string;
  pads: Pad[];
  samples: Sample[];
  onRefresh: (projectId?: string) => Promise<void>;
};

export function SamplePanel({ projectId, pads, samples, onRefresh }: Props) {
  const selectedBank = useAppStore((state) => state.selectedBank);
  const selectedPadIndex = useAppStore((state) => state.selectedPadIndex);
  const setLearningPad = useAppStore((state) => state.setLearningPad);
  const learningPad = useAppStore((state) => state.learningPad);
  const setError = useAppStore((state) => state.setError);
  const pad = pads.find((item) => item.bank === selectedBank && item.padIndex === selectedPadIndex);
  const assignedSample = samples.find((sample) => sample.id === pad?.sampleId);

  async function handleFile(file?: File) {
    if (!file) return;
    try {
      const durationMs = await audioEngine.decodeDurationMs(file).catch(() => undefined);
      const sample = await importSample(projectId, file, durationMs);
      await audioEngine.loadSample(sample).catch(() => undefined);
      if (pad) await savePad({ ...pad, sampleId: sample.id });
      await onRefresh(projectId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to import sample.");
    }
  }

  async function updatePad(updates: Partial<Pad>) {
    if (!pad) return;
    try {
      await savePad({ ...pad, ...updates });
      await onRefresh(projectId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update pad.");
    }
  }

  async function removeAssignedSample() {
    if (!assignedSample) return;
    try {
      audioEngine.unloadSample(assignedSample.id);
      await deleteSample(assignedSample.id);
      await onRefresh(projectId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete sample.");
    }
  }

  if (!pad) return null;

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Sample</h2>
        <div className="button-row">
          <button onClick={() => setLearningPad({ bank: pad.bank, padIndex: pad.padIndex })}>
            {learningPad?.bank === pad.bank && learningPad.padIndex === pad.padIndex ? "Learning..." : "MIDI Learn"}
          </button>
          {learningPad?.bank === pad.bank && learningPad.padIndex === pad.padIndex ? (
            <button onClick={() => setLearningPad(undefined)}>Cancel</button>
          ) : null}
        </div>
      </div>
      <div className="mapping-status">
        <strong>Pad {pad.bank}{pad.padIndex + 1}</strong>
        <div>
          <span>
            {pad.midiNote !== undefined ? `MIDI note ${pad.midiNote}` : "No MIDI note mapped"}
            {learningPad?.bank === pad.bank && learningPad.padIndex === pad.padIndex ? " · waiting for note" : ""}
          </span>
          <button disabled={pad.midiNote === undefined} onClick={() => void updatePad({ midiNote: undefined })}>Clear MIDI</button>
        </div>
      </div>
      <label className="field">
        Import audio
        <input
          type="file"
          accept="audio/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void handleFile(file);
          }}
        />
      </label>
      <label className="field">
        Assigned sample
        <select value={pad.sampleId ?? ""} onChange={(event) => void updatePad({ sampleId: event.target.value || undefined })}>
          <option value="">Empty</option>
          {samples.map((sample) => (
            <option value={sample.id} key={sample.id}>{sample.name}</option>
          ))}
        </select>
      </label>
      <button disabled={!pad.sampleId} onClick={() => void updatePad({ sampleId: undefined })}>Clear sample</button>
      {assignedSample ? (
        <div className="sample-meta">
          <strong>{assignedSample.name}</strong>
          <span>{formatDurationMs(assignedSample.durationMs)} · {formatBytes(assignedSample.size)} · {assignedSample.mimeType || "unknown type"}</span>
          <button className="danger-button" onClick={() => void removeAssignedSample()}>Delete sample</button>
        </div>
      ) : null}
      <div className="control-grid">
        <NumberField label="Gain" value={pad.gain} min={0} max={1.5} step={0.05} onChange={(gain) => updatePad({ gain })} />
        <NumberField label="Pan" value={pad.pan} min={-1} max={1} step={0.05} onChange={(pan) => updatePad({ pan })} />
        <NumberField label="Pitch" value={pad.pitch} min={-24} max={24} step={1} onChange={(pitch) => updatePad({ pitch })} />
        <NumberField label="Start ms" value={pad.startMs} min={0} max={600000} step={10} onChange={(startMs) => updatePad({ startMs })} />
        <NumberField label="End ms" value={pad.endMs ?? 0} min={0} max={600000} step={10} onChange={(endMs) => updatePad({ endMs: endMs > 0 ? endMs : undefined })} />
        <OptionalNumberField label="MIDI note" value={pad.midiNote} min={0} max={127} step={1} onChange={(midiNote) => updatePad({ midiNote })} />
      </div>
      <label className="field">
        Choke group
        <input value={pad.chokeGroup ?? ""} placeholder="None" onChange={(event) => void updatePad({ chokeGroup: event.target.value.trim() || undefined })} />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={pad.oneShot} onChange={(event) => void updatePad({ oneShot: event.target.checked })} />
        One-shot
      </label>
    </section>
  );
}

function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const nextValue = parseRequiredNumberInput(event.target.value);
          if (nextValue !== undefined) void onChange(nextValue);
        }}
      />
    </label>
  );
}

function OptionalNumberField({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value?: number;
  min: number;
  max: number;
  step: number;
  onChange: (value?: number) => void;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(event) => void onChange(parseOptionalNumberInput(event.target.value))}
      />
    </label>
  );
}
