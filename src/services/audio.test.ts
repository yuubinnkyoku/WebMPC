import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioEngine, type LoadSamplesResult } from "./audio";
import { createProject, db, getPads, importSample } from "./storage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("audio project lifecycle", () => {
  it("plays through the AudioBufferSource fallback when AudioWorklet is unavailable", async () => {
    await db.delete();
    await db.open();
    const project = await createProject("Fallback project");
    const sample = await importSample(
      project.id,
      new File([new Uint8Array([1, 2, 3, 4])], "fallback.wav", { type: "audio/wav" })
    );
    const pad = (await getPads(project.id))[0];
    expect(pad).toBeDefined();

    const sources: Array<{
      playbackRate: { value: number };
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      onended?: () => void;
    }> = [];
    const gains: Array<{
      value: number;
      cancelScheduledValues: ReturnType<typeof vi.fn>;
      setValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    }> = [];
    const decodedBuffer = {
      duration: 1,
      numberOfChannels: 1,
      sampleRate: 48_000,
      getChannelData: () => new Float32Array(48_000)
    } as unknown as AudioBuffer;
    class FallbackAudioContext {
      state = "running";
      destination = {};
      currentTime = 2;
      createGain() {
        const gain = {
          value: 0,
          cancelScheduledValues: vi.fn(),
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn()
        };
        gains.push(gain);
        return { gain, connect: vi.fn() };
      }
      createStereoPanner() {
        return { pan: { value: 0 }, connect: vi.fn() };
      }
      createBufferSource() {
        const source = {
          buffer: undefined as AudioBuffer | undefined,
          playbackRate: { value: 1 },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: undefined as (() => void) | undefined
        };
        sources.push(source);
        return source;
      }
      decodeAudioData() {
        return Promise.resolve(decodedBuffer);
      }
    }
    vi.stubGlobal("window", { setTimeout });
    vi.stubGlobal("AudioContext", FallbackAudioContext);

    const engine = new AudioEngine();
    const state = await engine.start();
    expect(state).toMatchObject({ ready: true, usingWorklet: false, message: "Audio ready with buffer fallback" });

    await engine.activateProject(project.id, [sample]);
    await engine.playPad({ ...pad!, sampleId: sample.id, startMs: 100, endMs: 600, pitch: 12 }, 0.5);

    expect(sources).toHaveLength(1);
    expect(sources[0]?.playbackRate.value).toBe(2);
    expect(sources[0]?.start).toHaveBeenCalledWith(undefined, 0.1, 0.5);
    expect(gains[1]?.value).toBe(0.5);

    engine.stopPad(pad!);
    expect(gains[1]?.cancelScheduledValues).toHaveBeenCalledWith(2);
    expect(sources[0]?.stop).toHaveBeenCalledWith(2.015);
  });

  it("unloads the previous project when the active project changes", async () => {
    const engine = new AudioEngine();
    const unloadProject = vi.spyOn(engine, "unloadProject");

    await engine.activateProject("project-a", []);
    await engine.activateProject("project-a", []);
    expect(unloadProject).not.toHaveBeenCalled();

    await engine.activateProject("project-b", []);
    expect(unloadProject).toHaveBeenCalledWith("project-a");

    engine.deactivateProject();
    expect(unloadProject).toHaveBeenCalledWith("project-b");
  });

  it("removes samples that finish loading after another project becomes active", async () => {
    const engine = new AudioEngine();
    let finishProjectA: ((result: LoadSamplesResult) => void) | undefined;
    vi.spyOn(engine, "loadProjectSamples")
      .mockImplementationOnce(() => new Promise((resolve) => {
        finishProjectA = resolve;
      }))
      .mockResolvedValueOnce({ loaded: 0, failed: [] });
    const unloadProject = vi.spyOn(engine, "unloadProject");

    const projectA = engine.activateProject("project-a", []);
    await engine.activateProject("project-b", []);
    finishProjectA?.({ loaded: 1, failed: [] });
    await projectA;

    expect(unloadProject).toHaveBeenCalledWith("project-a");
    expect(unloadProject.mock.calls.filter(([projectId]) => projectId === "project-a")).toHaveLength(2);
  });

  it("does not cache a directly imported sample that finishes decoding after a project switch", async () => {
    await db.delete();
    await db.open();
    const projectA = await createProject("Project A");
    const projectB = await createProject("Project B");
    const sample = await importSample(
      projectA.id,
      new File([new Uint8Array([1, 2, 3, 4])], "late.wav", { type: "audio/wav" })
    );
    const pad = (await getPads(projectA.id))[0];
    expect(pad).toBeDefined();

    let finishDecode: ((buffer: AudioBuffer) => void) | undefined;
    const decodedBuffer = {
      duration: 1,
      numberOfChannels: 1,
      sampleRate: 48_000,
      getChannelData: () => new Float32Array(48_000)
    } as unknown as AudioBuffer;
    class FakeAudioContext {
      state = "running";
      destination = {};
      currentTime = 0;
      createGain() {
        return { gain: { value: 0 }, connect: vi.fn() };
      }
      decodeAudioData() {
        return new Promise<AudioBuffer>((resolve) => {
          finishDecode = resolve;
        });
      }
    }
    vi.stubGlobal("window", { setTimeout });
    vi.stubGlobal("AudioContext", FakeAudioContext);

    const engine = new AudioEngine();
    await engine.start();
    await engine.activateProject(projectA.id, []);
    const loading = engine.loadSample(sample);
    await vi.waitFor(() => expect(finishDecode).toBeTypeOf("function"));
    await engine.activateProject(projectB.id, []);
    finishDecode?.(decodedBuffer);
    await loading;

    await expect(engine.playPad({ ...pad!, sampleId: sample.id })).rejects.toThrow(
      "Sample is not loaded into the audio engine."
    );
  });
});
