import { audioEngine } from "../services/audio";
import { useAppStore } from "../store/useAppStore";
import type { Bank, Pad, Sample } from "../types/models";
import { PadButton } from "./PadButton";

type Props = {
  pads: Pad[];
  samples: Sample[];
  onPadChanged: () => Promise<void>;
};

const banks: Bank[] = ["A", "B", "C", "D"];

export function PadGrid({ pads, samples }: Props) {
  const selectedBank = useAppStore((state) => state.selectedBank);
  const selectedPadIndex = useAppStore((state) => state.selectedPadIndex);
  const triggeredPads = useAppStore((state) => state.triggeredPads);
  const setSelectedBank = useAppStore((state) => state.setSelectedBank);
  const setSelectedPadIndex = useAppStore((state) => state.setSelectedPadIndex);
  const flashPad = useAppStore((state) => state.flashPad);
  const setError = useAppStore((state) => state.setError);

  const visiblePads = pads.filter((pad) => pad.bank === selectedBank).sort((a, b) => a.padIndex - b.padIndex);

  async function trigger(pad: Pad) {
    try {
      flashPad(pad.bank, pad.padIndex);
      await audioEngine.playPad(pad, 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to play pad.");
    }
  }

  return (
    <section className="panel pads-panel">
      <div className="panel-heading">
        <h2>Pads</h2>
        <div className="segmented">
          {banks.map((bank) => (
            <button key={bank} className={bank === selectedBank ? "selected" : ""} onClick={() => setSelectedBank(bank)}>{bank}</button>
          ))}
        </div>
      </div>
      <div className="pad-grid">
        {visiblePads.map((pad) => (
          <PadButton
            key={pad.id}
            pad={pad}
            sample={samples.find((sample) => sample.id === pad.sampleId)}
            selected={pad.padIndex === selectedPadIndex}
            active={Date.now() - (triggeredPads[`${pad.bank}:${pad.padIndex}`] ?? 0) < 180}
            onSelect={() => setSelectedPadIndex(pad.padIndex)}
            onTrigger={() => trigger(pad)}
          />
        ))}
      </div>
    </section>
  );
}
