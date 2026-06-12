/* global AudioWorkletProcessor, registerProcessor, sampleRate */

class WebMpcSampleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Map();
    this.voices = [];
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  handleMessage(message) {
    if (message.type === "loadSample") {
      this.samples.set(message.sampleId, {
        projectId: message.projectId,
        channels: message.channels,
        sampleRate: message.sampleRate,
        length: message.channels[0]?.length ?? 0
      });
      return;
    }

    if (message.type === "unloadSample") {
      this.samples.delete(message.sampleId);
      this.stopVoices((voice) => voice.sampleId === message.sampleId);
      return;
    }

    if (message.type === "unloadProject") {
      for (const [sampleId, sample] of this.samples.entries()) {
        if (sample.projectId === message.projectId) {
          this.samples.delete(sampleId);
        }
      }
      this.stopVoices((voice) => voice.projectId === message.projectId);
      return;
    }

    if (message.type === "trigger") {
      const sample = this.samples.get(message.sampleId);
      if (!sample || sample.length === 0) return;
      if (message.chokeGroup) {
        for (const voice of this.voices) {
          if (voice.chokeGroup === message.chokeGroup) {
            voice.stopping = true;
            voice.releaseAge = 0;
          }
        }
      }
      const startFrame = Math.max(0, Math.floor(((message.startMs ?? 0) / 1000) * sample.sampleRate));
      const endFrame = message.endMs === undefined ? sample.length : Math.min(sample.length, Math.floor((message.endMs / 1000) * sample.sampleRate));
      if (endFrame <= startFrame) return;
      this.voices.push({
        padId: message.padId,
        sampleId: message.sampleId,
        projectId: sample.projectId,
        sample,
        position: startFrame,
        startFrame,
        endFrame,
        gain: message.gain ?? 1,
        pan: Math.max(-1, Math.min(1, message.pan ?? 0)),
        step: (sample.sampleRate / sampleRate) * Math.pow(2, (message.pitch ?? 0) / 12),
        age: 0,
        stopping: false,
        releaseAge: 0,
        chokeGroup: message.chokeGroup
      });
      return;
    }

    if (message.type === "stopPad") {
      for (const voice of this.voices) {
        if (voice.padId === message.padId) {
          voice.stopping = true;
          voice.releaseAge = 0;
        }
      }
      return;
    }

    if (message.type === "stopAll") {
      this.stopVoices(() => true);
    }
  }

  stopVoices(predicate) {
    for (const voice of this.voices) {
      if (predicate(voice)) {
        voice.stopping = true;
        voice.releaseAge = 0;
      }
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] ?? output[0];
    left.fill(0);
    if (right !== left) right.fill(0);

    const remaining = [];
    for (const voice of this.voices) {
      const leftSource = voice.sample.channels[0];
      const rightSource = voice.sample.channels[1] ?? leftSource;
      const totalFrames = voice.endFrame - voice.startFrame;
      const fadeFrames = Math.max(1, Math.min(384, Math.floor(totalFrames / 2)));
      const releaseFrames = 384;
      const leftGain = voice.gain * (voice.pan <= 0 ? 1 : 1 - voice.pan);
      const rightGain = voice.gain * (voice.pan >= 0 ? 1 : 1 + voice.pan);

      for (let frame = 0; frame < left.length; frame += 1) {
        if (voice.position >= voice.endFrame) break;
        if (voice.stopping && voice.releaseAge >= releaseFrames) break;
        const sourceIndex = Math.floor(voice.position);
        const fraction = voice.position - sourceIndex;
        const nextIndex = Math.min(sourceIndex + 1, voice.endFrame - 1);
        const leftSample = interpolate(leftSource[sourceIndex] ?? 0, leftSource[nextIndex] ?? 0, fraction);
        const rightSample = interpolate(rightSource[sourceIndex] ?? 0, rightSource[nextIndex] ?? 0, fraction);
        const framesLeft = voice.endFrame - voice.position;
        const fadeIn = Math.min(1, voice.age / fadeFrames);
        const fadeOut = Math.min(1, framesLeft / fadeFrames);
        const release = voice.stopping ? Math.max(0, 1 - voice.releaseAge / releaseFrames) : 1;
        const fade = Math.max(0, Math.min(fadeIn, fadeOut, release));
        left[frame] += leftSample * leftGain * fade;
        right[frame] += rightSample * rightGain * fade;
        voice.position += voice.step;
        voice.age += voice.step;
        if (voice.stopping) voice.releaseAge += voice.step;
      }

      if (voice.position < voice.endFrame && (!voice.stopping || voice.releaseAge < releaseFrames)) remaining.push(voice);
    }
    this.voices = remaining;
    return true;
  }
}

function interpolate(a, b, amount) {
  return a + (b - a) * amount;
}

registerProcessor("webmpc-sample-processor", WebMpcSampleProcessor);
