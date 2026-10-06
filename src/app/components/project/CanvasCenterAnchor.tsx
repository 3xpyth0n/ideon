"use client";

import { memo } from "react";
import { Handle, Position, type Node } from "@xyflow/react";
import { useI18n } from "@providers/I18nProvider";
import "./sub-canvas-center-marker.css";

export const CENTER_ANCHOR_ID = "__canvas_center_anchor";
export const CENTER_ANCHOR_SIZE = 56;
export const CENTER_ANCHOR_POSITION = { x: -28, y: -28 };

export type CanvasCenterAnchorNode = Node<
  Record<string, never>,
  "canvasCenterAnchor"
>;
export const centerAnchorNode: CanvasCenterAnchorNode = {
  id: CENTER_ANCHOR_ID,
  type: "canvasCenterAnchor",
  position: CENTER_ANCHOR_POSITION,
  width: CENTER_ANCHOR_SIZE,
  height: CENTER_ANCHOR_SIZE,
  className: "canvas-center-anchor-node",
  draggable: false,
  deletable: false,
  selectable: false,
  data: {},
};

// Pure visibility rule (dependency-free so it can be property-tested in isolation).
export function shouldShowCenterMarker(
  activeDepth: number,
  isPreviewMode: boolean,
): boolean {
  return activeDepth > 0 && !isPreviewMode;
}

export const CanvasCenterAnchor = memo(function CanvasCenterAnchor() {
  const { dict } = useI18n();
  const label = dict.canvas.subCanvasCenterMarker ?? "Canvas center";
  return (
    <div className="canvas-center-anchor" aria-label={label}>
      <div className="canvas-center-circle" role="presentation" />
      <Handle type="source" position={Position.Top} id="n" aria-label={label} />
      <Handle
        type="source"
        position={Position.Right}
        id="e"
        aria-label={label}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="s"
        aria-label={label}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="w"
        aria-label={label}
      />
    </div>
  );
});

CanvasCenterAnchor.displayName = "CanvasCenterAnchor";

export default CanvasCenterAnchor;
