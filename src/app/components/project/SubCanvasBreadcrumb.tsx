"use client";

import { memo } from "react";
import { useI18n } from "@providers/I18nProvider";
import { useSubCanvasNavigation } from "./subcanvas/SubCanvasProvider";

const MAX_TITLE_LENGTH = 30;

// Truncate to MAX_TITLE_LENGTH chars with "…"; full title stays in aria-label.
function truncateTitle(title: string): string {
  return title.length > MAX_TITLE_LENGTH
    ? `${title.slice(0, MAX_TITLE_LENGTH)}…`
    : title;
}

// Path overlay shown while a sub-canvas is open. Ancestors are buttons calling
// jumpToIndex(i); the current (last) entry is plain text. Hidden on the root.
const SubCanvasBreadcrumb = memo(function SubCanvasBreadcrumb() {
  const { dict } = useI18n();
  const { navStack, activeDepth, jumpToIndex } = useSubCanvasNavigation();

  if (activeDepth <= 0) return null;

  return (
    <div
      className="sub-canvas-breadcrumb"
      role="navigation"
      aria-label={dict.blocks.subCanvasBreadcrumb}
    >
      {navStack.map((frame, index) => {
        const isCurrent = index === navStack.length - 1;
        const label = truncateTitle(
          frame.title || dict.blocks.subCanvasProject,
        );

        if (isCurrent) {
          return (
            <span
              key={frame.canvasId}
              className="sub-canvas-breadcrumb-current"
            >
              {label}
            </span>
          );
        }

        return (
          <span key={frame.canvasId} className="sub-canvas-breadcrumb-item">
            <button
              type="button"
              className="sub-canvas-breadcrumb-link"
              aria-label={`Navigate to ${frame.title || "Project"}`}
              onClick={() => jumpToIndex(index)}
            >
              {label}
            </button>
            <span className="sub-canvas-breadcrumb-sep" aria-hidden="true">
              &gt;
            </span>
          </span>
        );
      })}
    </div>
  );
});

SubCanvasBreadcrumb.displayName = "SubCanvasBreadcrumb";

export default SubCanvasBreadcrumb;
