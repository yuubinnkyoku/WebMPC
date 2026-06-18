import type { PointerEvent } from "react";
import type { Pad, Sample } from "../types/models";
import { formatPadAriaLabel, formatPadMidiLabel, formatPadSampleLabel } from "../utils/padLabel";

type Props = {
  pad: Pad;
  sample?: Sample;
  selected: boolean;
  active: boolean;
  shortcut?: string;
  onSelect: () => void;
  onTrigger: () => void;
  onStop: () => void;
};

export function PadButton({ pad, sample, selected, active, shortcut, onSelect, onTrigger, onStop }: Props) {
  const sampleName = formatPadSampleLabel(sample);
  const midiLabel = formatPadMidiLabel(pad);

  function press(event: PointerEvent<HTMLButtonElement>) {
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    onSelect();
    void onTrigger();
  }

  function release(event: PointerEvent<HTMLButtonElement>) {
    if (
      typeof event.currentTarget.hasPointerCapture === "function" &&
      typeof event.currentTarget.releasePointerCapture === "function" &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onStop();
  }

  return (
    <button
      type="button"
      aria-label={formatPadAriaLabel(pad, sample, shortcut)}
      className={`pad ${selected ? "selected" : ""} ${active ? "active" : ""}`}
      onClick={(event) => {
        if (event.detail === 0) {
          onSelect();
          void onTrigger();
        }
      }}
      onPointerCancel={release}
      onPointerDown={press}
      onPointerUp={release}
      onContextMenu={(event) => {
        event.preventDefault();
        onSelect();
      }}
    >
      <span className="pad-index">
        {pad.padIndex + 1}
        {shortcut ? <kbd>{shortcut}</kbd> : null}
      </span>
      <span className="pad-name">{sampleName}</span>
      <span className="pad-note">{midiLabel}</span>
    </button>
  );
}
