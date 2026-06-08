import { describe, expect, it } from "vitest";
import { decideSyncConflict } from "./syncConflict";

describe("sync conflict decisions", () => {
  it("allows sync when remote timestamp is missing", () => {
    expect(decideSyncConflict(1000)).toEqual({ remoteIsNewer: false });
  });

  it("allows sync when local is as new or newer", () => {
    expect(decideSyncConflict(1000, 1000)).toEqual({ remoteIsNewer: false });
    expect(decideSyncConflict(1000, 900)).toEqual({ remoteIsNewer: false });
  });

  it("stops sync when remote is newer", () => {
    const decision = decideSyncConflict(1000, 1100);
    expect(decision.remoteIsNewer).toBe(true);
    expect(decision.message).toContain("Remote project is newer");
  });
});
