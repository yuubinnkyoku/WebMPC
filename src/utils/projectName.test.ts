import { describe, expect, it } from "vitest";
import { normalizeProjectName } from "./projectName";

describe("project name utilities", () => {
  it("trims, falls back, and limits project names", () => {
    expect(normalizeProjectName("  Live set  ")).toBe("Live set");
    expect(normalizeProjectName("   ")).toBe("New kit");
    expect(normalizeProjectName("x".repeat(160))).toHaveLength(120);
  });
});
