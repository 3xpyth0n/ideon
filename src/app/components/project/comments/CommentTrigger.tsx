"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquare } from "lucide-react";
import type { CommentTriggerProps } from "./types";

const DEBOUNCE_MS = 100;

/**
 * CommentTrigger renders a compact MessageSquare button that appears when
 * a user with Editor_Role selects text in the editor. It uses a 100ms
 * selection stabilization delay before showing, and a 100ms debounce
 * before hiding when the selection is cleared or editor loses focus.
 */
export function CommentTrigger({
  editor,
  isReadOnly,
  userRole,
  onTrigger,
}: CommentTriggerProps) {
  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSelectionRef = useRef<{ from: number; to: number } | null>(null);

  const canComment = userRole !== "viewer" && !isReadOnly;

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!canComment) {
      setVisible(false);
      clearTimers();
      return;
    }

    const handleSelectionUpdate = () => {
      const { from, to } = editor.state.selection;
      const hasSelection = from !== to;

      if (hasSelection) {
        // Cancel any pending hide
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }

        const prevSelection = lastSelectionRef.current;
        const selectionChanged =
          !prevSelection ||
          prevSelection.from !== from ||
          prevSelection.to !== to;

        lastSelectionRef.current = { from, to };

        if (selectionChanged) {
          // Reset show timer for selection stabilization (100ms)
          if (showTimerRef.current) {
            clearTimeout(showTimerRef.current);
          }
          showTimerRef.current = setTimeout(() => {
            setVisible(true);
            showTimerRef.current = null;
          }, DEBOUNCE_MS);
        }
      } else {
        // Selection cleared — debounce hide (100ms)
        lastSelectionRef.current = null;

        if (showTimerRef.current) {
          clearTimeout(showTimerRef.current);
          showTimerRef.current = null;
        }

        if (!hideTimerRef.current) {
          hideTimerRef.current = setTimeout(() => {
            setVisible(false);
            hideTimerRef.current = null;
          }, DEBOUNCE_MS);
        }
      }
    };

    const handleBlur = () => {
      // Hide with debounce when editor loses focus
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }

      if (!hideTimerRef.current) {
        hideTimerRef.current = setTimeout(() => {
          setVisible(false);
          hideTimerRef.current = null;
        }, DEBOUNCE_MS);
      }
    };

    editor.on("selectionUpdate", handleSelectionUpdate);
    editor.on("blur", handleBlur);

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
      editor.off("blur", handleBlur);
      clearTimers();
    };
  }, [editor, canComment, clearTimers]);

  const handleClick = useCallback(() => {
    const { from, to } = editor.state.selection;
    if (from !== to) {
      onTrigger({ from, to });
    }
  }, [editor, onTrigger]);

  if (!canComment || !visible) {
    return null;
  }

  return (
    <>
      <div className="tiptap-bubble-menu-separator" />
      <button
        onClick={handleClick}
        title="Add comment"
        className="hover:text-blue-400 transition-colors"
        aria-label="Add comment"
      >
        <MessageSquare size={14} />
      </button>
    </>
  );
}
