import { describe, expect, it } from "vitest";
import type { Pad } from "../types/models";
import { getVisiblePads } from "./visiblePads";

function pad(id: string, bank: Pad["bank"], padIndex: number): Pad {
  return {
    id,
    projectId: "project_1",
    bank,
    padIndex,
    gain: 1,
    pan: 0,
    pitch: 0,
    startMs: 0,
    oneShot: true,
    updatedAt: 1
  };
}

describe("visible pads", () => {
  it("filters pads to the selected bank and sorts by pad index", () => {
    const pads = [pad("b2", "B", 2), pad("a2", "A", 2), pad("b0", "B", 0), pad("b1", "B", 1)];

    expect(getVisiblePads(pads, "B").map((item) => item.id)).toEqual(["b0", "b1", "b2"]);
  });

  it("does not mutate the input pad order", () => {
    const pads = [pad("b2", "B", 2), pad("b0", "B", 0), pad("b1", "B", 1)];

    getVisiblePads(pads, "B");

    expect(pads.map((item) => item.id)).toEqual(["b2", "b0", "b1"]);
  });
});
