export type RemoteSampleLike = {
  sampleId?: string;
};

export function shouldPruneRemoteSample(record: RemoteSampleLike, localSampleIds: Set<string>): boolean {
  return !record.sampleId || !localSampleIds.has(record.sampleId);
}
