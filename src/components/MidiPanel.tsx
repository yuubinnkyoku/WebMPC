import { useCallback, useEffect, useRef } from "react";
import { audioEngine } from "../services/audio";
import { midiService } from "../services/midi";
import { applyMidiMapping, savePad } from "../services/storage";
import { useAppStore } from "../store/useAppStore";
import type { MidiMessage, Pad } from "../types/models";
import { isNoteOff, isNoteOn, velocityToGain } from "../utils/midi";
import { MidiMonitor } from "./MidiMonitor";

type Props = {
  projectId: string;
  pads: Pad[];
  onRefresh: (projectId?: string) => Promise<void>;
};

export function MidiPanel({ projectId, pads, onRefresh }: Props) {
  const padsRef = useRef(pads);
  const onRefreshRef = useRef(onRefresh);
  const learningPadRef = useRef(useAppStore.getState().learningPad);
  const midiSupported = midiService.isSupported();
  const midiEnabled = useAppStore((state) => state.midiEnabled);
  const midiInputs = useAppStore((state) => state.midiInputs);
  const midiMessages = useAppStore((state) => state.midiMessages);
  const learningPad = useAppStore((state) => state.learningPad);
  const setLearningPad = useAppStore((state) => state.setLearningPad);
  const setMidi = useAppStore((state) => state.setMidi);
  const pushMidiMessage = useAppStore((state) => state.pushMidiMessage);
  const flashPad = useAppStore((state) => state.flashPad);
  const setError = useAppStore((state) => state.setError);

  const handleMidi = useCallback(async (message: MidiMessage) => {
    pushMidiMessage(message);
    if (isNoteOff(message.command, message.data2)) {
      const pad = padsRef.current.find((item) => item.midiNote === message.data1);
      if (pad && !pad.oneShot) {
        audioEngine.stopPad(pad);
      }
      return;
    }
    if (!isNoteOn(message.command, message.data2)) return;
    const learning = learningPadRef.current;
    if (learning) {
      const learned = padsRef.current.find((pad) => pad.bank === learning.bank && pad.padIndex === learning.padIndex);
      if (learned) {
        await savePad({ ...learned, midiNote: message.data1 });
        await onRefreshRef.current();
      }
      setLearningPad(undefined);
      return;
    }
    const pad = padsRef.current.find((item) => item.midiNote === message.data1);
    if (!pad) return;
    try {
      flashPad(pad.bank, pad.padIndex);
      await audioEngine.playPad(pad, velocityToGain(message.data2));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to trigger MIDI pad.");
    }
  }, [flashPad, pushMidiMessage, setError, setLearningPad]);

  useEffect(() => {
    padsRef.current = pads;
    onRefreshRef.current = onRefresh;
  }, [pads, onRefresh]);

  useEffect(() => {
    learningPadRef.current = learningPad;
  }, [learningPad]);

  useEffect(() => {
    return midiService.subscribe((message) => void handleMidi(message));
  }, [handleMidi]);

  useEffect(() => {
    return midiService.subscribeInputs((inputs) => {
      setMidi(midiService.enabled, inputs.map((input) => input.name ?? input.id));
    });
  }, [setMidi]);

  async function enable() {
    try {
      const inputs = await midiService.requestAccess();
      setMidi(true, inputs.map((input) => input.name ?? input.id));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to enable MIDI.");
    }
  }

  async function applyDefaultMapping() {
    try {
      await applyMidiMapping(projectId);
      await onRefresh(projectId);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to apply MIDI mapping.");
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>MIDI</h2>
        <div className="button-row">
          <button onClick={applyDefaultMapping}>Apply MPD218</button>
          <button disabled={!midiSupported} onClick={enable}>{midiEnabled ? "Refresh MIDI" : "Enable MIDI"}</button>
        </div>
      </div>
      <p>{midiSupported ? "Web MIDI available" : "Web MIDI unavailable in this browser"}</p>
      <div className="chip-row">
        {midiInputs.length === 0 ? <span className="chip">No inputs</span> : midiInputs.map((input) => <span className="chip" key={input}>{input}</span>)}
      </div>
      <MidiMonitor messages={midiMessages} />
    </section>
  );
}
