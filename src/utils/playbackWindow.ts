export type PlaybackWindow = {
  startSeconds: number;
  durationSeconds: number;
};

export function getPlaybackWindow(sampleDurationSeconds: number, startMs: number, endMs?: number): PlaybackWindow | undefined {
  if (!Number.isFinite(sampleDurationSeconds) || sampleDurationSeconds <= 0) return undefined;
  const startSeconds = Math.max(0, startMs / 1000);
  if (!Number.isFinite(startSeconds) || startSeconds >= sampleDurationSeconds) return undefined;
  const endSeconds = endMs === undefined ? sampleDurationSeconds : Math.min(sampleDurationSeconds, Math.max(startSeconds, endMs / 1000));
  const durationSeconds = endSeconds - startSeconds;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return undefined;
  return { startSeconds, durationSeconds };
}
