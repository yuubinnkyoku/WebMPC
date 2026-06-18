export function formatSampleLoadFailureMessage(prefix: string, failedSampleNames: string[]): string | undefined {
  if (failedSampleNames.length === 0) return undefined;
  const count = failedSampleNames.length;
  const visibleNames = failedSampleNames.slice(0, 3).map(formatSampleName);
  const remaining = count - visibleNames.length;
  const suffix = remaining > 0 ? `, and ${remaining} more` : "";
  return `${prefix} ${count} sample${count === 1 ? "" : "s"}: ${visibleNames.join(", ")}${suffix}`;
}

export function formatSampleName(name: string): string {
  return name.trim() || "Unnamed sample";
}
