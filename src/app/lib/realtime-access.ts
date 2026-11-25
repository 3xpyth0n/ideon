type RealtimeAccessGlobals = {
  kickUser?: (projectId: string, userId: string) => void;
  refreshUserAccess?: (projectId: string, userId: string) => void;
};

function realtimeGlobals(): RealtimeAccessGlobals {
  return globalThis as unknown as RealtimeAccessGlobals;
}

export function revokeRealtimeAccess(projectId: string, userId: string) {
  realtimeGlobals().kickUser?.(projectId, userId);
}

export function refreshRealtimeAccess(projectId: string, userId: string) {
  realtimeGlobals().refreshUserAccess?.(projectId, userId);
}
