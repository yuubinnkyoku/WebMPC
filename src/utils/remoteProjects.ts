import { getRemoteProjectUpdatedAt } from "./pocketbaseRecord";

export type RemoteProjectLike = {
  id: string;
  updated?: unknown;
  project?: {
    name?: unknown;
    updatedAt?: unknown;
  };
  samples?: unknown;
};

export type RemoteProjectSummaryLike = {
  id: string;
  name: string;
  updatedAt?: number;
  sampleCount: number;
};

export function toRemoteProjectSummary(record: RemoteProjectLike): RemoteProjectSummaryLike {
  const name = typeof record.project?.name === "string" ? record.project.name.trim() : "";
  return {
    id: record.id,
    name: name || "Untitled remote project",
    updatedAt: getRemoteProjectUpdatedAt(record.project?.updatedAt, record.updated),
    sampleCount: Array.isArray(record.samples) ? record.samples.length : 0
  };
}
