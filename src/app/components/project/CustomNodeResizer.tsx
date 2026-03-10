"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  NodeResizer,
  NodeResizerProps,
  useViewport,
  useStore,
} from "@xyflow/react";
import styles from "./CustomNodeResizer.module.css";

const TARGET_HITBOX_SIZE_PX = 60;
const MIN_HITBOX_SIZE = 2;
const MAX_HITBOX_SIZE = 50;
const DEFAULT_BLOCK_WIDTH = 320;
const DEFAULT_BLOCK_HEIGHT = 240;
const SNAP_THRESHOLD = 0.1;

interface ResizeState {
  handle:
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "top"
    | "bottom"
    | "left"
    | "right";
  fixedCorner: { x: number; y: number };
  originalDims: { width: number; height: number };
}

type ResizeHandle = ResizeState["handle"];

interface ResizeParams {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NodeGeometry {
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

const extractHandleFromEvent = (event: unknown): ResizeHandle | null => {
  if (event && typeof event === "object" && "target" in event) {
    const target = event.target as HTMLElement;
    const className = target.className;
    if (!className) return null;

    if (className.includes("top") && className.includes("left"))
      return "top-left";
    if (className.includes("top") && className.includes("right"))
      return "top-right";
    if (className.includes("bottom") && className.includes("left"))
      return "bottom-left";
    if (className.includes("bottom") && className.includes("right"))
      return "bottom-right";
    if (className.includes("top")) return "top";
    if (className.includes("bottom")) return "bottom";
    if (className.includes("left")) return "left";
    if (className.includes("right")) return "right";
  }
  return null;
};

const isCenterAnchoredNode = (
  node: NodeGeometry | null | undefined,
): boolean => {
  if (!node || !node.width || !node.height) return false;
  const tolerance = 1;
  return (
    Math.abs(node.position.x - -node.width / 2) < tolerance &&
    Math.abs(node.position.y - -node.height / 2) < tolerance
  );
};

const calculateFixedCorner = (
  node: NodeGeometry,
  handle: ResizeHandle,
): { x: number; y: number } => {
  const nodeX = node.position.x;
  const nodeY = node.position.y;
  const nodeW = node.width || 0;
  const nodeH = node.height || 0;

  switch (handle) {
    case "top-left":
      return { x: nodeX + nodeW, y: nodeY + nodeH };
    case "top-right":
      return { x: nodeX, y: nodeY + nodeH };
    case "bottom-left":
      return { x: nodeX + nodeW, y: nodeY };
    case "bottom-right":
      return { x: nodeX, y: nodeY };
    case "top":
      return { x: nodeX, y: nodeY + nodeH };
    case "bottom":
      return { x: nodeX, y: nodeY };
    case "left":
      return { x: nodeX + nodeW, y: nodeY };
    case "right":
      return { x: nodeX, y: nodeY };
    default:
      return { x: nodeX, y: nodeY };
  }
};

const calculateCorrectedPosition = (
  node: NodeGeometry,
  handle: string,
  fixedCorner: { x: number; y: number },
  newWidth: number,
  newHeight: number,
): { x: number; y: number } => {
  if (isCenterAnchoredNode(node)) {
    return { x: -(newWidth / 2), y: -(newHeight / 2) };
  }

  switch (handle) {
    case "top-left":
      return { x: fixedCorner.x - newWidth, y: fixedCorner.y - newHeight };
    case "top-right":
      return { x: fixedCorner.x, y: fixedCorner.y - newHeight };
    case "bottom-left":
      return { x: fixedCorner.x - newWidth, y: fixedCorner.y };
    case "bottom-right":
      return { x: fixedCorner.x, y: fixedCorner.y };
    case "top":
      return { x: node.position.x, y: fixedCorner.y - newHeight };
    case "bottom":
      return { x: node.position.x, y: fixedCorner.y };
    case "left":
      return { x: fixedCorner.x - newWidth, y: node.position.y };
    case "right":
      return { x: fixedCorner.x, y: node.position.y };
    default:
      return node.position;
  }
};

const applySnapToGrid = (
  width: number,
  height: number,
): { width: number; height: number } => {
  const snapW =
    Math.abs(width - DEFAULT_BLOCK_WIDTH) <=
    DEFAULT_BLOCK_WIDTH * SNAP_THRESHOLD;
  const snapH =
    Math.abs(height - DEFAULT_BLOCK_HEIGHT) <=
    DEFAULT_BLOCK_HEIGHT * SNAP_THRESHOLD;

  return {
    width: snapW ? DEFAULT_BLOCK_WIDTH : Math.round(width),
    height: snapH ? DEFAULT_BLOCK_HEIGHT : Math.round(height),
  };
};

const CustomNodeResizer = memo((props: NodeResizerProps) => {
  const { zoom } = useViewport();
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const lastResizeParamsRef = useRef<ResizeParams | null>(null);

  const resizingNode = useStore((state) =>
    props.nodeId ? state.nodes.find((n) => n.id === props.nodeId) : null,
  );

  const hitboxSize = useMemo(() => {
    if (!zoom || zoom <= 0) return MIN_HITBOX_SIZE;
    const size = TARGET_HITBOX_SIZE_PX * zoom;
    return Math.min(Math.max(size, MIN_HITBOX_SIZE), MAX_HITBOX_SIZE);
  }, [zoom]);

  const handleStyle = useMemo(
    () =>
      ({
        ...props.handleStyle,
        "--hitbox-size": `${hitboxSize}px`,
        pointerEvents: "auto",
      }) as React.CSSProperties,
    [hitboxSize, props.handleStyle],
  );

  const onResizeStart = useCallback<
    NonNullable<NodeResizerProps["onResizeStart"]>
  >(
    (event, params) => {
      if (!resizingNode) return;

      const handle = extractHandleFromEvent(event);
      if (!handle) return;

      const fixedCorner = calculateFixedCorner(resizingNode, handle);
      setResizeState({
        handle,
        fixedCorner,
        originalDims: {
          width: resizingNode.width || 0,
          height: resizingNode.height || 0,
        },
      });

      props.onResizeStart?.(event, params);
    },
    [resizingNode, props],
  );

  const onResizeEnd = useCallback<NonNullable<NodeResizerProps["onResizeEnd"]>>(
    (event, params) => {
      setResizeState(null);

      const fallbackParams: ResizeParams | undefined =
        params ??
        lastResizeParamsRef.current ??
        (resizingNode
          ? {
              x: resizingNode.position.x,
              y: resizingNode.position.y,
              width: resizingNode.width ?? 0,
              height: resizingNode.height ?? 0,
            }
          : undefined);

      props.onResizeEnd?.(event, fallbackParams);
      lastResizeParamsRef.current = null;
    },
    [props, resizingNode],
  );

  const onResize = useCallback<NonNullable<NodeResizerProps["onResize"]>>(
    (event, params) => {
      if (!resizingNode) {
        props.onResize?.(event, params);
        return;
      }

      const { width, height } = applySnapToGrid(params.width, params.height);
      const currentHandle = resizeState?.handle;

      if (!resizeState || !currentHandle) {
        const corrected = {
          ...params,
          x: resizingNode.position.x,
          y: resizingNode.position.y,
          width,
          height,
        };

        lastResizeParamsRef.current = corrected;
        props.onResize?.(event, corrected);
        return;
      }

      const { fixedCorner } = resizeState;
      const position = calculateCorrectedPosition(
        resizingNode,
        currentHandle,
        fixedCorner,
        width,
        height,
      );

      const corrected = {
        ...params,
        x: Math.round(position.x),
        y: Math.round(position.y),
        width,
        height,
      };

      lastResizeParamsRef.current = corrected;
      props.onResize?.(event, corrected);
    },
    [resizingNode, resizeState, props],
  );

  const shouldResize = useCallback<
    NonNullable<NodeResizerProps["shouldResize"]>
  >(() => true, []);

  return (
    <NodeResizer
      {...props}
      handleClassName={`${styles.handle} ${props.handleClassName || ""}`}
      handleStyle={handleStyle}
      onResizeStart={onResizeStart}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      shouldResize={shouldResize}
    />
  );
});

CustomNodeResizer.displayName = "CustomNodeResizer";

export default CustomNodeResizer;
