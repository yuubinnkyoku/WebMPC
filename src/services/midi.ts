import type { MidiAccess, MidiCapableNavigator, MidiInput, MidiMessageEventLike } from "../types/webmidi";
import type { MidiMessage } from "../types/models";
import { makeId } from "../utils/id";
import { labelMidiMessage } from "../utils/midi";

type MidiListener = (message: MidiMessage) => void;

class MidiService {
  private access?: MidiAccess;
  private listeners = new Set<MidiListener>();
  inputs: MidiInput[] = [];
  enabled = false;

  isSupported(): boolean {
    return typeof navigator !== "undefined" && Boolean((navigator as unknown as MidiCapableNavigator).requestMIDIAccess);
  }

  async requestAccess(): Promise<MidiInput[]> {
    const requestMIDIAccess = (navigator as unknown as MidiCapableNavigator).requestMIDIAccess;
    if (!requestMIDIAccess) {
      throw new Error("Web MIDI is not available in this browser.");
    }
    const access = await requestMIDIAccess({ sysex: false });
    this.access = access;
    this.enabled = true;
    this.refreshInputs();
    access.onstatechange = () => this.refreshInputs();
    return this.inputs;
  }

  subscribe(listener: MidiListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private refreshInputs(): void {
    if (!this.access) return;
    this.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
    this.inputs = Array.from(this.access.inputs.values());
    this.inputs.forEach((input) => {
      input.onmidimessage = (event) => this.handleMessage(event);
    });
  }

  private handleMessage(event: MidiMessageEventLike): void {
    const [status = 0, data1 = 0, data2 = 0] = Array.from(event.data);
    const command = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    const inputName = event.currentTarget?.name ?? "MIDI input";
    const label = labelMidiMessage(command, data1, data2);
    const message: MidiMessage = {
      id: makeId("midi"),
      receivedAt: Date.now(),
      inputName,
      status,
      command,
      channel,
      data1,
      data2,
      label
    };
    this.listeners.forEach((listener) => listener(message));
  }
}

export const midiService = new MidiService();
