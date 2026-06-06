import { describe, expect, it } from "vitest";
import { formatBytes, formatDurationMs } from "./format";

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
});
