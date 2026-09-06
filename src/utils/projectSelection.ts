export function chooseProjectId(projectIds: string[], preferredProjectId?: string, currentProjectId?: string): string | undefined {
  if (preferredProjectId && projectIds.includes(preferredProjectId)) return preferredProjectId;
  if (currentProjectId && projectIds.includes(currentProjectId)) return currentProjectId;
  return projectIds[0];
}

export class ProjectRefreshCoordinator {
  private request = 0;
  private requestedProjectId?: string;

  begin(preferredProjectId?: string): number {
    if (preferredProjectId) this.requestedProjectId = preferredProjectId;
    this.request += 1;
    return this.request;
  }

  choose(projectIds: string[], currentProjectId?: string): string | undefined {
    return chooseProjectId(projectIds, this.requestedProjectId, currentProjectId);
  }

  isCurrent(request: number): boolean {
    return request === this.request;
  }

  commit(projectId?: string): void {
    this.requestedProjectId = projectId;
  }
}
