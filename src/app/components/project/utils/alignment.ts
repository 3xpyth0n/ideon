import { Node } from "@xyflow/react";
import { BlockData } from "@components/project/CanvasBlock";
import { DEFAULT_BLOCK_WIDTH, DEFAULT_BLOCK_HEIGHT } from "./constants";

export interface HelperLine {
  type: "horizontal" | "vertical";
  position: number;
}

export type ResizeHandle =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top"
  | "bottom"
  | "left"
  | "right";

export interface ResizeAlignmentResult {
  helperLines: HelperLine[];
  snappedRect: { x: number; y: number; width: number; height: number };
}

export interface AlignmentResult {
  helperLines: HelperLine[];
  snappedPosition: { x: number; y: number } | null;
}

function getNodeRect(node: Node<BlockData>) {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width || node.width || DEFAULT_BLOCK_WIDTH,
    height: node.measured?.height || node.height || DEFAULT_BLOCK_HEIGHT,
  };
}

function filterOtherNodes(
  allNodes: Node<BlockData>[],
  currentNodeId: string,
  excludeNodeIds: ReadonlySet<string>,
) {
  return allNodes.filter(
    (node) =>
      node.id !== currentNodeId &&
      node.type !== "core" &&
      !excludeNodeIds.has(node.id),
  );
}

function deduplicateHelperLines(lines: HelperLine[]): HelperLine[] {
  return Array.from(
    new Map(lines.map((line) => [line.position, line])).values(),
  );
}

export function calculateHelperLines(
  draggingNode: Node<BlockData>,
  allNodes: Node<BlockData>[],
  snapThreshold: number = 8,
  disabled: boolean = false,
  excludeNodeIds: ReadonlySet<string> = new Set(),
): AlignmentResult {
  if (disabled) {
    return { helperLines: [], snappedPosition: null };
  }

  const draggingRect = getNodeRect(draggingNode);

  const draggingLeft = draggingRect.x;
  const draggingRight = draggingRect.x + draggingRect.width;
  const draggingTop = draggingRect.y;
  const draggingBottom = draggingRect.y + draggingRect.height;
  const draggingCenterX = draggingRect.x + draggingRect.width / 2;
  const draggingCenterY = draggingRect.y + draggingRect.height / 2;

  const otherNodes = filterOtherNodes(
    allNodes,
    draggingNode.id,
    excludeNodeIds,
  );

  const verticalLines: HelperLine[] = [];
  const horizontalLines: HelperLine[] = [];
  let snapX: number | null = null;
  let snapY: number | null = null;

  for (const node of otherNodes) {
    const nodeRect = getNodeRect(node);

    const left = nodeRect.x;
    const right = nodeRect.x + nodeRect.width;
    const top = nodeRect.y;
    const bottom = nodeRect.y + nodeRect.height;
    const centerX = nodeRect.x + nodeRect.width / 2;
    const centerY = nodeRect.y + nodeRect.height / 2;

    if (Math.abs(draggingLeft - left) < snapThreshold) {
      verticalLines.push({ type: "vertical", position: left });
      if (snapX === null) snapX = left;
    }

    if (Math.abs(draggingLeft - right) < snapThreshold) {
      verticalLines.push({ type: "vertical", position: right });
      if (snapX === null) snapX = right;
    }

    if (Math.abs(draggingRight - left) < snapThreshold) {
      verticalLines.push({ type: "vertical", position: left });
      if (snapX === null) snapX = left - draggingRect.width;
    }

    if (Math.abs(draggingRight - right) < snapThreshold) {
      verticalLines.push({ type: "vertical", position: right });
      if (snapX === null) snapX = right - draggingRect.width;
    }

    if (Math.abs(draggingCenterX - centerX) < snapThreshold) {
      verticalLines.push({ type: "vertical", position: centerX });
      if (snapX === null) snapX = centerX - draggingRect.width / 2;
    }

    if (Math.abs(draggingTop - top) < snapThreshold) {
      horizontalLines.push({ type: "horizontal", position: top });
      if (snapY === null) snapY = top;
    }

    if (Math.abs(draggingTop - bottom) < snapThreshold) {
      horizontalLines.push({ type: "horizontal", position: bottom });
      if (snapY === null) snapY = bottom;
    }

    if (Math.abs(draggingBottom - top) < snapThreshold) {
      horizontalLines.push({ type: "horizontal", position: top });
      if (snapY === null) snapY = top - draggingRect.height;
    }

    if (Math.abs(draggingBottom - bottom) < snapThreshold) {
      horizontalLines.push({ type: "horizontal", position: bottom });
      if (snapY === null) snapY = bottom - draggingRect.height;
    }

    if (Math.abs(draggingCenterY - centerY) < snapThreshold) {
      horizontalLines.push({ type: "horizontal", position: centerY });
      if (snapY === null) snapY = centerY - draggingRect.height / 2;
    }
  }

  const uniqueVerticalLines = deduplicateHelperLines(verticalLines);
  const uniqueHorizontalLines = deduplicateHelperLines(horizontalLines);
  const helperLines = [...uniqueVerticalLines, ...uniqueHorizontalLines];

  const snappedPosition =
    snapX !== null || snapY !== null
      ? {
          x: snapX !== null ? snapX : draggingRect.x,
          y: snapY !== null ? snapY : draggingRect.y,
        }
      : null;

  return { helperLines, snappedPosition };
}

export function calculateResizeHelperLines(
  resizingNodeId: string,
  rect: { x: number; y: number; width: number; height: number },
  handle: ResizeHandle,
  allNodes: Node<BlockData>[],
  snapThreshold: number = 8,
  disabled: boolean = false,
  excludeNodeIds: ReadonlySet<string> = new Set(),
): ResizeAlignmentResult {
  if (disabled) {
    return { helperLines: [], snappedRect: rect };
  }

  const movesLeft =
    handle === "left" || handle === "top-left" || handle === "bottom-left";
  const movesRight =
    handle === "right" || handle === "top-right" || handle === "bottom-right";
  const movesTop =
    handle === "top" || handle === "top-left" || handle === "top-right";
  const movesBottom =
    handle === "bottom" ||
    handle === "bottom-left" ||
    handle === "bottom-right";

  const curLeft = rect.x;
  const curRight = rect.x + rect.width;
  const curTop = rect.y;
  const curBottom = rect.y + rect.height;

  const otherNodes = filterOtherNodes(allNodes, resizingNodeId, excludeNodeIds);

  const verticalLines: HelperLine[] = [];
  const horizontalLines: HelperLine[] = [];
  let snapLeft: number | null = null;
  let snapRight: number | null = null;
  let snapTop: number | null = null;
  let snapBottom: number | null = null;

  for (const node of otherNodes) {
    const nodeRect = getNodeRect(node);
    const nLeft = nodeRect.x;
    const nRight = nodeRect.x + nodeRect.width;
    const nTop = nodeRect.y;
    const nBottom = nodeRect.y + nodeRect.height;

    if (movesLeft) {
      if (Math.abs(curLeft - nLeft) < snapThreshold) {
        verticalLines.push({ type: "vertical", position: nLeft });
        if (snapLeft === null) snapLeft = nLeft;
      }
      if (Math.abs(curLeft - nRight) < snapThreshold) {
        verticalLines.push({ type: "vertical", position: nRight });
        if (snapLeft === null) snapLeft = nRight;
      }
    }

    if (movesRight) {
      if (Math.abs(curRight - nRight) < snapThreshold) {
        verticalLines.push({ type: "vertical", position: nRight });
        if (snapRight === null) snapRight = nRight;
      }
      if (Math.abs(curRight - nLeft) < snapThreshold) {
        verticalLines.push({ type: "vertical", position: nLeft });
        if (snapRight === null) snapRight = nLeft;
      }
    }

    if (movesTop) {
      if (Math.abs(curTop - nTop) < snapThreshold) {
        horizontalLines.push({ type: "horizontal", position: nTop });
        if (snapTop === null) snapTop = nTop;
      }
      if (Math.abs(curTop - nBottom) < snapThreshold) {
        horizontalLines.push({ type: "horizontal", position: nBottom });
        if (snapTop === null) snapTop = nBottom;
      }
    }

    if (movesBottom) {
      if (Math.abs(curBottom - nBottom) < snapThreshold) {
        horizontalLines.push({ type: "horizontal", position: nBottom });
        if (snapBottom === null) snapBottom = nBottom;
      }
      if (Math.abs(curBottom - nTop) < snapThreshold) {
        horizontalLines.push({ type: "horizontal", position: nTop });
        if (snapBottom === null) snapBottom = nTop;
      }
    }
  }

  const uniqueVertical = deduplicateHelperLines(verticalLines);
  const uniqueHorizontal = deduplicateHelperLines(horizontalLines);
  const helperLines = [...uniqueVertical, ...uniqueHorizontal];

  let { x, y, width, height } = rect;

  if (movesLeft && snapLeft !== null) {
    const fixedRight = x + width;
    x = snapLeft;
    width = fixedRight - x;
  }

  if (movesRight && snapRight !== null) {
    width = snapRight - x;
  }

  if (movesTop && snapTop !== null) {
    const fixedBottom = y + height;
    y = snapTop;
    height = fixedBottom - y;
  }

  if (movesBottom && snapBottom !== null) {
    height = snapBottom - y;
  }

  return { helperLines, snappedRect: { x, y, width, height } };
}
