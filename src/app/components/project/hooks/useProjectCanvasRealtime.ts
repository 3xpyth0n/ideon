import React, { useEffect, useState, useCallback, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { uniqueById } from "@lib/utils";
import { UserPresence } from "./useProjectCanvasState";

import type { Awareness } from "y-protocols/awareness";

const CURSOR_THROTTLE_MS = 33;
const AWARENESS_THROTTLE_MS = 50;

/**
 * Compare two user arrays ignoring cursor positions.
 * Returns true if the "presence" data (join/leave/typing/dragging) changed.
 */
function presenceChanged(prev: UserPresence[], next: UserPresence[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (
      a.id !== b.id ||
      a.username !== b.username ||
      a.displayName !== b.displayName ||
      a.avatarUrl !== b.avatarUrl ||
      a.color !== b.color ||
      a.isTyping !== b.isTyping ||
      a.typingBlockId !== b.typingBlockId ||
      a.draggingBlockId !== b.draggingBlockId
    )
      return true;
  }
  return false;
}

export type CursorPosition = { x: number; y: number };

export const useProjectCanvasRealtime = (
  awareness: Awareness | null,
  currentUser: UserPresence | null,
  shareCursor: boolean = true,
) => {
  const { screenToFlowPosition } = useReactFlow();

  // Cursor-less user list — consumed by blocksWithPresence, avatars, UserMapProvider
  // Only updates on join/leave/typing/dragging changes (NOT cursor moves)
  const [presenceUsers, setPresenceUsers] = useState<UserPresence[]>([]);

  // Cursor positions stored in a ref — bypasses React entirely
  // Consumed only by the imperative RemoteCursors rAF loop
  const remoteCursorsRef = useRef<Map<string, CursorPosition>>(new Map());

  const prevPresenceRef = useRef<UserPresence[]>([]);

  useEffect(() => {
    if (!awareness) return;

    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;

    const updateUsers = () => {
      const users: UserPresence[] = [];
      const states = awareness.getStates();

      const nextCursors = new Map<string, CursorPosition>();

      states.forEach(
        (state: {
          user?: UserPresence;
          typingBlockId?: string | null;
          draggingBlockId?: string | null;
          cursor?: { x: number; y: number } | null;
          caretPosition?: number | null;
        }) => {
          if (state.user) {
            users.push({
              id: state.user.id,
              username: state.user.username,
              displayName: state.user.displayName,
              avatarUrl: state.user.avatarUrl ?? null,
              color: state.user.color,
              isTyping: !!state.typingBlockId,
              typingBlockId: state.typingBlockId ?? null,
              draggingBlockId: state.draggingBlockId ?? null,
              cursor: state.cursor
                ? { ...state.cursor, index: state.caretPosition ?? undefined }
                : undefined,
            });

            if (state.cursor) {
              nextCursors.set(state.user.id, {
                x: state.cursor.x,
                y: state.cursor.y,
              });
            }
          }
        },
      );

      const unique = uniqueById(users);

      // Update cursor ref (no React state, no re-renders)
      remoteCursorsRef.current = nextCursors;

      // Only update presenceUsers if non-cursor fields changed
      if (presenceChanged(prevPresenceRef.current, unique)) {
        prevPresenceRef.current = unique;
        setPresenceUsers(unique);
      }
    };

    const throttledUpdateUsers = () => {
      if (throttleTimer) {
        pending = true;
        return;
      }
      updateUsers();
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        if (pending) {
          pending = false;
          updateUsers();
        }
      }, AWARENESS_THROTTLE_MS);
    };

    awareness.on("change", throttledUpdateUsers);
    // BroadcastChannel fallback for same-browser tabs to show presence immediately
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        bc = new BroadcastChannel("ideon-presence");
        bc.onmessage = (ev) => {
          try {
            const msg = ev.data as {
              user?: UserPresence;
              cursor?: { x: number; y: number } | null;
              typingBlockId?: string | null;
              draggingBlockId?: string | null;
            };
            if (msg?.user && msg.user.id) {
              // merge into awareness-derived lists by synthesizing a state
              type AwarenessState = {
                user?: UserPresence;
                cursor?: { x: number; y: number } | null;
                typingBlockId?: string | null;
                draggingBlockId?: string | null;
                caretPosition?: number | null;
              };

              const existing = Array.from(
                awareness.getStates().values(),
              ) as AwarenessState[];
              // If the user already present via awareness, skip broadcasting merge
              const already = existing.find(
                (s: AwarenessState) => s?.user?.id === msg.user?.id,
              );
              if (!already) {
                const state: AwarenessState = {
                  user: msg.user,
                  cursor: msg.cursor ?? undefined,
                  typingBlockId: msg.typingBlockId ?? undefined,
                  draggingBlockId: msg.draggingBlockId ?? undefined,
                };
                // Temporarily update presence lists using same logic as awareness change
                const users: UserPresence[] = [];
                const nextCursors = new Map<string, { x: number; y: number }>();
                // include synthesized state first
                if (state.user) {
                  users.push({
                    id: state.user.id,
                    username: state.user.username,
                    displayName: state.user.displayName,
                    avatarUrl: state.user.avatarUrl ?? null,
                    color: state.user.color,
                    isTyping: !!state.typingBlockId,
                    typingBlockId: state.typingBlockId ?? null,
                    draggingBlockId: state.draggingBlockId ?? null,
                    cursor: state.cursor
                      ? {
                          ...state.cursor,
                          index: state.caretPosition ?? undefined,
                        }
                      : undefined,
                  });
                  if (state.cursor) {
                    nextCursors.set(state.user.id, {
                      x: state.cursor.x,
                      y: state.cursor.y,
                    });
                  }
                }

                // merge with awareness-derived users
                try {
                  const states = awareness.getStates() as Map<
                    number,
                    AwarenessState
                  >;
                  states.forEach((s: AwarenessState) => {
                    if (s.user) {
                      users.push({
                        id: s.user.id,
                        username: s.user.username,
                        displayName: s.user.displayName,
                        avatarUrl: s.user.avatarUrl ?? null,
                        color: s.user.color,
                        isTyping: !!s.typingBlockId,
                        typingBlockId: s.typingBlockId ?? null,
                        draggingBlockId: s.draggingBlockId ?? null,
                        cursor: s.cursor
                          ? {
                              x: s.cursor.x,
                              y: s.cursor.y,
                              index: s.caretPosition ?? undefined,
                            }
                          : undefined,
                      });
                      if (s.cursor && s.user)
                        nextCursors.set(s.user.id, {
                          x: s.cursor.x,
                          y: s.cursor.y,
                        });
                    }
                  });
                } catch {
                  // ignore
                }

                const unique = uniqueById(users);
                // Update cursor ref and presence state similarly
                remoteCursorsRef.current = nextCursors;
                if (presenceChanged(prevPresenceRef.current, unique)) {
                  prevPresenceRef.current = unique;
                  setPresenceUsers(unique);
                }
              }
            }
          } catch {
            // ignore
          }
        };
      }
    } catch {
      bc = null;
    }
    updateUsers();

    return () => {
      awareness.off("change", throttledUpdateUsers);
      if (throttleTimer) clearTimeout(throttleTimer);
      if (bc) {
        try {
          bc.close();
        } catch {
          // ignore
        }
      }
    };
  }, [awareness]);

  const updateMyPresence = useCallback(
    (presence: Partial<UserPresence>) => {
      if (!awareness || !currentUser) return;
      const state = awareness.getLocalState() as Record<string, unknown> | null;
      const stateUser = (state?.user as UserPresence | undefined) ?? undefined;
      if (!stateUser || stateUser.id !== currentUser.id) {
        awareness.setLocalStateField("user", currentUser);
      }
      Object.entries(presence).forEach(([key, value]) => {
        awareness.setLocalStateField(key, value);
      });
      // broadcast local presence to other tabs for immediate visibility
      try {
        if (typeof window !== "undefined" && "BroadcastChannel" in window) {
          const bc = new BroadcastChannel("ideon-presence");
          bc.postMessage({ user: currentUser, ...presence });
          bc.close();
        }
      } catch {
        // ignore
      }
    },
    [awareness, currentUser],
  );

  useEffect(() => {
    if (!shareCursor) {
      updateMyPresence({ cursor: undefined });
    }
  }, [shareCursor, updateMyPresence]);

  // Ensure initial presence is set when user connects
  useEffect(() => {
    if (awareness && currentUser) {
      updateMyPresence({});
    }
  }, [awareness, currentUser, updateMyPresence]);

  const lastCursorUpdate = useRef(0);
  const pendingCursorRAF = useRef<number | null>(null);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!shareCursor) return;
      const now = performance.now();
      if (now - lastCursorUpdate.current < CURSOR_THROTTLE_MS) {
        if (pendingCursorRAF.current === null) {
          const clientX = event.clientX;
          const clientY = event.clientY;
          pendingCursorRAF.current = requestAnimationFrame(() => {
            pendingCursorRAF.current = null;
            if (
              performance.now() - lastCursorUpdate.current >=
              CURSOR_THROTTLE_MS
            ) {
              lastCursorUpdate.current = performance.now();
              const cursor = screenToFlowPosition({ x: clientX, y: clientY });
              updateMyPresence({ cursor });
            }
          });
        }
        return;
      }
      lastCursorUpdate.current = now;
      const cursor = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      updateMyPresence({ cursor });
    },
    [screenToFlowPosition, updateMyPresence, shareCursor],
  );

  const onPointerLeave = useCallback(() => {
    if (pendingCursorRAF.current !== null) {
      cancelAnimationFrame(pendingCursorRAF.current);
      pendingCursorRAF.current = null;
    }
    updateMyPresence({ cursor: undefined });
  }, [updateMyPresence]);

  const onFocus = useCallback(
    (blockId: string, index: number) => {
      updateMyPresence({ typingBlockId: blockId, caretPosition: index });
    },
    [updateMyPresence],
  );

  const onBlur = useCallback(() => {
    updateMyPresence({ typingBlockId: null, caretPosition: null });
  }, [updateMyPresence]);

  const onCaretMove = useCallback(
    (blockId: string, index: number) => {
      updateMyPresence({ typingBlockId: blockId, caretPosition: index });
    },
    [updateMyPresence],
  );

  return {
    remoteCursorsRef,
    presenceUsers,
    onFocus,
    onBlur,
    onCaretMove,
    onPointerMove,
    onPointerLeave,
    updateMyPresence,
  };
};
