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

  it("preserves local project edits made while a remote project is being created", async () => {
    let resolveCreate: ((record: { id: string; updated: string }) => void) | undefined;
    pocketBaseMock.projectCreate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );
    const { createProject, getProject, updateProject } = await import("./storage");
    const { syncProject } = await import("./sync");
    const project = await createProject("Edit during sync");

    const syncPromise = syncProject(project.id);
    await vi.waitFor(() => expect(pocketBaseMock.projectCreate).toHaveBeenCalledTimes(1));
    await updateProject({ ...project, name: "Edited while syncing" });
    resolveCreate?.({
      id: "remote-project-1",
      updated: "2026-06-18 00:00:00.000Z"
    });

    await expect(syncPromise).resolves.toMatchObject({ message: "Synced Edit during sync" });
    await expect(getProject(project.id)).resolves.toMatchObject({
      name: "Edited while syncing",
      remoteId: "remote-project-1"
    });
  });

  it("recreates a remote project when its stored remote id no longer exists", async () => {
    const { createProject, db, getProject, getSyncMetadata } = await import("./storage");
    const { syncProject } = await import("./sync");
    const project = await createProject("Recreate remote");
    await db.projects.update(project.id, { remoteId: "deleted-remote-project" });
    pocketBaseMock.projectGetOne.mockRejectedValueOnce({ status: 404 });
    pocketBaseMock.projectCreate.mockResolvedValueOnce({
      id: "replacement-remote-project",
      updated: "2026-06-18 00:00:02.000Z"
    });

    await expect(syncProject(project.id)).resolves.toMatchObject({ message: "Synced Recreate remote" });

    expect(pocketBaseMock.projectUpdate).not.toHaveBeenCalled();
    expect(pocketBaseMock.projectCreate).toHaveBeenCalledTimes(1);
    await expect(getProject(project.id)).resolves.toMatchObject({ remoteId: "replacement-remote-project" });
    await expect(getSyncMetadata(project.id)).resolves.toMatchObject({
      remoteId: "replacement-remote-project",
      lastSyncedAt: expect.any(Number)
    });
  });

  it("does not create a duplicate when checking the remote project fails", async () => {
    const { createProject, db, getProject } = await import("./storage");
    const { syncProject } = await import("./sync");
    const project = await createProject("Remote unavailable");
    await db.projects.update(project.id, { remoteId: "existing-remote-project" });
    pocketBaseMock.projectGetOne.mockRejectedValueOnce({ status: 503, message: "unavailable" });

    await expect(syncProject(project.id)).rejects.toMatchObject({ status: 503 });

    expect(pocketBaseMock.projectCreate).not.toHaveBeenCalled();
    expect(pocketBaseMock.projectUpdate).not.toHaveBeenCalled();
    await expect(getProject(project.id)).resolves.toMatchObject({ remoteId: "existing-remote-project" });
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
