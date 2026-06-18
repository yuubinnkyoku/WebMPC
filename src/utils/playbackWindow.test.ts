import { describe, expect, it } from "vitest";
import { getPlaybackRate, getPlaybackWindow, getRenderedDurationSeconds } from "./playbackWindow";

describe("playback window", () => {
  it("uses the full sample by default", () => {
    expect(getPlaybackWindow(2, 0)).toEqual({ startSeconds: 0, durationSeconds: 2 });
  });

  it("clips start and end times to the sample duration", () => {
    expect(getPlaybackWindow(2, 500, 5000)).toEqual({ startSeconds: 0.5, durationSeconds: 1.5 });
  });

  it("returns no playback when trim start is beyond the sample", () => {
    expect(getPlaybackWindow(2, 2500)).toBeUndefined();
  });

  it("returns no playback for invalid or empty ranges", () => {
    expect(getPlaybackWindow(0, 0)).toBeUndefined();
    expect(getPlaybackWindow(2, Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(getPlaybackWindow(2, 0, 0)).toBeUndefined();
    expect(getPlaybackWindow(2, 1000, 500)).toBeUndefined();
  });

  it("converts pitch semitones into playback rate", () => {
    expect(getPlaybackRate(12)).toBe(2);
    expect(getPlaybackRate(-12)).toBe(0.5);
    expect(getPlaybackRate(Number.NaN)).toBe(1);
  });

  it("uses playback rate to calculate rendered duration", () => {
    expect(getRenderedDurationSeconds(2, 2)).toBe(1);
    expect(getRenderedDurationSeconds(2, 0.5)).toBe(4);
    expect(getRenderedDurationSeconds(2, 0)).toBe(2);
    expect(getRenderedDurationSeconds(0, 2)).toBe(0);
  });
});
