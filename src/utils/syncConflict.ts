export type SyncConflictDecision = {
  remoteIsNewer: boolean;
  message?: string;
};

export function decideSyncConflict(localUpdatedAt: number, remoteUpdatedAt?: number): SyncConflictDecision {
  if (!remoteUpdatedAt || remoteUpdatedAt <= localUpdatedAt) {
    return { remoteIsNewer: false };
  }
  return {
    remoteIsNewer: true,
    message: "Remote project is newer. Use Load remote and Restore to keep both copies."
  };
}
