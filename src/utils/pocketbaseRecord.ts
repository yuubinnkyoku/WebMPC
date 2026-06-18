export function parsePocketBaseUpdatedAt(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function getRemoteProjectUpdatedAt(projectUpdatedAt: unknown, recordUpdated: unknown): number | undefined {
  if (typeof projectUpdatedAt === "number" && Number.isFinite(projectUpdatedAt)) return projectUpdatedAt;
  return parsePocketBaseUpdatedAt(recordUpdated);
}
