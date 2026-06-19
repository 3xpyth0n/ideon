import { useState, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";

/**
 * Tracks hover state on CommentHighlight marks in the editor.
 * Returns the currently hovered thread ID after a 300ms delay.
 * Applies to both editor and viewer roles (read-only compatible).
 *
 * Validates: Requirements 4.4, 10.1, 10.3
 */
export function useHighlightHover(editor: Editor | null): string | null {
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) return;

    const editorElement = editor.view.dom;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const highlightEl = target.closest("[data-thread-id]");

      if (highlightEl) {
        const threadId = highlightEl.getAttribute("data-thread-id");
        if (threadId) {
          // Clear any existing timer
          if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
          }
          // Set 300ms delay before showing
          hoverTimerRef.current = setTimeout(() => {
            setHoveredThreadId(threadId);
            hoverTimerRef.current = null;
          }, 300);
        }
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      const isStillOnHighlight = relatedTarget?.closest("[data-thread-id]");

      if (!isStillOnHighlight) {
        // Clear timer and hide
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        setHoveredThreadId(null);
      }
    };

    editorElement.addEventListener("mouseover", handleMouseOver);
    editorElement.addEventListener("mouseout", handleMouseOut);

    return () => {
      editorElement.removeEventListener("mouseover", handleMouseOver);
      editorElement.removeEventListener("mouseout", handleMouseOut);
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, [editor]);

  return hoveredThreadId;
}
