import type { MidiMessage } from "../types/models";

type Props = {
  messages: MidiMessage[];
};

export function MidiMonitor({ messages }: Props) {
  return (
    <div className="midi-monitor">
      {messages.length === 0 ? <p>No MIDI messages yet.</p> : null}
      {messages.map((message) => (
        <div className="midi-row" key={message.id}>
          <span>{new Date(message.receivedAt).toLocaleTimeString()}</span>
          <span>{message.inputName}</span>
          <span>{message.label}</span>
        </div>
      ))}
    </div>
  );
}
