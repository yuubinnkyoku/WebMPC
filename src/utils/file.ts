export function blobToDataUrl(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buffer) => `data:${blob.type || "application/octet-stream"};base64,${arrayBufferToBase64(buffer)}`);
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (!isAudioDataUrl(dataUrl)) {
    throw new Error("Sample data URL must be an audio base64 data URL.");
  }
  const response = await fetch(dataUrl);
  return response.blob();
}

export function isAudioDataUrl(value: string): boolean {
  return /^data:audio\/[-+.\w]+;base64,(?:(?:[a-z0-9+/]{4})+(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?|[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)$/i.test(value);
}

export function isAudioFile(file: Pick<File, "name" | "type">): boolean {
  if (file.type.toLowerCase().startsWith("audio/")) return true;
  return /\.(aac|aif|aiff|flac|m4a|mp3|oga|ogg|opus|wav|wave|weba|webm)$/i.test(file.name);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
