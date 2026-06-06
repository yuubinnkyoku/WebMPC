import type { Pad, Sample } from "../types/models";
import { getSampleBlob } from "./storage";

type LoadedSample = {
  sample: Sample;
  buffer: AudioBuffer;
};

export type AudioEngineState = {
  ready: boolean;
  usingWorklet: boolean;
  message: string;
};

class AudioEngine {
  private context?: AudioContext;
  private samples = new Map<string, LoadedSample>();
  private activeByChokeGroup = new Map<string, AudioBufferSourceNode[]>();
  private master?: GainNode;
  private workletNode?: AudioWorkletNode;
  private workletSetup?: Promise<void>;
  state: AudioEngineState = { ready: false, usingWorklet: false, message: "Audio stopped" };

  async start(): Promise<AudioEngineState> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.context.destination);
      this.workletSetup = this.tryLoadWorklet();
      await Promise.race([this.workletSetup, delay(700)]);
    }
    if (this.context.state !== "running") {
      await Promise.race([this.context.resume(), delay(400)]);
    }
    this.state = {
      ...this.state,
      ready: true,
      message:
        this.context.state !== "running"
          ? "Audio initialized; tap a pad if Chrome is still resuming audio"
          : this.workletNode
            ? "Audio ready with AudioWorklet"
            : "Audio ready with buffer fallback"
    };
    return this.state;
  }

  async loadSample(sample: Sample): Promise<void> {
    if (!this.context) {
      throw new Error("Start audio before loading samples.");
    }
    const blob = await getSampleBlob(sample.id);
    if (!blob) {
      throw new Error(`Missing local sample data for ${sample.name}.`);
    }
    const buffer = await this.context.decodeAudioData(await blob.arrayBuffer());
    this.samples.set(sample.id, { sample, buffer });
    this.postSampleToWorklet(sample.id, buffer);
  }

  async loadProjectSamples(samples: Sample[]): Promise<void> {
    await Promise.all(samples.map((sample) => this.loadSample(sample).catch(() => undefined)));
  }

  async decodeDurationMs(file: File): Promise<number | undefined> {
    const temporaryContext = this.context ?? new AudioContext();
    try {
      const buffer = await temporaryContext.decodeAudioData(await file.arrayBuffer());
      return Math.round(buffer.duration * 1000);
    } finally {
      if (!this.context) await temporaryContext.close();
    }
  }

  async playPad(pad: Pad, velocity = 1): Promise<void> {
    if (!this.context || !this.master) {
      throw new Error("Start audio before playing.");
    }
    if (!pad.sampleId) {
      return;
    }
    const loaded = this.samples.get(pad.sampleId);
    if (!loaded) {
      throw new Error("Sample is not loaded into the audio engine.");
    }

    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: "trigger",
        sampleId: pad.sampleId,
        gain: Math.max(0, Math.min(1.5, pad.gain * velocity)),
        pan: Math.max(-1, Math.min(1, pad.pan)),
        pitch: pad.pitch,
        startMs: pad.startMs,
        endMs: pad.endMs,
        chokeGroup: pad.chokeGroup
      });
      return;
    }

    if (pad.chokeGroup) {
      const active = this.activeByChokeGroup.get(pad.chokeGroup) ?? [];
      active.forEach((source) => source.stop());
      this.activeByChokeGroup.set(pad.chokeGroup, []);
    }

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    source.buffer = loaded.buffer;
    source.playbackRate.value = Math.pow(2, pad.pitch / 12);
    gain.gain.value = Math.max(0, Math.min(1.5, pad.gain * velocity));
    panner.pan.value = Math.max(-1, Math.min(1, pad.pan));

    source.connect(gain);
    gain.connect(panner);
    panner.connect(this.master);

    const startSeconds = Math.max(0, pad.startMs / 1000);
    const endSeconds = pad.endMs ? Math.max(startSeconds, pad.endMs / 1000) : loaded.buffer.duration;
    const duration = Math.max(0.005, Math.min(loaded.buffer.duration - startSeconds, endSeconds - startSeconds));
    source.start(undefined, startSeconds, duration);
    this.fadeGain(gain, duration);
    if (pad.chokeGroup) {
      const active = this.activeByChokeGroup.get(pad.chokeGroup) ?? [];
      active.push(source);
      source.onended = () => this.activeByChokeGroup.set(pad.chokeGroup ?? "", active.filter((item) => item !== source));
      this.activeByChokeGroup.set(pad.chokeGroup, active);
    }
  }

  private fadeGain(gain: GainNode, duration: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const target = gain.gain.value;
    const fade = Math.min(0.008, duration / 2);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, target), now + fade);
    gain.gain.setValueAtTime(Math.max(0.0001, target), now + Math.max(fade, duration - fade));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  }

  private async tryLoadWorklet(): Promise<void> {
    if (!this.context || !("audioWorklet" in this.context)) return;
    try {
      await this.context.audioWorklet.addModule("/sample-worklet.js");
      if (!this.master) return;
      this.workletNode = new AudioWorkletNode(this.context, "webmpc-sample-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      this.workletNode.connect(this.master);
      this.samples.forEach(({ buffer }, sampleId) => this.postSampleToWorklet(sampleId, buffer));
      this.state = { ...this.state, usingWorklet: true, message: "Audio ready with AudioWorklet" };
    } catch {
      this.workletNode = undefined;
      this.state = { ...this.state, usingWorklet: false };
    }
  }

  private postSampleToWorklet(sampleId: string, buffer: AudioBuffer): void {
    if (!this.workletNode) return;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => new Float32Array(buffer.getChannelData(index)));
    this.workletNode.port.postMessage(
      {
        type: "loadSample",
        sampleId,
        sampleRate: buffer.sampleRate,
        channels
      },
      channels.map((channel) => channel.buffer)
    );
  }
}

export const audioEngine = new AudioEngine();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
