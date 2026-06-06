import { describe, expect, it } from "vitest";
import { blobToDataUrl, dataUrlToBlob } from "./file";

describe("file utilities", () => {
  it("converts a typed blob to a data URL and back", async () => {
    const source = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/wav" });
    const dataUrl = await blobToDataUrl(source);
    const restored = await dataUrlToBlob(dataUrl);
    const restoredBytes = [...new Uint8Array(await restored.arrayBuffer())];

    expect(dataUrl).toBe("data:audio/wav;base64,AQIDBA==");
    expect(restored.type).toBe("audio/wav");
    expect(restoredBytes).toEqual([1, 2, 3, 4]);
  });
});
