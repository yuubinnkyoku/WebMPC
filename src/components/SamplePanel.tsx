import { audioEngine } from "../services/audio";
import { importSample, savePad } from "../services/storage";
import { useAppStore } from "../store/useAppStore";
import type { Pad, Sample } from "../types/models";

type Props = {
  projectId: string;
  pads: Pad[];
  samples: Sample[];
  onRefresh: () => Promise<void>;
};

export function SamplePanel({ projectId, pads, samples, onRefresh }: Props) {
  const selectedBank = useAppStore((state) => state.selectedBank);
  const selectedPadIndex = useAppStore((state) => state.selectedPadIndex);
  const setLearningPad = useAppStore((state) => state.setLearningPad);
  const learningPad = useAppStore((state) => state.learningPad);
  const setError = useAppStore((state) => state.setError);
  const pad = pads.find((item) => item.bank === selectedBank && item.padIndex === selectedPadIndex);

  async function handleFile(file?: File) {
    if (!file) return;
    try {
      const durationMs = await audioEngine.decodeDurationMs(file).catch(() => undefined);
      const sample = await importSample(projectId, file, durationMs);
      await audioEngine.loadSample(sample).catch(() => undefined);
      if (pad) await savePad({ ...pad, sampleId: sample.id });
      await onRefresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to import sample.");
    }
  }

  async function updatePad(updates: Partial<Pad>) {
    if (!pad) return;
    await savePad({ ...pad, ...updates });
    await onRefresh();
  }

  if (!pad) return null;

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Sample</h2>
        <button onClick={() => setLearningPad({ bank: pad.bank, padIndex: pad.padIndex })}>
          {learningPad?.bank === pad.bank && learningPad.padIndex === pad.padIndex ? "Learning..." : "MIDI Learn"}
        </button>
      </div>
      <label className="field">
        Import audio
        <input type="file" accept="audio/*" onChange={(event) => void handleFile(event.target.files?.[0])} />
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
      <div className="control-grid">
        <NumberField label="Gain" value={pad.gain} min={0} max={1.5} step={0.05} onChange={(gain) => updatePad({ gain })} />
        <NumberField label="Pan" value={pad.pan} min={-1} max={1} step={0.05} onChange={(pan) => updatePad({ pan })} />
        <NumberField label="Pitch" value={pad.pitch} min={-24} max={24} step={1} onChange={(pitch) => updatePad({ pitch })} />
        <NumberField label="Start ms" value={pad.startMs} min={0} max={600000} step={10} onChange={(startMs) => updatePad({ startMs })} />
        <NumberField label="End ms" value={pad.endMs ?? 0} min={0} max={600000} step={10} onChange={(endMs) => updatePad({ endMs: endMs > 0 ? endMs : undefined })} />
        <NumberField label="MIDI note" value={pad.midiNote ?? 0} min={0} max={127} step={1} onChange={(midiNote) => updatePad({ midiNote })} />
      </div>
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
      <input type="number" value={value} min={min} max={max} step={step} onChange={(event) => void onChange(Number(event.target.value))} />
    </label>
  );
}
