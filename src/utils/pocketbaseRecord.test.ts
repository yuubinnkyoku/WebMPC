import { describe, expect, it } from "vitest";
import { getRemoteProjectUpdatedAt, parsePocketBaseUpdatedAt } from "./pocketbaseRecord";

describe("PocketBase record utilities", () => {
  it("parses PocketBase updated timestamps", () => {
    expect(parsePocketBaseUpdatedAt("2026-06-13 05:30:00.000Z")).toBe(Date.parse("2026-06-13 05:30:00.000Z"));
  });

  it("ignores missing or malformed timestamps", () => {
    expect(parsePocketBaseUpdatedAt(undefined)).toBeUndefined();
    expect(parsePocketBaseUpdatedAt("not a date")).toBeUndefined();
  });

  it("prefers finite project timestamps over record timestamps", () => {
    expect(getRemoteProjectUpdatedAt(1000, "2026-06-13 05:30:00.000Z")).toBe(1000);
  });

  it("falls back to record timestamps when project timestamps are invalid", () => {
    const recordUpdated = "2026-06-13 05:30:00.000Z";
    expect(getRemoteProjectUpdatedAt(Number.NaN, recordUpdated)).toBe(Date.parse(recordUpdated));
    expect(getRemoteProjectUpdatedAt("bad", recordUpdated)).toBe(Date.parse(recordUpdated));
  });
});
