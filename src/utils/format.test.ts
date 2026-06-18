import { describe, expect, it } from "vitest";
import { formatBytes, formatDurationMs, formatTimeOfDay, formatTimestamp } from "./format";

describe("format utilities", () => {
  it("formats byte counts", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.00 KB");
    expect(formatBytes(15 * 1024 * 1024)).toBe("15.0 MB");
  });

  it("formats sample durations", () => {
    expect(formatDurationMs()).toBe("Unknown duration");
    expect(formatDurationMs(1250)).toBe("1.25s");
    expect(formatDurationMs(65000)).toBe("1:05");
  });

  it("formats timestamps with a fallback for invalid values", () => {
    expect(formatTimestamp(undefined)).toBe("Unknown time");
    expect(formatTimestamp(Number.NaN, "Updated unknown")).toBe("Updated unknown");
    expect(formatTimestamp(-1)).toBe("Unknown time");
    expect(formatTimestamp(Date.parse("2026-06-13T00:00:00Z"))).not.toBe("Unknown time");
  });

  it("formats times of day with a fallback for invalid values", () => {
    expect(formatTimeOfDay(undefined)).toBe("Unknown time");
    expect(formatTimeOfDay(Number.POSITIVE_INFINITY)).toBe("Unknown time");
    expect(formatTimeOfDay(Date.parse("2026-06-13T00:00:00Z"))).not.toBe("Unknown time");
  });
});
