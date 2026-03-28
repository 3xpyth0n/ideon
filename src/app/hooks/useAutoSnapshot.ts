"use client";

import { useCallback, useRef, useEffect } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AutoSnapshotIntent =
  | "Block created"
  | "Block deleted"
  | "Connection created"
  | "Connection deleted"
  | "Block transferred"
  | "Periodic snapshot";

// allow wide signature here to accept project's specific typed save function
type SaveStateFn = (
  ...args: any[]
) => Promise<boolean | { success: boolean; unchanged?: boolean }>;

interface UseAutoSnapshotOptions {
  handleSaveStateRef: React.RefObject<SaveStateFn | null>;
  isPreviewMode: boolean;
  isReadOnly: boolean;
  isRemoteSynced: boolean;
}

const DEBOUNCE_MS = 30_000;
const MAX_INTERVAL_MS = 120_000;

export function useAutoSnapshot({
  handleSaveStateRef,
  isPreviewMode,
  isReadOnly,
  isRemoteSynced,
}: UseAutoSnapshotOptions) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxIntervalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotTime = useRef<number>(Date.now());
  const pendingIntent = useRef<AutoSnapshotIntent | null>(null);
  const isSaving = useRef(false);

  const doSnapshot = useCallback(
    async (intent: AutoSnapshotIntent) => {
      if (isSaving.current || isPreviewMode || isReadOnly || !isRemoteSynced)
        return;
      const saveFn = handleSaveStateRef.current;
      if (!saveFn) return;
      isSaving.current = true;
      try {
        await saveFn(intent, undefined, undefined, { isAuto: true });
        lastSnapshotTime.current = Date.now();
        pendingIntent.current = null;
      } finally {
        isSaving.current = false;
      }
    },
    [handleSaveStateRef, isPreviewMode, isReadOnly, isRemoteSynced],
  );

  const clearTimers = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    if (maxIntervalTimer.current) {
      clearTimeout(maxIntervalTimer.current);
      maxIntervalTimer.current = null;
    }
  }, []);

  const triggerAutoSnapshot = useCallback(
    (intent: AutoSnapshotIntent) => {
      if (isPreviewMode || isReadOnly) return;

      pendingIntent.current = intent;

      if (debounceTimer.current) clearTimeout(debounceTimer.current);

      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null;
        if (pendingIntent.current) {
          doSnapshot(pendingIntent.current);
        }
      }, DEBOUNCE_MS);

      const elapsed = Date.now() - lastSnapshotTime.current;
      if (elapsed >= MAX_INTERVAL_MS && !maxIntervalTimer.current) {
        maxIntervalTimer.current = setTimeout(() => {
          maxIntervalTimer.current = null;
          if (pendingIntent.current) {
            if (debounceTimer.current) {
              clearTimeout(debounceTimer.current);
              debounceTimer.current = null;
            }
            doSnapshot(pendingIntent.current);
          }
        }, 500);
      }

      if (!maxIntervalTimer.current && elapsed < MAX_INTERVAL_MS) {
        const remaining = MAX_INTERVAL_MS - elapsed;
        maxIntervalTimer.current = setTimeout(() => {
          maxIntervalTimer.current = null;
          if (pendingIntent.current) {
            if (debounceTimer.current) {
              clearTimeout(debounceTimer.current);
              debounceTimer.current = null;
            }
            doSnapshot(pendingIntent.current);
          }
        }, remaining);
      }
    },
    [isPreviewMode, isReadOnly, doSnapshot, clearTimers],
  );

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return { triggerAutoSnapshot };
}
