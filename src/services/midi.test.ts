import { afterEach, describe, expect, it, vi } from "vitest";
import type { MidiAccess, MidiInput, MidiMessageEventLike } from "../types/webmidi";
import { MidiService } from "./midi";

function createInput(id: string, name: string): MidiInput {
  return {
    id,
    name,
    onmidimessage: null
  };
}

function createAccess(inputs: MidiInput[]): MidiAccess {
  return {
    inputs: {
      values: () => inputs.values()
    },
    onstatechange: null
  };
}

function send(input: MidiInput, bytes: number[]): void {
  input.onmidimessage?.({
    data: new Uint8Array(bytes),
    timeStamp: 0,
    currentTarget: input
  } satisfies MidiMessageEventLike);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MIDI service", () => {
  it("reports unsupported environments with a stable error", async () => {
    vi.stubGlobal("navigator", {});
    const service = new MidiService();

    expect(service.isSupported()).toBe(false);
    await expect(service.requestAccess()).rejects.toThrow("Web MIDI is not available in this browser.");
  });

  it("requests non-sysex access, lists inputs, and emits parsed MIDI messages", async () => {
    const input = createInput("input-1", "MPD218");
    const access = createAccess([input]);
    const requestMIDIAccess = vi.fn(async () => access);
    vi.stubGlobal("navigator", { requestMIDIAccess });
    const service = new MidiService();
    const inputUpdates: string[][] = [];
    const messages: Array<{ command: number; channel: number; data1: number; data2: number; inputName: string; label: string }> = [];
    service.subscribeInputs((inputs) => inputUpdates.push(inputs.map((item) => item.id)));
    service.subscribe(({ command, channel, data1, data2, inputName, label }) =>
      messages.push({ command, channel, data1, data2, inputName, label })
    );

    await expect(service.requestAccess()).resolves.toEqual([input]);
    expect(requestMIDIAccess).toHaveBeenCalledWith({ sysex: false });
    expect(service.enabled).toBe(true);
    expect(inputUpdates).toEqual([[], ["input-1"]]);

    send(input, [0x91, 36, 100]);
    send(input, [0x90, 36, 0]);
    send(input, [0xb2, 1, 64]);

    expect(messages).toEqual([
      { command: 0x90, channel: 2, data1: 36, data2: 100, inputName: "MPD218", label: "Note on 36 velocity 100" },
      { command: 0x90, channel: 1, data1: 36, data2: 0, inputName: "MPD218", label: "Note off 36" },
      { command: 0xb0, channel: 3, data1: 1, data2: 64, inputName: "MPD218", label: "CC 1 value 64" }
    ]);
  });

  it("refreshes connected inputs and detaches the previous access object", async () => {
    const oldInput = createInput("old", "Old input");
    const newInput = createInput("new", "New input");
    const oldAccess = createAccess([oldInput]);
    const newAccess = createAccess([newInput]);
    const requestMIDIAccess = vi.fn()
      .mockResolvedValueOnce(oldAccess)
      .mockResolvedValueOnce(newAccess);
    vi.stubGlobal("navigator", { requestMIDIAccess });
    const service = new MidiService();
    const updates: string[][] = [];
    service.subscribeInputs((inputs) => updates.push(inputs.map((input) => input.id)));

    await service.requestAccess();
    expect(oldAccess.onstatechange).toBeTypeOf("function");
    expect(oldInput.onmidimessage).toBeTypeOf("function");

    await service.requestAccess();

    expect(oldAccess.onstatechange).toBeNull();
    expect(oldInput.onmidimessage).toBeNull();
    expect(newAccess.onstatechange).toBeTypeOf("function");
    expect(newInput.onmidimessage).toBeTypeOf("function");
    expect(service.inputs).toEqual([newInput]);
    expect(updates).toEqual([[], ["old"], ["new"]]);
  });
});
