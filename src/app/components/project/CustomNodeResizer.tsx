"use client";

import { memo, useCallback, useMemo, useRef } from "react";
import {
  NodeResizer,
  NodeResizerProps,
  NodeResizeControl,
  useViewport,
  useStore,
  useNodeId,
} from "@xyflow/react";
import type { Node } from "@xyflow/react";
import styles from "./CustomNodeResizer.module.css";
import { calculateResizeHelperLines, ResizeHandle } from "./utils/alignment";
import type { BlockData } from "./CanvasBlock";
import { isBlockPositionLocked } from "./utils/locks";
import { useHelperLines } from "./HelperLinesContext";
import { isOverlappingRestrictedZone } from "./utils/collision";
import { CORE_BLOCK_MARGIN } from "./utils/constants";

const TARGET_HITBOX_SIZE_PX = 60;
const MIN_HITBOX_SIZE = 2;
const MAX_HITBOX_SIZE = 50;
const DEFAULT_BLOCK_WIDTH = 320;
const DEFAULT_BLOCK_HEIGHT = 240;
const SNAP_THRESHOLD = 0.1;
const RESIZE_SNAP_THRESHOLD_PX = 8;
const BLOCK_RESIZE_COLLISION_EPSILON_PX = 2;

function toPositiveNumber(value: unknown, fallback: number) {
  if (typeof value !== "number") return fallback;
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function getCollisionRectForNode(node: Node<BlockData>) {
  const positionAbsolute = (
    node as unknown as { positionAbsolute?: { x: number; y: number } }
  ).positionAbsolute;
  const position = positionAbsolute ?? node.position;
  const style = node.style as { width?: unknown; height?: unknown } | undefined;
  const width = toPositiveNumber(
    (typeof style?.width === "number" ? style.width : undefined) ??
      node.measured?.width ??
      node.width,
    DEFAULT_BLOCK_WIDTH,
  );
  const height = toPositiveNumber(
    (typeof style?.height === "number" ? style.height : undefined) ??
      node.measured?.height ??
      node.height,
    DEFAULT_BLOCK_HEIGHT,
  );
  return { x: position.x, y: position.y, width, height };
}

interface NodeGeometry {
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

interface ResizeState {
  handle: ResizeHandle;
  fixedCorner: { x: number; y: number };
  startPosition: { x: number; y: number };
  originalDims: { width: number; height: number };
}

interface ResizeParams {
  x: number;
  y: number;
  width: number;
  height: number;
}

const extractHandleFromResizeEvent = (event: unknown): ResizeHandle | null => {
  if (!event || typeof event !== "object") return null;

  // ResizeDragEvent is a D3DragEvent — the DOM target is on sourceEvent, not event
  const domEvent =
    "sourceEvent" in event
      ? (event as { sourceEvent?: unknown }).sourceEvent
      : event;

  if (!domEvent || typeof domEvent !== "object" || !("target" in domEvent))
    return null;

  const target = (domEvent as { target?: EventTarget | null }).target;
  if (!(target instanceof Element)) return null;

  const handleElement = target.closest(".react-flow__resize-control");
  if (!(handleElement instanceof HTMLElement)) return null;

  const classNames = handleElement.classList;
  const isTop = classNames.contains("top");
  const isBottom = classNames.contains("bottom");
  const isLeft = classNames.contains("left");
  const isRight = classNames.contains("right");

  if (isTop && isLeft) return "top-left";
  if (isTop && isRight) return "top-right";
  if (isBottom && isLeft) return "bottom-left";
  if (isBottom && isRight) return "bottom-right";
  if (isTop) return "top";
  if (isBottom) return "bottom";
  if (isLeft) return "left";
  if (isRight) return "right";
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
  handle: ResizeHandle,
  fixedCorner: { x: number; y: number },
  startPosition: { x: number; y: number },
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
      return { x: startPosition.x, y: fixedCorner.y - newHeight };
    case "bottom":
      return { x: startPosition.x, y: fixedCorner.y };
    case "left":
      return { x: fixedCorner.x - newWidth, y: startPosition.y };
    case "right":
      return { x: fixedCorner.x, y: startPosition.y };
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

const resolveFallbackPosition = (
  params: { x?: number; y?: number },
  node: NodeGeometry,
): { x: number; y: number } => ({
  x: typeof params.x === "number" ? params.x : node.position.x,
  y: typeof params.y === "number" ? params.y : node.position.y,
});

const CustomNodeResizer = memo((props: NodeResizerProps) => {
  const { zoom } = useViewport();
  const resizeStateRef = useRef<ResizeState | null>(null);
  const lastResizeParamsRef = useRef<ResizeParams | null>(null);

  const contextNodeId = useNodeId();
  const effectiveNodeId = props.nodeId ?? contextNodeId;

  const resizingNode = useStore((state) =>
    effectiveNodeId ? state.nodes.find((n) => n.id === effectiveNodeId) : null,
  );
  const resizingNodeRef = useRef(resizingNode);
  resizingNodeRef.current = resizingNode;

  const allNodes = useStore((state) => state.nodes as Node<BlockData>[]);
  const allNodesRef = useRef(allNodes);
  allNodesRef.current = allNodes;

  const helperLinesCtx = useHelperLines();
  const helperLinesCtxRef = useRef(helperLinesCtx);
  helperLinesCtxRef.current = helperLinesCtx;

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

  const propsRef = useRef(props);
  propsRef.current = props;

  const onResizeStart = useCallback<
    NonNullable<NodeResizerProps["onResizeStart"]>
  >((event, params) => {
    const node = resizingNodeRef.current;
    const handle = extractHandleFromResizeEvent(event);

    if (node && handle && params) {
      const startRect: NodeGeometry = {
        position: { x: params.x, y: params.y },
        width: params.width,
        height: params.height,
      };
      resizeStateRef.current = {
        handle,
        fixedCorner: calculateFixedCorner(startRect, handle),
        startPosition: { x: params.x, y: params.y },
        originalDims: { width: params.width, height: params.height },
      };
    } else {
      resizeStateRef.current = null;
    }

    propsRef.current.onResizeStart?.(event, params);
  }, []);

  const onResizeEnd = useCallback<NonNullable<NodeResizerProps["onResizeEnd"]>>(
    (event, params) => {
      resizeStateRef.current = null;
      helperLinesCtxRef.current?.setHelperLines([]);

      const node = resizingNodeRef.current;
      const fallbackParams: ResizeParams | undefined =
        lastResizeParamsRef.current ??
        params ??
        (node
          ? {
              x: node.position.x,
              y: node.position.y,
              width: node.width ?? 0,
              height: node.height ?? 0,
            }
          : undefined);

      propsRef.current.onResizeEnd?.(event, fallbackParams);
      lastResizeParamsRef.current = null;
    },
    [],
  );

  const onResize = useCallback<NonNullable<NodeResizerProps["onResize"]>>(
    (event, params) => {
      const node = resizingNodeRef.current;

      if (!node) {
        propsRef.current.onResize?.(event, params);
        return;
      }

      const { width, height } = applySnapToGrid(params.width, params.height);
      const resizeState = resizeStateRef.current;
      const currentHandle = resizeState?.handle;

      if (!resizeState || !currentHandle) {
        const fallbackPosition = resolveFallbackPosition(params, node);
        const corrected = {
          ...params,
          x: fallbackPosition.x,
          y: fallbackPosition.y,
          width,
          height,
        };

        lastResizeParamsRef.current = corrected;
        propsRef.current.onResize?.(event, corrected);
        return;
      }

      const { fixedCorner, startPosition } = resizeState;
      const position = calculateCorrectedPosition(
        node,
        currentHandle,
        fixedCorner,
        startPosition,
        width,
        height,
      );

      let corrected = {
        ...params,
        x: Math.round(position.x),
        y: Math.round(position.y),
        width,
        height,
      };

      const ctx = helperLinesCtxRef.current;
      if (ctx) {
        if (node.type !== "core") {
          const { helperLines, snappedRect } = calculateResizeHelperLines(
            node.id,
            {
              x: corrected.x,
              y: corrected.y,
              width: corrected.width,
              height: corrected.height,
            },
            currentHandle,
            allNodesRef.current,
            RESIZE_SNAP_THRESHOLD_PX,
            ctx.isShiftPressed,
          );
          ctx.setHelperLines(helperLines);
          corrected = {
            ...corrected,
            x: Math.round(snappedRect.x),
            y: Math.round(snappedRect.y),
            width: Math.round(snappedRect.width),
            height: Math.round(snappedRect.height),
          };
          ctx.setActiveResizeSnap(
            helperLines.length > 0
              ? {
                  id: node.id,
                  x: corrected.x,
                  y: corrected.y,
                  width: corrected.width,
                  height: corrected.height,
                  handle: currentHandle,
                }
              : null,
          );
        } else {
          ctx.setHelperLines([]);
          ctx.setActiveResizeSnap(null);
        }
      }

      lastResizeParamsRef.current = corrected;
      propsRef.current.onResize?.(event, corrected);
    },
    [],
  );

  const shouldResize = useCallback<
    NonNullable<NodeResizerProps["shouldResize"]>
  >((event, params) => {
    const node = resizingNodeRef.current;

    if (!node) {
      return propsRef.current.shouldResize?.(event, params) ?? true;
    }

    if (node.type !== "core") {
      const core = allNodesRef.current.find((n) => n.type === "core");
      if (core) {
        const proposedRect = {
          x: Number.isFinite(params.x) ? params.x : node.position.x,
          y: Number.isFinite(params.y) ? params.y : node.position.y,
          width: Math.ceil(params.width),
          height: Math.ceil(params.height),
        };

        const coreRect = getCollisionRectForNode(core);
        if (
          isOverlappingRestrictedZone(
            proposedRect,
            coreRect,
            CORE_BLOCK_MARGIN + BLOCK_RESIZE_COLLISION_EPSILON_PX,
          )
        ) {
          return false;
        }
      }
    }

    return propsRef.current.shouldResize?.(event, params) ?? true;
  }, []);

  const isCore = resizingNode?.type === "core";

  const coreHandleStyle = useMemo(
    () =>
      ({
        background: "transparent",
        backgroundColor: "transparent",
        border: "none",
        boxShadow: "none",
        width: `${hitboxSize}px`,
        height: `${hitboxSize}px`,
        "--hitbox-size": `${hitboxSize}px`,
        pointerEvents: "auto",
      }) as React.CSSProperties,
    [hitboxSize],
  );

  if (isBlockPositionLocked(resizingNode?.data as BlockData | undefined)) {
    return null;
  }

  if (isCore) {
    return (
      <NodeResizeControl
        position="bottom-right"
        className={`${styles.handle} ${props.handleClassName || ""}`}
        style={coreHandleStyle}
        minWidth={props.minWidth}
        minHeight={props.minHeight}
        maxWidth={props.maxWidth}
        maxHeight={props.maxHeight}
        keepAspectRatio={props.keepAspectRatio}
        shouldResize={shouldResize}
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
      />
    );
  }

  return (
    <NodeResizer
      {...props}
      handleClassName={`${styles.handle} ${props.handleClassName || ""}`}
      lineClassName={`${styles.handle} ${props.lineClassName || ""}`}
      handleStyle={handleStyle}
      lineStyle={handleStyle}
      onResizeStart={onResizeStart}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      shouldResize={shouldResize}
    />
  );
});

CustomNodeResizer.displayName = "CustomNodeResizer";

export default CustomNodeResizer;
