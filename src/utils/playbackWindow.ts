export type PlaybackWindow = {
  startSeconds: number;
  durationSeconds: number;
};

export function getPlaybackRate(pitchSemitones: number): number {
  if (!Number.isFinite(pitchSemitones)) return 1;
  return Math.pow(2, pitchSemitones / 12);
}

export function getRenderedDurationSeconds(sourceDurationSeconds: number, playbackRate: number): number {
  if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds <= 0) return 0;
  if (!Number.isFinite(playbackRate) || playbackRate <= 0) return sourceDurationSeconds;
  return sourceDurationSeconds / playbackRate;
}

export function getPlaybackWindow(sampleDurationSeconds: number, startMs: number, endMs?: number): PlaybackWindow | undefined {
  if (!Number.isFinite(sampleDurationSeconds) || sampleDurationSeconds <= 0) return undefined;
  const startSeconds = Math.max(0, startMs / 1000);
  if (!Number.isFinite(startSeconds) || startSeconds >= sampleDurationSeconds) return undefined;
  const endSeconds = endMs === undefined ? sampleDurationSeconds : Math.min(sampleDurationSeconds, Math.max(startSeconds, endMs / 1000));
  const durationSeconds = endSeconds - startSeconds;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return undefined;
  return { startSeconds, durationSeconds };
}
