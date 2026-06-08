export function chooseProjectId(projectIds: string[], preferredProjectId?: string, currentProjectId?: string): string | undefined {
  if (preferredProjectId && projectIds.includes(preferredProjectId)) return preferredProjectId;
  if (currentProjectId && projectIds.includes(currentProjectId)) return currentProjectId;
  return projectIds[0];
}
