import { describe, expect, it } from "vitest";
import { blobToDataUrl, dataUrlToBlob, isAudioDataUrl, isAudioFile } from "./file";

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

  it("accepts only audio base64 data URLs for sample blobs", async () => {
    expect(isAudioDataUrl("data:audio/wav;base64,AQIDBA==")).toBe(true);
    expect(isAudioDataUrl("data:audio/x-wav;base64,AQIDBA==")).toBe(true);
    expect(isAudioDataUrl("https://example.com/kick.wav")).toBe(false);
    expect(isAudioDataUrl("data:text/plain;base64,AQIDBA==")).toBe(false);
    expect(isAudioDataUrl("data:audio/wav;base64,")).toBe(false);
    expect(isAudioDataUrl("data:audio/wav;base64,A")).toBe(false);
    expect(isAudioDataUrl("data:audio/wav;base64,AQIDBA===")).toBe(false);

    await expect(dataUrlToBlob("https://example.com/kick.wav")).rejects.toThrow("Sample data URL must be an audio base64 data URL.");
  });

  it("detects audio files by MIME type or extension", () => {
    expect(isAudioFile(new File([], "kick.bin", { type: "audio/wav" }))).toBe(true);
    expect(isAudioFile(new File([], "snare.mp3", { type: "" }))).toBe(true);
    expect(isAudioFile(new File([], "notes.txt", { type: "text/plain" }))).toBe(false);
  });
});
