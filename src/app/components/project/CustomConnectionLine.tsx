import {
  ConnectionLineComponentProps,
  getBezierPath,
  Position,
} from "@xyflow/react";

export const CustomConnectionLine = ({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
}: ConnectionLineComponentProps) => {
  const [linkPath] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition || Position.Right,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition || Position.Left,
  });

  return (
    <g>
      <path
        fill="none"
        stroke="var(--text-main)"
        strokeWidth={1.5}
        strokeOpacity={0.8}
        strokeDasharray="5,5"
        className="walking-ants"
        d={linkPath}
        markerEnd="url(#connection-arrow)"
      />
    </g>
  );
};
