import { beforeAll, describe, expect, it } from "vitest";

let Processor;

beforeAll(async () => {
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = { onmessage: null };
    }
  };
  globalThis.sampleRate = 48000;
  globalThis.registerProcessor = (name, processor) => {
    expect(name).toBe("webmpc-sample-processor");
    Processor = processor;
  };
  await import("../../public/sample-worklet.js");
});

function createProcessor() {
  return new Processor();
}

function loadSample(processor, { sampleId = "sample-1", projectId = "project-1", length = 48000 } = {}) {
  processor.handleMessage({
    type: "loadSample",
    sampleId,
    projectId,
    sampleRate: 48000,
    channels: [new Float32Array(length).fill(1)]
  });
}

function trigger(processor, overrides = {}) {
  processor.handleMessage({
    type: "trigger",
    padId: "pad-1",
    sampleId: "sample-1",
    gain: 1,
    pan: 0,
    pitch: 0,
    startMs: 0,
    oneShot: true,
    ...overrides
  });
}

function processBlock(processor, size = 128) {
  const left = new Float32Array(size);
  const right = new Float32Array(size);
  expect(processor.process([], [[left, right]])).toBe(true);
  return { left, right };
}

function renderUntilSilent(processor, maxBlocks = 100) {
  let renderedFrames = 0;
  while (processor.voices.length > 0 && renderedFrames < maxBlocks * 128) {
    processBlock(processor);
    renderedFrames += 128;
  }
  return renderedFrames;
}

describe("AudioWorklet sample processor", () => {
  it("renders loaded samples with gain and pan", () => {
    const processor = createProcessor();
    loadSample(processor);
    trigger(processor, { gain: 0.5, pan: -1 });

    processBlock(processor, 512);
    const output = processBlock(processor);

    expect(Math.max(...output.left)).toBeCloseTo(0.5, 3);
    expect(Math.max(...output.right)).toBe(0);
  });

  it("keeps stop release length stable across pitch changes", () => {
    const releaseLengths = [12, -12].map((pitch) => {
      const processor = createProcessor();
      loadSample(processor);
      trigger(processor, { pitch });
      processBlock(processor, 512);
      processor.handleMessage({ type: "stopPad", padId: "pad-1" });
      return renderUntilSilent(processor);
    });

    expect(releaseLengths).toEqual([384, 384]);
  });

  it("chokes only voices in the matching group", () => {
    const processor = createProcessor();
    loadSample(processor);
    trigger(processor, { padId: "open-hat", chokeGroup: "hats" });
    trigger(processor, { padId: "kick", chokeGroup: "drums" });
    trigger(processor, { padId: "closed-hat", chokeGroup: "hats" });

    expect(processor.voices).toHaveLength(3);
    expect(processor.voices.find((voice) => voice.padId === "open-hat")?.stopping).toBe(true);
    expect(processor.voices.find((voice) => voice.padId === "kick")?.stopping).toBe(false);
    expect(processor.voices.find((voice) => voice.padId === "closed-hat")?.stopping).toBe(false);
  });

  it("unloads sample and project voices through a short release", () => {
    const processor = createProcessor();
    loadSample(processor, { sampleId: "sample-1", projectId: "project-1" });
    loadSample(processor, { sampleId: "sample-2", projectId: "project-2" });
    trigger(processor, { padId: "pad-1", sampleId: "sample-1" });
    trigger(processor, { padId: "pad-2", sampleId: "sample-2" });

    processor.handleMessage({ type: "unloadSample", sampleId: "sample-1" });
    processor.handleMessage({ type: "unloadProject", projectId: "project-2" });

    expect(processor.samples.size).toBe(0);
    expect(processor.voices.every((voice) => voice.stopping)).toBe(true);
    expect(renderUntilSilent(processor)).toBe(384);
  });
});
