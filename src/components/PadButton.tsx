import type { Pad, Sample } from "../types/models";

type Props = {
  pad: Pad;
  sample?: Sample;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  onTrigger: () => void;
};

export function PadButton({ pad, sample, selected, active, onSelect, onTrigger }: Props) {
  return (
    <button
      className={`pad ${selected ? "selected" : ""} ${active ? "active" : ""}`}
      onClick={() => {
        onSelect();
        void onTrigger();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onSelect();
      }}
    >
      <span className="pad-index">{pad.padIndex + 1}</span>
      <span className="pad-name">{sample?.name ?? "Empty"}</span>
      <span className="pad-note">{pad.midiNote ? `MIDI ${pad.midiNote}` : "No MIDI"}</span>
    </button>
  );
}
