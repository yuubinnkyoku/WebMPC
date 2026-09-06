import { useCallback, useEffect, useMemo, useRef } from "react";
import { audioEngine } from "../services/audio";
import { useAppStore } from "../store/useAppStore";
import type { Pad, Sample } from "../types/models";
import { ActiveInputs } from "../utils/activeInputs";
import { BANKS, formatBankAriaLabel } from "../utils/banks";
import { getKeyboardPadIndex, getKeyboardPadLabel } from "../utils/keyboardPads";
import { shouldIgnorePadKeyboardEventTarget } from "../utils/keyboardTarget";
import { getVisiblePads } from "../utils/visiblePads";
import { PadButton } from "./PadButton";

type Props = {
  pads: Pad[];
  samples: Sample[];
};

export function PadGrid({ pads, samples }: Props) {
  const activeKeyboardPads = useRef(new ActiveInputs<Pad>());
  const selectedBank = useAppStore((state) => state.selectedBank);
  const selectedPadIndex = useAppStore((state) => state.selectedPadIndex);
  const triggeredPads = useAppStore((state) => state.triggeredPads);
  const setSelectedBank = useAppStore((state) => state.setSelectedBank);
  const setSelectedPadIndex = useAppStore((state) => state.setSelectedPadIndex);
  const flashPad = useAppStore((state) => state.flashPad);
  const setError = useAppStore((state) => state.setError);

  const visiblePads = useMemo(() => getVisiblePads(pads, selectedBank), [pads, selectedBank]);

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
    function releaseActivePads() {
      activeKeyboardPads.current.drain().forEach(stop);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") releaseActivePads();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || shouldIgnorePadKeyboardEventTarget(event.target)) return;
      const padIndex = getKeyboardPadIndex(event.code);
      if (padIndex === undefined) return;
      const pad = visiblePads.find((item) => item.padIndex === padIndex);
      if (!pad) return;
      event.preventDefault();
      const previous = activeKeyboardPads.current.hold(event.code, pad);
      if (previous) stop(previous);
      setSelectedPadIndex(pad.padIndex);
      void trigger(pad);
    }

    function onKeyUp(event: KeyboardEvent) {
      const padIndex = getKeyboardPadIndex(event.code);
      if (padIndex === undefined) return;
      const pad = activeKeyboardPads.current.release(event.code);
      if (!pad) return;
      event.preventDefault();
      stop(pad);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseActivePads);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      releaseActivePads();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseActivePads);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [setSelectedPadIndex, stop, trigger, visiblePads]);

  return (
    <section className="panel pads-panel">
      <div className="panel-heading">
        <h2>Pads</h2>
        <div className="segmented">
          {BANKS.map((bank) => (
            <button
              key={bank}
              className={bank === selectedBank ? "selected" : ""}
              aria-pressed={bank === selectedBank}
              aria-label={formatBankAriaLabel(bank)}
              onClick={() => setSelectedBank(bank)}
            >
              {bank}
            </button>
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
            shortcut={getKeyboardPadLabel(pad.padIndex)}
            onSelect={() => setSelectedPadIndex(pad.padIndex)}
            onTrigger={() => trigger(pad)}
            onStop={() => stop(pad)}
          />
        ))}
      </div>
    </section>
  );
}
