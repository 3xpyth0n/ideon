"use client";

import {
  BaseEdge,
  EdgeProps as LinkProps,
  getSmoothStepPath,
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
  id,
}: LinkProps) {
  // console.log("Rendering CanvasEdge:", { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (
    sourceX === undefined ||
    sourceY === undefined ||
    targetX === undefined ||
    targetY === undefined
  ) {
    return null;
  }

  const sourcePos = sourcePosition || Position.Right;
  const targetPos = targetPosition || Position.Left;

  const isHorizontal = (pos: Position) =>
    pos === Position.Left || pos === Position.Right;
  const isVertical = (pos: Position) =>
    pos === Position.Top || pos === Position.Bottom;

  let edgePath = "";

  // Use Bezier for strictly linear connections (horizontal-horizontal or vertical-vertical)
  // Use SmoothStep for orthogonal/mixed connections (horizontal-vertical)
  if (
    (isHorizontal(sourcePos) && isHorizontal(targetPos)) ||
    (isVertical(sourcePos) && isVertical(targetPos))
  ) {
    const offset = 24;
    const getInnerPoint = (x: number, y: number, pos: Position) => {
      switch (pos) {
        case Position.Right:
          return { x: x + offset, y };
        case Position.Left:
          return { x: x - offset, y };
        case Position.Top:
          return { x, y: y - offset };
        case Position.Bottom:
          return { x, y: y + offset };
        default:
          return { x, y };
      }
    };

    const innerSource = getInnerPoint(sourceX, sourceY, sourcePos);
    const innerTarget = getInnerPoint(targetX, targetY, targetPos);

    const [bezierPath] = getBezierPath({
      sourceX: innerSource.x,
      sourceY: innerSource.y,
      sourcePosition: sourcePos,
      targetX: innerTarget.x,
      targetY: innerTarget.y,
      targetPosition: targetPos,
    });

    // Remove the starting "M x y" from the bezier path to append it to our custom start
    const bezierCurveOnly = bezierPath.replace(/^M[^C]+/, "");

    edgePath = `M ${sourceX} ${sourceY} L ${innerSource.x} ${innerSource.y}${bezierCurveOnly} L ${targetX} ${targetY}`;
  } else {
    [edgePath] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition: sourcePos,
      targetX,
      targetY,
      targetPosition: targetPos,
      borderRadius: 16,
      offset: 42,
    });
  }

  const weight = (data?.weight as number) || 0;
  const strokeWidth = 1.5 + weight * 1.5;
  const opacity = selected ? 1 : Math.min(0.4 + weight * 0.1, 1);

  return (
    <g className="react-flow__edge" data-id={id}>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={30}
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
