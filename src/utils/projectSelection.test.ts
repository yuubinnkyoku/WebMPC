import { describe, expect, it } from "vitest";
import { chooseProjectId } from "./projectSelection";

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
