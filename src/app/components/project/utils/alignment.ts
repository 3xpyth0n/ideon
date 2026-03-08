import { Node } from "@xyflow/react";
import { BlockData } from "@components/project/CanvasBlock";
import { DEFAULT_BLOCK_WIDTH, DEFAULT_BLOCK_HEIGHT } from "./constants";

export interface HelperLine {
  type: "horizontal" | "vertical";
  position: number;
}

export interface AlignmentResult {
  helperLines: HelperLine[];
  snappedPosition: { x: number; y: number } | null;
}

export function calculateHelperLines(
  draggingNode: Node<BlockData>,
  allNodes: Node<BlockData>[],
  snapThreshold: number = 8,
  disabled: boolean = false,
): AlignmentResult {
  if (disabled) {
    return { helperLines: [], snappedPosition: null };
  }

  const draggingRect = {
    x: draggingNode.position.x,
    y: draggingNode.position.y,
    width:
      draggingNode.measured?.width || draggingNode.width || DEFAULT_BLOCK_WIDTH,
    height:
      draggingNode.measured?.height ||
      draggingNode.height ||
      DEFAULT_BLOCK_HEIGHT,
  };

  const draggingLeft = draggingRect.x;
  const draggingRight = draggingRect.x + draggingRect.width;
  const draggingTop = draggingRect.y;
  const draggingBottom = draggingRect.y + draggingRect.height;
  const draggingCenterX = draggingRect.x + draggingRect.width / 2;
  const draggingCenterY = draggingRect.y + draggingRect.height / 2;

  const otherNodes = allNodes.filter(
    (node) => node.id !== draggingNode.id && node.type !== "core",
  );

  const verticalLines: HelperLine[] = [];
  const horizontalLines: HelperLine[] = [];
  let snapX: number | null = null;
  let snapY: number | null = null;

  for (const node of otherNodes) {
    const nodeRect = {
      x: node.position.x,
      y: node.position.y,
      width: node.measured?.width || node.width || DEFAULT_BLOCK_WIDTH,
      height: node.measured?.height || node.height || DEFAULT_BLOCK_HEIGHT,
    };

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

  const uniqueVerticalLines = Array.from(
    new Map(verticalLines.map((line) => [line.position, line])).values(),
  );

  const uniqueHorizontalLines = Array.from(
    new Map(horizontalLines.map((line) => [line.position, line])).values(),
  );

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
