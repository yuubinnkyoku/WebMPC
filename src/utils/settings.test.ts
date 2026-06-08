import { describe, expect, it } from "vitest";
import { defaultUserSettings, normalizeMasterGain, normalizeUserSettings } from "./settings";

describe("settings utilities", () => {
  it("clamps master gain into the browser-safe range", () => {
    expect(normalizeMasterGain(-1)).toBe(0);
    expect(normalizeMasterGain(0.42)).toBe(0.42);
    expect(normalizeMasterGain(2)).toBe(1);
  });

  it("falls back for invalid master gain values", () => {
    expect(normalizeMasterGain(Number.NaN)).toBe(defaultUserSettings.masterGain);
    expect(normalizeMasterGain("loud")).toBe(defaultUserSettings.masterGain);
  });

  it("normalizes persisted settings payloads", () => {
    expect(normalizeUserSettings({ masterGain: 0.5 })).toEqual({ masterGain: 0.5 });
    expect(normalizeUserSettings({ masterGain: Number.POSITIVE_INFINITY })).toEqual(defaultUserSettings);
    expect(normalizeUserSettings(undefined)).toEqual(defaultUserSettings);
  });
});
