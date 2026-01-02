import React, { useEffect, useState, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { uniqueById } from "@lib/utils";
import { UserPresence } from "./useProjectCanvasState";

import type { Awareness } from "y-protocols/awareness";

export const useProjectCanvasRealtime = (
  awareness: Awareness | null,
  currentUser: UserPresence | null,
  _isPreviewMode: boolean = false,
  shareCursor: boolean = true,
) => {
  const { screenToFlowPosition } = useReactFlow();
  const [activeUsers, setActiveUsers] = useState<UserPresence[]>([]);

  useEffect(() => {
    if (!awareness) return;

    const updateUsers = () => {
      const users: UserPresence[] = [];
      const states = awareness.getStates();

      states.forEach(
        (
          state: {
            user?: UserPresence;
            typingBlockId?: string | null;
            draggingBlockId?: string | null;
            cursor?: { x: number; y: number } | null;
            caretPosition?: number | null;
          },
          _clientID,
        ) => {
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
          }
        },
      );

      setActiveUsers(uniqueById(users));
    };

    awareness.on("change", updateUsers);
    updateUsers();

    return () => {
      awareness.off("change", updateUsers);
    };
  }, [awareness]);

  const updateMyPresence = useCallback(
    (presence: Partial<UserPresence>) => {
      if (!awareness || !currentUser) return;
      awareness.setLocalStateField("user", currentUser);
      Object.entries(presence).forEach(([key, value]) => {
        awareness.setLocalStateField(key, value);
      });
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

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!shareCursor) return;
      const cursor = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      updateMyPresence({ cursor });
    },
    [screenToFlowPosition, updateMyPresence, shareCursor],
  );

  const onPointerLeave = useCallback(() => {
    updateMyPresence({ cursor: undefined });
  }, [updateMyPresence]);

  const onFocus = useCallback(
    (blockId: string, index: number) => {
      updateMyPresence({ typingBlockId: blockId, caretPosition: index });
    },
    [updateMyPresence],
  );

  const onBlur = useCallback(
    (_blockId: string) => {
      updateMyPresence({ typingBlockId: null, caretPosition: null });
    },
    [updateMyPresence],
  );

  const onCaretMove = useCallback(
    (blockId: string, index: number) => {
      updateMyPresence({ typingBlockId: blockId, caretPosition: index });
    },
    [updateMyPresence],
  );

  return {
    activeUsers,
    onFocus,
    onBlur,
    onCaretMove,
    onPointerMove,
    onPointerLeave,
    updateMyPresence,
  };
};
