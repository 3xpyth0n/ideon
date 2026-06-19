"use client";

import { useState, useLayoutEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CommentPanelProps } from "./types";

const PANEL_GAP = 12;
const PANEL_MAX_WIDTH = 320;

interface CommentPanelComponentProps extends CommentPanelProps {
  visible: boolean;
  children?: ReactNode;
}

/**
 * CommentPanel renders a container positioned to the right of the NoteBlock
 * using createPortal into `app-main-container`. It tracks the block's bounding
 * rect and follows viewport panning/zooming via rAF.
 */
export function CommentPanel({
  blockRef,
  zoom,
  visible,
  children,
}: CommentPanelComponentProps) {
  const [blockRect, setBlockRect] = useState<DOMRect | null>(null);

  const updateRect = useCallback(() => {
    if (!blockRef.current) {
      setBlockRect(null);
      return;
    }
    const nextRect = blockRef.current.getBoundingClientRect();
    setBlockRect((prevRect) => {
      if (
        prevRect &&
        prevRect.top === nextRect.top &&
        prevRect.left === nextRect.left &&
        prevRect.width === nextRect.width &&
        prevRect.height === nextRect.height
      ) {
        return prevRect;
      }
      return nextRect;
    });
  }, [blockRef]);

  useLayoutEffect(() => {
    if (!visible || !blockRef.current) {
      setBlockRect(null);
      return;
    }

    const blockElement = blockRef.current;
    const reactFlowNodeElement = blockElement.closest(".react-flow__node");

    updateRect();

    const resizeObserver = new ResizeObserver(updateRect);
    resizeObserver.observe(blockElement);
    if (reactFlowNodeElement instanceof HTMLElement) {
      resizeObserver.observe(reactFlowNodeElement);
    }

    const mutationObserver = new MutationObserver(updateRect);
    if (reactFlowNodeElement instanceof HTMLElement) {
      mutationObserver.observe(reactFlowNodeElement, {
        attributes: true,
        attributeFilter: ["style", "class"],
      });
    }

    // Track viewport panning via the react-flow viewport container transform changes
    const viewportEl = blockElement.closest(".react-flow__viewport");
    if (viewportEl instanceof HTMLElement) {
      mutationObserver.observe(viewportEl, {
        attributes: true,
        attributeFilter: ["style"],
      });
    }

    window.addEventListener("resize", updateRect);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", updateRect);
    };
  }, [visible, blockRef, updateRect]);

  if (!visible || !blockRect) return null;

  const container = document.getElementById("app-main-container");
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();
  const top = blockRect.top - containerRect.top;
  const left = blockRect.right - containerRect.left + PANEL_GAP;

  const hasChildren =
    children !== null && children !== undefined && children !== false;

  if (!hasChildren) return null;

  const style: React.CSSProperties = {
    position: "absolute",
    top,
    left,
    transform: `scale(${zoom})`,
    transformOrigin: "top left",
    maxWidth: PANEL_MAX_WIDTH,
    maxHeight: "80vh",
    overflowY: "auto",
    zIndex: 1050,
  };

  return createPortal(
    <div
      className="comment-panel rounded-xl bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 shadow-xl p-2.5 flex flex-col gap-1.5"
      style={style}
    >
      {children}
    </div>,
    container,
  );
}
