import { describe, expect, it } from "vitest";
import { chooseProjectId, ProjectRefreshCoordinator } from "./projectSelection";

describe("project selection", () => {
  it("uses a preferred project when it still exists", () => {
    expect(chooseProjectId(["a", "b"], "b", "a")).toBe("b");
  });

  it("falls back to the current project when the preferred project is gone", () => {
    expect(chooseProjectId(["a", "b"], "deleted", "a")).toBe("a");
  });

  it("selects the newest listed project when preferred and current projects are gone", () => {
    expect(chooseProjectId(["next", "older"], "deleted", "also-deleted")).toBe("next");
  });

  it("clears selection when no projects remain", () => {
    expect(chooseProjectId([], "deleted", "also-deleted")).toBeUndefined();
  });
});

describe("project refresh coordination", () => {
  it("keeps a newer selection when an older project operation finishes later", () => {
    const coordinator = new ProjectRefreshCoordinator();
    const projectIds = ["a", "b"];
    const initialRequest = coordinator.begin("a");
    expect(coordinator.choose(projectIds)).toBe("a");

    const selectionRequest = coordinator.begin("b");
    expect(coordinator.choose(projectIds, "a")).toBe("b");
    expect(coordinator.isCurrent(initialRequest)).toBe(false);
    expect(coordinator.isCurrent(selectionRequest)).toBe(true);

    const delayedSaveRefresh = coordinator.begin();
    expect(coordinator.choose(projectIds, "a")).toBe("b");
    expect(coordinator.isCurrent(selectionRequest)).toBe(false);
    expect(coordinator.isCurrent(delayedSaveRefresh)).toBe(true);
  });

  it("falls back after the requested project is deleted", () => {
    const coordinator = new ProjectRefreshCoordinator();
    coordinator.begin("deleted");

    const selectedId = coordinator.choose(["next"], "deleted");
    coordinator.commit(selectedId);

    expect(selectedId).toBe("next");
    expect(coordinator.choose(["next"], "deleted")).toBe("next");
  });
});
