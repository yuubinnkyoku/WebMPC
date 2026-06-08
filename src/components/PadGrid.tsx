import { useCallback, useEffect, useMemo } from "react";
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
const keyboardPadMap = ["Digit1", "Digit2", "Digit3", "Digit4", "KeyQ", "KeyW", "KeyE", "KeyR", "KeyA", "KeyS", "KeyD", "KeyF", "KeyZ", "KeyX", "KeyC", "KeyV"];
const keyboardPadLabels = ["1", "2", "3", "4", "Q", "W", "E", "R", "A", "S", "D", "F", "Z", "X", "C", "V"];

export function PadGrid({ pads, samples }: Props) {
  const selectedBank = useAppStore((state) => state.selectedBank);
  const selectedPadIndex = useAppStore((state) => state.selectedPadIndex);
  const triggeredPads = useAppStore((state) => state.triggeredPads);
  const setSelectedBank = useAppStore((state) => state.setSelectedBank);
  const setSelectedPadIndex = useAppStore((state) => state.setSelectedPadIndex);
  const flashPad = useAppStore((state) => state.flashPad);
  const setError = useAppStore((state) => state.setError);

  const visiblePads = useMemo(
    () => pads.filter((pad) => pad.bank === selectedBank).sort((a, b) => a.padIndex - b.padIndex),
    [pads, selectedBank]
  );

  const trigger = useCallback(async (pad: Pad) => {
    try {
      flashPad(pad.bank, pad.padIndex);
      await audioEngine.playPad(pad, 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to play pad.");
    }
  }, [flashPad, setError]);

  const stop = useCallback((pad: Pad) => {
    if (!pad.oneShot) {
      audioEngine.stopPad(pad);
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || isFormTarget(event.target)) return;
      const padIndex = keyboardPadMap.indexOf(event.code);
      if (padIndex === -1) return;
      const pad = visiblePads.find((item) => item.padIndex === padIndex);
      if (!pad) return;
      event.preventDefault();
      setSelectedPadIndex(pad.padIndex);
      void trigger(pad);
    }

    function onKeyUp(event: KeyboardEvent) {
      if (isFormTarget(event.target)) return;
      const padIndex = keyboardPadMap.indexOf(event.code);
      if (padIndex === -1) return;
      const pad = visiblePads.find((item) => item.padIndex === padIndex);
      if (!pad) return;
      event.preventDefault();
      stop(pad);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setSelectedPadIndex, stop, trigger, visiblePads]);

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
            shortcut={keyboardPadLabels[pad.padIndex]}
            onSelect={() => setSelectedPadIndex(pad.padIndex)}
            onTrigger={() => trigger(pad)}
            onStop={() => stop(pad)}
          />
        ))}
      </div>
    </section>
  );
}

function isFormTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName) || target.isContentEditable;
}
