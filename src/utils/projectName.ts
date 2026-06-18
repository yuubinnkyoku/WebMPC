export function normalizeProjectName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : "New kit";
}
