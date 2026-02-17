"use client";

import {
  BaseEdge,
  EdgeProps as LinkProps,
  getSmoothStepPath,
  getBezierPath,
  Position,
  EdgeLabelRenderer,
  Edge,
} from "@xyflow/react";
import { useState, useEffect } from "react";
import "./canvas-edge.css";

interface EdgeData extends Record<string, unknown> {
  label?: string;
  isEditing?: boolean;
  onLabelSubmit?: (id: string, label: string) => void;
  onLabelCancel?: (id: string) => void;
  weight?: number;
}

type CustomEdge = Edge<EdgeData>;

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
  label,
}: LinkProps<CustomEdge>) {
  const [inputValue, setInputValue] = useState<string>(data?.label || "");
  const isEditing = !!data?.isEditing;

  useEffect(() => {
    if (isEditing) {
      setInputValue(data?.label || "");
    }
  }, [isEditing, data?.label]);

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
  let labelX = 0;
  let labelY = 0;

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

    const [bezierPath, bX, bY] = getBezierPath({
      sourceX: innerSource.x,
      sourceY: innerSource.y,
      sourcePosition: sourcePos,
      targetX: innerTarget.x,
      targetY: innerTarget.y,
      targetPosition: targetPos,
    });

    labelX = bX;
    labelY = bY;

    // Remove the starting "M x y" from the bezier path to append it to our custom start
    const bezierCurveOnly = bezierPath.replace(/^M[^C]+/, "");

    edgePath = `M ${sourceX} ${sourceY} L ${innerSource.x} ${innerSource.y}${bezierCurveOnly} L ${targetX} ${targetY}`;
  } else {
    const [smoothPath, sX, sY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition: sourcePos,
      targetX,
      targetY,
      targetPosition: targetPos,
      borderRadius: 16,
      offset: 42,
    });
    edgePath = smoothPath;
    labelX = sX;
    labelY = sY;
  }

  const weight = (data?.weight as number) || 0;
  const strokeWidth = 1.5 + weight * 1.5;
  const opacity = selected ? 1 : Math.min(0.4 + weight * 0.1, 1);
  const edgeLabel = data?.label || label;

  return (
    <>
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
      {isEditing ? (
        <EdgeLabelRenderer>
          <div
            className="edge-label-editor"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              zIndex: 1000,
            }}
          >
            <input
              autoFocus
              className="edge-label-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={() => data?.onLabelSubmit?.(id, inputValue)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  data?.onLabelSubmit?.(id, inputValue);
                }
                if (e.key === "Escape") {
                  data?.onLabelCancel?.(id);
                }
              }}
            />
          </div>
        </EdgeLabelRenderer>
      ) : (
        edgeLabel && (
          <EdgeLabelRenderer>
            <div
              className="edge-label"
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                pointerEvents: "all",
                zIndex: 1000,
              }}
            >
              {edgeLabel}
            </div>
          </EdgeLabelRenderer>
        )
      )}
    </>
  );
}
