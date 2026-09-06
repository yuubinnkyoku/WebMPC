import { audioEngine } from "../services/audio";
import { useAppStore } from "../store/useAppStore";

export function AudioSetupButton() {
  const audio = useAppStore((state) => state.audio);
  const masterGain = useAppStore((state) => state.settings.masterGain);
  const setAudio = useAppStore((state) => state.setAudio);
  const setError = useAppStore((state) => state.setError);

  async function start() {
    try {
      setError(undefined);
      const state = await audioEngine.start();
      audioEngine.setMasterGain(masterGain);
      setAudio(state);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to start audio.");
    }
  }

  function stopAll() {
    audioEngine.stopAll();
  }

  return (
    <section className="panel compact">
      <div>
        <h2>Audio</h2>
        <p>{audio.message}</p>
      </div>
      <div className="button-row">
        <button className="primary" onClick={start}>{audio.ready ? "Restart Audio" : "Start Audio"}</button>
        <button disabled={!audio.ready} onClick={stopAll}>Stop all</button>
      </div>
    </section>
  );
}
