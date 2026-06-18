import type { MidiMessage } from "../types/models";
import { formatTimeOfDay } from "../utils/format";

type Props = {
  messages: MidiMessage[];
};

export function MidiMonitor({ messages }: Props) {
  return (
    <div className="midi-monitor">
      {messages.length === 0 ? <p>No MIDI messages yet.</p> : null}
      {messages.map((message) => (
        <div className="midi-row" key={message.id}>
          <span>{formatTimeOfDay(message.receivedAt)}</span>
          <span>{message.inputName}</span>
          <span>{message.label}</span>
        </div>
      ))}
    </div>
  );
}
