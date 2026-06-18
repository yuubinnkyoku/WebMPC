import type { Project, Sample } from "../types/models";

export function stripProjectRemoteId(project: Project): Omit<Project, "remoteId"> {
  return {
    id: project.id,
    name: project.name,
    bpm: project.bpm,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    version: project.version
  };
}

export function stripSampleRemoteFileId(sample: Sample): Omit<Sample, "remoteFileId"> {
  return {
    id: sample.id,
    projectId: sample.projectId,
    hash: sample.hash,
    name: sample.name,
    mimeType: sample.mimeType,
    size: sample.size,
    durationMs: sample.durationMs,
    createdAt: sample.createdAt,
    updatedAt: sample.updatedAt
  };
}
