import type { Editor } from "@tiptap/react";

/**
 * Input for thread position calculation: a thread ID paired with
 * its highlight's vertical position (y-coordinate relative to the panel container).
 */
export interface ThreadPosition {
  threadId: string;
  highlightY: number;
}

/**
 * Output from thread position calculation: original highlight position
 * plus the adjusted card position that avoids overlap.
 */
export interface AdjustedThreadPosition {
  threadId: string;
  highlightY: number;
  cardY: number;
}

/**
 * Default gap (in pixels) between thread cards when they are pushed apart.
 */
const DEFAULT_GAP = 8;

/**
 * Calculates adjusted vertical positions for thread cards so that none overlap.
 *
 * Algorithm:
 * 1. Sort threads by their original highlight y-position (preserving relative order).
 * 2. Iterate through sorted threads; if a card would overlap with the previous one
 *    (their y-positions differ by less than cardHeight + gap), push it down.
 *
 * This is a pure function suitable for property-based testing.
 *
 * @param threads - Array of thread IDs with their highlight y-coordinates
 * @param cardHeight - Height of a single thread card in pixels
 * @param gap - Minimum vertical gap between cards (defaults to 8px)
 * @returns Array of adjusted positions with no overlaps, preserving relative order
 */
export function calculateThreadPositions(
  threads: ThreadPosition[],
  cardHeight: number,
  gap: number = DEFAULT_GAP,
): AdjustedThreadPosition[] {
  if (threads.length === 0) return [];

  // Sort by highlight y-position (stable sort preserves insertion order for equal positions)
  const sorted = [...threads].sort((a, b) => a.highlightY - b.highlightY);

  const result: AdjustedThreadPosition[] = [];
  let previousBottom = -Infinity;

  for (const thread of sorted) {
    // Start at the highlight's y-position
    let cardY = thread.highlightY;

    // If this card would overlap with the previous card, push it down
    if (cardY < previousBottom + gap) {
      cardY = previousBottom + gap;
    }

    result.push({
      threadId: thread.threadId,
      highlightY: thread.highlightY,
      cardY,
    });

    previousBottom = cardY + cardHeight;
  }

  return result;
}

/**
 * Returns the vertical DOM position of a comment highlight mark with the given
 * threadId, relative to a reference element (typically the panel's container).
 *
 * Searches for the first `<mark>` or `<span>` element with `data-thread-id`
 * matching the given threadId within the editor's DOM. Falls back to null
 * if the highlight cannot be found.
 *
 * @param editor - TipTap editor instance
 * @param threadId - The thread ID to locate
 * @param referenceElement - The element whose top is used as the origin (0) for y-coordinates
 * @returns The y-position of the highlight relative to the reference element, or null if not found
 */
export function getHighlightPosition(
  editor: Editor,
  threadId: string,
  referenceElement: HTMLElement,
): number | null {
  const editorElement = editor.view.dom;

  // Find the highlight element by its data-thread-id attribute
  const highlightEl = editorElement.querySelector(
    `[data-thread-id="${threadId}"]`,
  );

  if (!highlightEl) return null;

  const highlightRect = highlightEl.getBoundingClientRect();
  const referenceRect = referenceElement.getBoundingClientRect();

  // Return center-Y of the highlight relative to the reference element's top
  const highlightCenterY =
    highlightRect.top + highlightRect.height / 2 - referenceRect.top;

  return highlightCenterY;
}
