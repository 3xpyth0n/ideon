import { Node, Edge } from "@xyflow/react";
import {
  CORE_BLOCK_X,
  CORE_BLOCK_Y,
  CORE_BLOCK_WIDTH,
  CORE_BLOCK_HEIGHT,
  LAYOUT_HORIZONTAL_SPACING,
  LAYOUT_VERTICAL_GAP,
  LAYOUT_LEVEL_SPACING,
  DEFAULT_BLOCK_WIDTH,
  DEFAULT_BLOCK_HEIGHT,
} from "./constants";

interface LayoutBlock {
  id: string;
  width: number;
  height: number;
  children: LayoutBlock[];
  level: number;
  side: "left" | "right";
  x?: number;
  y?: number;
  totalSubtreeHeight?: number;
}

export const getLayoutedElements = <TData extends Record<string, unknown>>(
  blocks: Node<TData>[],
  links: Edge[],
  _direction = "LR",
) => {
  const coreBlock = blocks.find((b) => b.type === "core");
  if (!coreBlock) return { blocks, links };

  const coreCenterX = CORE_BLOCK_X + CORE_BLOCK_WIDTH / 2;
  const coreCenterY = CORE_BLOCK_Y + CORE_BLOCK_HEIGHT / 2;

  const blockMap = new Map<string, LayoutBlock>();
  blocks.forEach((b) => {
    const isCore = b.type === "core";
    blockMap.set(b.id, {
      id: b.id,
      width: isCore
        ? CORE_BLOCK_WIDTH
        : b.measured?.width ?? b.width ?? DEFAULT_BLOCK_WIDTH,
      height: isCore
        ? CORE_BLOCK_HEIGHT
        : b.measured?.height ?? b.height ?? DEFAULT_BLOCK_HEIGHT,
      children: [],
      level: 0,
      side: "right",
    });
  });

  const leftGroup: LayoutBlock[] = [];
  const rightGroup: LayoutBlock[] = [];
  const visited = new Set<string>();

  const buildSubtree = (
    parentId: string,
    level: number,
    side: "left" | "right",
  ) => {
    if (visited.has(parentId)) return;
    visited.add(parentId);

    const parent = blockMap.get(parentId)!;
    parent.level = level;
    parent.side = side;

    links.forEach((link) => {
      if (link.source === parentId && link.target !== parentId) {
        const child = blockMap.get(link.target);
        if (child && !visited.has(child.id)) {
          parent.children.push(child);
          buildSubtree(child.id, level + 1, side);
        }
      }
    });
  };

  visited.add(coreBlock.id);

  links.forEach((link) => {
    if (link.source === coreBlock.id) {
      const target = blockMap.get(link.target);
      if (target && !visited.has(target.id)) {
        const side = link.sourceHandle === "left" ? "left" : "right";
        if (side === "left") leftGroup.push(target);
        else rightGroup.push(target);
        buildSubtree(target.id, 1, side);
      }
    }
  });

  const calculateSubtreeHeight = (block: LayoutBlock): number => {
    if (block.children.length === 0) {
      block.totalSubtreeHeight = block.height;
      return block.height;
    }
    const childrenHeight =
      block.children.reduce(
        (acc, child) => acc + calculateSubtreeHeight(child),
        0,
      ) +
      (block.children.length - 1) * LAYOUT_VERTICAL_GAP;

    block.totalSubtreeHeight = Math.max(block.height, childrenHeight);
    return block.totalSubtreeHeight;
  };

  leftGroup.forEach(calculateSubtreeHeight);
  rightGroup.forEach(calculateSubtreeHeight);

  const positionBlock = (
    block: LayoutBlock,
    startX: number,
    startY: number,
  ) => {
    block.x = startX;
    block.y = Math.round(
      startY + (block.totalSubtreeHeight! - block.height) / 2,
    );

    if (block.children.length === 1) {
      // Special case for single child: ensure perfect center alignment
      const child = block.children[0];
      const childX =
        block.side === "right"
          ? startX + block.width + LAYOUT_LEVEL_SPACING
          : startX - child.width - LAYOUT_LEVEL_SPACING;

      // Align child center with parent center
      const parentCenterY = block.y + block.height / 2;
      const childY = Math.round(parentCenterY - child.height / 2);

      // Continue recursion for child's own children
      // We need a startY for the child's subtree
      const childSubtreeStartY =
        childY - (child.totalSubtreeHeight! - child.height) / 2;
      positionBlock(child, childX, childSubtreeStartY);
    } else {
      let currentChildY = startY;
      block.children.forEach((child) => {
        const childX =
          block.side === "right"
            ? startX + block.width + LAYOUT_LEVEL_SPACING
            : startX - child.width - LAYOUT_LEVEL_SPACING;

        positionBlock(child, childX, currentChildY);
        currentChildY += child.totalSubtreeHeight! + LAYOUT_VERTICAL_GAP;
      });
    }
  };

  const leftTotalHeight =
    leftGroup.reduce((acc, n) => acc + n.totalSubtreeHeight!, 0) +
    (leftGroup.length - 1) * LAYOUT_VERTICAL_GAP;
  let currentLeftY = coreCenterY - leftTotalHeight / 2;
  leftGroup.forEach((block) => {
    const startX =
      coreCenterX -
      CORE_BLOCK_WIDTH / 2 -
      LAYOUT_HORIZONTAL_SPACING -
      block.width;
    positionBlock(block, startX, currentLeftY);
    currentLeftY += block.totalSubtreeHeight! + LAYOUT_VERTICAL_GAP;
  });

  const rightTotalHeight =
    rightGroup.reduce((acc, n) => acc + n.totalSubtreeHeight!, 0) +
    (rightGroup.length - 1) * LAYOUT_VERTICAL_GAP;
  let currentRightY = coreCenterY - rightTotalHeight / 2;
  rightGroup.forEach((block) => {
    const startX =
      coreCenterX + CORE_BLOCK_WIDTH / 2 + LAYOUT_HORIZONTAL_SPACING;
    positionBlock(block, startX, currentRightY);
    currentRightY += block.totalSubtreeHeight! + LAYOUT_VERTICAL_GAP;
  });

  const layoutedBlocks = blocks.map((block) => {
    const layoutBlock = blockMap.get(block.id);
    if (block.type === "core" || !layoutBlock || layoutBlock.x === undefined) {
      return {
        ...block,
        position:
          block.type === "core"
            ? { x: CORE_BLOCK_X, y: CORE_BLOCK_Y }
            : block.position,
      };
    }

    return {
      ...block,
      position: {
        x: Math.round(layoutBlock.x),
        y: Math.round(layoutBlock.y!),
      },
    };
  });

  // Update links handles and types for perfect alignment
  const layoutedLinks = links.map((link) => {
    const sourceLayoutBlock = blockMap.get(link.source);
    const targetLayoutBlock = blockMap.get(link.target);

    if (!sourceLayoutBlock || !targetLayoutBlock) return link;

    const side = targetLayoutBlock.side;

    return {
      ...link,
      sourceHandle: side === "left" ? "left" : "right",
      targetHandle: side === "left" ? "right" : "left",
    };
  });

  return { blocks: layoutedBlocks, links: layoutedLinks };
};
