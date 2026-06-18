import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pocketBaseMock = vi.hoisted(() => ({
  isValid: true,
  authWithPassword: vi.fn(),
  authClear: vi.fn(),
  projectCreate: vi.fn(),
  projectUpdate: vi.fn(),
  projectGetOne: vi.fn(),
  sampleCreate: vi.fn(),
  sampleUpdate: vi.fn(),
  sampleGetFirst: vi.fn(),
  sampleGetFullList: vi.fn()
}));

vi.mock("pocketbase", () => ({
  default: class PocketBaseMock {
    authStore = {
      get isValid() {
        return pocketBaseMock.isValid;
      },
      clear: pocketBaseMock.authClear
    };

    files = {
      getURL: vi.fn()
    };

    collection(name: string) {
      if (name === "webmpc_projects") {
        return {
          create: pocketBaseMock.projectCreate,
          update: pocketBaseMock.projectUpdate,
          getOne: pocketBaseMock.projectGetOne
        };
      }
      if (name === "webmpc_samples") {
        return {
          create: pocketBaseMock.sampleCreate,
          update: pocketBaseMock.sampleUpdate,
          getFirstListItem: pocketBaseMock.sampleGetFirst,
          getFullList: pocketBaseMock.sampleGetFullList,
          delete: vi.fn()
        };
      }
      return {
        authWithPassword: pocketBaseMock.authWithPassword
      };
    }
  }
}));

describe("configured sync retries", () => {
  beforeEach(async () => {
    const currentStorage = await import("./storage");
    currentStorage.db.close();
    vi.resetModules();
    vi.stubEnv("VITE_POCKETBASE_URL", "http://127.0.0.1:8090");
    pocketBaseMock.isValid = true;
    pocketBaseMock.authWithPassword.mockReset().mockImplementation(async () => {
      pocketBaseMock.isValid = true;
      return {};
    });
    pocketBaseMock.authClear.mockReset().mockImplementation(() => {
      pocketBaseMock.isValid = false;
    });
    pocketBaseMock.projectCreate.mockReset().mockResolvedValue({
      id: "remote-project-1",
      updated: "2026-06-18 00:00:00.000Z"
    });
    pocketBaseMock.projectUpdate.mockReset().mockResolvedValue({
      id: "remote-project-1",
      updated: "2026-06-18 00:00:01.000Z"
    });
    pocketBaseMock.projectGetOne.mockReset().mockResolvedValue({
      id: "remote-project-1",
      project: { updatedAt: 1 },
      updated: "2026-06-18 00:00:00.000Z"
    });
    pocketBaseMock.sampleCreate.mockReset();
    pocketBaseMock.sampleUpdate.mockReset();
    pocketBaseMock.sampleGetFirst.mockReset().mockRejectedValue(new Error("not found"));
    pocketBaseMock.sampleGetFullList.mockReset().mockResolvedValue([]);
    const { db } = await import("./storage");
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the created remote id after an upload failure and updates it on retry", async () => {
    const { createProject, getProject, getSyncMetadata, importSample } = await import("./storage");
    const { syncProject } = await import("./sync");
    const project = await createProject("Retry sync");
    await importSample(project.id, new File([new Uint8Array([1, 2, 3, 4])], "kick.wav", { type: "audio/wav" }));
    pocketBaseMock.sampleCreate.mockRejectedValueOnce(new Error("upload failed"));

    await expect(syncProject(project.id)).rejects.toThrow("Unable to upload sample file kick.wav.");

    expect((await getProject(project.id))?.remoteId).toBe("remote-project-1");
    expect((await getSyncMetadata(project.id))?.lastSyncedAt).toBeUndefined();

    pocketBaseMock.sampleCreate.mockResolvedValueOnce({ id: "remote-sample-1" });
    await expect(syncProject(project.id)).resolves.toMatchObject({ message: "Synced Retry sync" });

    expect(pocketBaseMock.projectCreate).toHaveBeenCalledTimes(1);
    expect(pocketBaseMock.projectUpdate).toHaveBeenCalledTimes(1);
    expect((await getSyncMetadata(project.id))?.lastSyncedAt).toBeTypeOf("number");
  });

  it("reflects PocketBase sign-in and sign-out state", async () => {
    pocketBaseMock.isValid = false;
    const { getSyncState, signIn, signOut } = await import("./sync");

    expect(getSyncState()).toMatchObject({ configured: true, signedIn: false });
    await expect(signIn("user@example.com", "secret")).resolves.toMatchObject({
      configured: true,
      signedIn: true,
      message: "Signed in"
    });
    expect(pocketBaseMock.authWithPassword).toHaveBeenCalledWith("user@example.com", "secret");

    expect(signOut()).toMatchObject({
      configured: true,
      signedIn: false,
      message: "Signed out"
    });
    expect(pocketBaseMock.authClear).toHaveBeenCalledTimes(1);
  });
});
