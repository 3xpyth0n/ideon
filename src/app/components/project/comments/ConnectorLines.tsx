"use client";

import type { AdjustedThreadPosition } from "./layoutUtils";

/**
 * Props for the ConnectorLines SVG component.
 */
export interface ConnectorLinesProps {
  /** Adjusted thread positions with highlight and card y-coordinates */
  positions: AdjustedThreadPosition[];
  /** Width of the SVG area (the horizontal gap between highlight and card) */
  width: number;
  /** Optional: ID of the thread currently being hovered (for highlighting) */
  activeThreadId?: string | null;
}

/**
 * ConnectorLines renders SVG lines connecting highlight positions (left side)
 * to their corresponding thread card positions (right side).
 *
 * Each line is a simple path from the highlight's y-position on the left
 * to the card's y-position on the right. When highlights and cards are
 * at different y-positions (due to collision avoidance), the line will be
 * angled to show the connection.
 *
 * This is a purely presentational component.
 */
export function ConnectorLines({
  positions,
  width,
  activeThreadId,
}: ConnectorLinesProps) {
  if (positions.length === 0 || width <= 0) return null;

  // Calculate the full height needed for the SVG
  const maxY = Math.max(
    ...positions.map((p) => Math.max(p.highlightY, p.cardY)),
  );
  const height = maxY + 20; // Add padding at the bottom

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0"
      width={width}
      height={height}
      aria-hidden="true"
    >
      {positions.map((pos) => {
        const isActive = activeThreadId === pos.threadId;
        const strokeColor = isActive
          ? "rgba(96, 165, 250, 0.8)"
          : "rgba(156, 163, 175, 0.4)";
        const strokeWidth = isActive ? 1.5 : 1;

        return (
          <line
            key={pos.threadId}
            x1={0}
            y1={pos.highlightY}
            x2={width}
            y2={pos.cardY}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
