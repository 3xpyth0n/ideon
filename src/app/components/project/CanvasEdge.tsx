"use client";

import {
  BaseEdge,
  EdgeProps as LinkProps,
  getBezierPath,
  Position,
} from "@xyflow/react";

export default function CanvasEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  selected,
}: LinkProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: sourcePosition || Position.Right,
    targetX,
    targetY,
    targetPosition: targetPosition || Position.Left,
  });

  const weight = (data?.weight as number) || 0;
  const strokeWidth = 1.5 + weight * 1.5;
  const opacity = selected ? 1 : Math.min(0.4 + weight * 0.1, 1);

  return (
    <g className="react-flow__edge">
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          strokeWidth,
          opacity,
          stroke: "var(--text-main)",
          strokeDasharray: selected ? "5,5" : undefined,
          filter:
            weight > 1
              ? `drop-shadow(0 0 ${weight}px currentColor)`
              : undefined,
          ...style,
        }}
      />
    </g>
  );
}
