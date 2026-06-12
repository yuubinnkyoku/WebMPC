import type { Pad, Sample } from "../types/models";
import { getPlaybackWindow } from "../utils/playbackWindow";
import { getSampleBlob, updateSampleDuration } from "./storage";

type LoadedSample = {
  sample: Sample;
  buffer: AudioBuffer;
};

type FallbackVoice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  sampleId: string;
  projectId: string;
  stopping: boolean;
};

export type AudioEngineState = {
  ready: boolean;
  usingWorklet: boolean;
  message: string;
};

class AudioEngine {
  private context?: AudioContext;
  private samples = new Map<string, LoadedSample>();
  private activeByChokeGroup = new Map<string, FallbackVoice[]>();
  private activeByPad = new Map<string, FallbackVoice[]>();
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

  setMasterGain(value: number): void {
    const gain = Math.max(0, Math.min(1, value));
    if (this.master) {
      this.master.gain.value = gain;
    }
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
    await updateSampleDuration(sample.id, Math.round(buffer.duration * 1000));
    this.postSampleToWorklet(sample.id, sample.projectId, buffer);
  }

  async loadProjectSamples(samples: Sample[]): Promise<void> {
    await Promise.all(samples.map((sample) => this.loadSample(sample).catch(() => undefined)));
  }

  unloadSample(sampleId: string): void {
    this.samples.delete(sampleId);
    this.stopMatchingFallbackVoices((voice) => voice.sampleId === sampleId);
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "unloadSample", sampleId });
    }
  }

  unloadProject(projectId: string): void {
    for (const [sampleId, loaded] of this.samples.entries()) {
      if (loaded.sample.projectId === projectId) {
        this.samples.delete(sampleId);
      }
    }
    this.stopMatchingFallbackVoices((voice) => voice.projectId === projectId);
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "unloadProject", projectId });
    }
  }

  async decodeDurationMs(file: File): Promise<number | undefined> {
    if (!this.context) return undefined;
    try {
      const buffer = await this.context.decodeAudioData(await file.arrayBuffer());
      return Math.round(buffer.duration * 1000);
    } catch {
      return undefined;
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
        padId: pad.id,
        sampleId: pad.sampleId,
        gain: Math.max(0, Math.min(1.5, pad.gain * velocity)),
        pan: Math.max(-1, Math.min(1, pad.pan)),
        pitch: pad.pitch,
        startMs: pad.startMs,
        endMs: pad.endMs,
        oneShot: pad.oneShot,
        chokeGroup: pad.chokeGroup
      });
      return;
    }

    if (pad.chokeGroup) {
      const active = this.activeByChokeGroup.get(pad.chokeGroup) ?? [];
      active.forEach((voice) => this.stopVoice(voice));
      this.activeByChokeGroup.set(pad.chokeGroup, []);
    }

    const playbackWindow = getPlaybackWindow(loaded.buffer.duration, pad.startMs, pad.endMs);
    if (!playbackWindow) return;

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

    const voice: FallbackVoice = { source, gain, sampleId: loaded.sample.id, projectId: loaded.sample.projectId, stopping: false };
    source.start(undefined, playbackWindow.startSeconds, playbackWindow.durationSeconds);
    this.fadeGain(gain, playbackWindow.durationSeconds);
    this.trackPadVoice(pad.id, voice);
    if (pad.chokeGroup) {
      const active = this.activeByChokeGroup.get(pad.chokeGroup) ?? [];
      active.push(voice);
      source.onended = () => {
        if (pad.chokeGroup) {
          const current = this.activeByChokeGroup.get(pad.chokeGroup) ?? [];
          this.activeByChokeGroup.set(pad.chokeGroup, current.filter((item) => item !== voice));
        }
        this.untrackPadVoice(pad.id, voice);
      };
      this.activeByChokeGroup.set(pad.chokeGroup, active);
    } else {
      source.onended = () => this.untrackPadVoice(pad.id, voice);
    }
  }

  stopPad(pad: Pad): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "stopPad", padId: pad.id });
      return;
    }
    const active = this.activeByPad.get(pad.id) ?? [];
    active.forEach((voice) => this.stopVoice(voice));
    this.activeByPad.set(pad.id, []);
  }

  stopAll(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: "stopAll" });
    }
    for (const active of this.activeByPad.values()) {
      active.forEach((voice) => this.stopVoice(voice));
    }
    this.activeByPad.clear();
    this.activeByChokeGroup.clear();
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
      this.samples.forEach(({ sample, buffer }, sampleId) => this.postSampleToWorklet(sampleId, sample.projectId, buffer));
      this.state = { ...this.state, usingWorklet: true, message: "Audio ready with AudioWorklet" };
    } catch {
      this.workletNode = undefined;
      this.state = { ...this.state, usingWorklet: false };
    }
  }

  private postSampleToWorklet(sampleId: string, projectId: string, buffer: AudioBuffer): void {
    if (!this.workletNode) return;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => new Float32Array(buffer.getChannelData(index)));
    this.workletNode.port.postMessage(
      {
        type: "loadSample",
        sampleId,
        projectId,
        sampleRate: buffer.sampleRate,
        channels
      },
      channels.map((channel) => channel.buffer)
    );
  }

  private trackPadVoice(padId: string, voice: FallbackVoice): void {
    const active = this.activeByPad.get(padId) ?? [];
    active.push(voice);
    this.activeByPad.set(padId, active);
  }

  private untrackPadVoice(padId: string, voice: FallbackVoice): void {
    const active = this.activeByPad.get(padId) ?? [];
    this.activeByPad.set(padId, active.filter((item) => item !== voice));
  }

  private stopMatchingFallbackVoices(predicate: (voice: FallbackVoice) => boolean): void {
    for (const active of this.activeByPad.values()) {
      active.filter(predicate).forEach((voice) => this.stopVoice(voice));
    }
    this.pruneFallbackVoiceMaps(predicate);
  }

  private pruneFallbackVoiceMaps(predicate: (voice: FallbackVoice) => boolean): void {
    for (const [padId, active] of this.activeByPad.entries()) {
      const remaining = active.filter((voice) => !predicate(voice));
      if (remaining.length > 0) {
        this.activeByPad.set(padId, remaining);
      } else {
        this.activeByPad.delete(padId);
      }
    }
    for (const [chokeGroup, active] of this.activeByChokeGroup.entries()) {
      const remaining = active.filter((voice) => !predicate(voice));
      if (remaining.length > 0) {
        this.activeByChokeGroup.set(chokeGroup, remaining);
      } else {
        this.activeByChokeGroup.delete(chokeGroup);
      }
    }
  }

  private stopVoice(voice: FallbackVoice): void {
    if (voice.stopping || !this.context) return;
    voice.stopping = true;
    const now = this.context.currentTime;
    const releaseSeconds = 0.015;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + releaseSeconds);
      voice.source.stop(now + releaseSeconds);
    } catch {
      // Already stopped sources can throw in some browsers.
    }
  }
}

export const audioEngine = new AudioEngine();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
