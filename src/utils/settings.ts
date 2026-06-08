export type UserSettings = {
  masterGain: number;
};

export const defaultUserSettings: UserSettings = {
  masterGain: 0.9
};

export function normalizeMasterGain(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultUserSettings.masterGain;
  return Math.max(0, Math.min(1, value));
}

export function normalizeUserSettings(value: unknown): UserSettings {
  if (!isRecord(value)) return defaultUserSettings;
  return {
    masterGain: normalizeMasterGain(value.masterGain)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
