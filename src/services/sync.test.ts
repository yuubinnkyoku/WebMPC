import { describe, expect, it } from "vitest";
import { getSyncState, listRemoteProjects, restoreRemoteProject, signIn, syncProject } from "./sync";

describe("sync service without PocketBase configuration", () => {
  it("reports that PocketBase is not configured", () => {
    expect(getSyncState()).toEqual({
      configured: false,
      signedIn: false,
      syncing: false,
      message: "PocketBase is not configured"
    });
  });

  it("does not throw when manual sync is requested without configuration", async () => {
    await expect(syncProject("project_missing")).resolves.toMatchObject({
      configured: false,
      signedIn: false,
      message: "PocketBase is not configured"
    });
  });

  it("rejects remote-only operations without configuration", async () => {
    await expect(signIn("user@example.com", "password")).rejects.toThrow("PocketBase URL is not configured.");
    await expect(listRemoteProjects()).rejects.toThrow("PocketBase URL is not configured.");
    await expect(restoreRemoteProject("remote_1")).rejects.toThrow("PocketBase URL is not configured.");
  });
});
