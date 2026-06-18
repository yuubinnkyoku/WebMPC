export type RemoteSampleLike = {
  sampleId?: string;
};

export type LocalSampleBlobLike = {
  blob?: Blob;
};

export function shouldPruneRemoteSample(record: RemoteSampleLike, localSampleIds: Set<string>): boolean {
  return !record.sampleId || !localSampleIds.has(record.sampleId);
}

export function mapRemoteSamplesBySampleId<T extends RemoteSampleLike>(records: T[]): Map<string, T> {
  const bySampleId = new Map<string, T>();
  records.forEach((record) => {
    if (record.sampleId && !bySampleId.has(record.sampleId)) {
      bySampleId.set(record.sampleId, record);
    }
  });
  return bySampleId;
}

export function findMissingSampleBlobNames(samples: Array<{ id: string; name: string }>, blobs: Array<LocalSampleBlobLike | undefined>): string[] {
  return samples.flatMap((sample, index) => (blobs[index]?.blob ? [] : [sample.name]));
}
