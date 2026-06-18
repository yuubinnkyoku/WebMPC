import { describe, expect, it } from "vitest";
import { createMpd218Mappings, getMpd218NoteForPad, MPD218_DEVICE_NAME, MPD218_MAPPING_NAME, MPD218_NOTES } from "./mpd218";

describe("MPD218 defaults", () => {
  it("keeps the bank A note range stable", () => {
    expect(MPD218_NOTES).toEqual([36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
    expect(getMpd218NoteForPad("A", 0)).toBe(36);
    expect(getMpd218NoteForPad("A", 15)).toBe(51);
    expect(getMpd218NoteForPad("B", 0)).toBeUndefined();
    expect(getMpd218NoteForPad("A", 16)).toBeUndefined();
  });

  it("creates the default note-to-pad mapping", () => {
    expect(MPD218_MAPPING_NAME).toBe("MPD218 default");
    expect(MPD218_DEVICE_NAME).toBe("MPD218");
    expect(createMpd218Mappings()).toEqual({
      "36": { bank: "A", padIndex: 0 },
      "37": { bank: "A", padIndex: 1 },
      "38": { bank: "A", padIndex: 2 },
      "39": { bank: "A", padIndex: 3 },
      "40": { bank: "A", padIndex: 4 },
      "41": { bank: "A", padIndex: 5 },
      "42": { bank: "A", padIndex: 6 },
      "43": { bank: "A", padIndex: 7 },
      "44": { bank: "A", padIndex: 8 },
      "45": { bank: "A", padIndex: 9 },
      "46": { bank: "A", padIndex: 10 },
      "47": { bank: "A", padIndex: 11 },
      "48": { bank: "A", padIndex: 12 },
      "49": { bank: "A", padIndex: 13 },
      "50": { bank: "A", padIndex: 14 },
      "51": { bank: "A", padIndex: 15 }
    });
  });
});
