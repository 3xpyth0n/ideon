/**
 * Block positioning algorithm (Placement Engine).
 *
 * Computes optimal positions for new blocks on the canvas:
 * - Avoids overlap with existing blocks (40px gap minimum)
 * - Supports anchor-based relative positioning (right/left/up/down)
 * - Falls back to bounding-box edge placement when no anchor is given
 * - Handles batch grid layout (max 5 columns)
 * - Respects explicit position override (no collision check)
 */

// ─── Constants ───────────────────────────────────────────────────────────────

export const GAP = 40;
export const DEFAULT_WIDTH = 320;
export const DEFAULT_HEIGHT = 240;
export const KANBAN_WIDTH = 1165;
export const KANBAN_HEIGHT = 480;
export const SKETCH_WIDTH = 600;
export const SKETCH_HEIGHT = 450;
export const FRAME_WIDTH = 600;
export const FRAME_HEIGHT = 400;
export const MAX_GRID_COLUMNS = 5;
export const MAX_COLLISION_ITERATIONS = 50;

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PlacementInput {
  blockType: string;
  width?: number;
  height?: number;
  position?: { x: number; y: number };
  anchorBlockId?: string;
  direction?: "up" | "down" | "left" | "right";
}

export interface PlacementResult {
  x: number;
  y: number;
}

export interface ExistingBlock {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerY: number;
}

// ─── Default Dimensions ──────────────────────────────────────────────────────

export function getDefaultWidth(blockType: string): number {
  switch (blockType) {
    case "kanban":
      return KANBAN_WIDTH;
    case "sketch":
      return SKETCH_WIDTH;
    case "frame":
      return FRAME_WIDTH;
    default:
      return DEFAULT_WIDTH;
  }
}

export function getDefaultHeight(blockType: string): number {
  switch (blockType) {
    case "kanban":
      return KANBAN_HEIGHT;
    case "sketch":
      return SKETCH_HEIGHT;
    case "frame":
      return FRAME_HEIGHT;
    default:
      return DEFAULT_HEIGHT;
  }
}

// ─── Bounding Box ────────────────────────────────────────────────────────────

export function computeBoundingBox(blocks: ExistingBlock[]): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const block of blocks) {
    if (block.x < minX) minX = block.x;
    if (block.y < minY) minY = block.y;
    if (block.x + block.width > maxX) maxX = block.x + block.width;
    if (block.y + block.height > maxY) maxY = block.y + block.height;
  }

  const centerY = (minY + maxY) / 2;

  return { minX, minY, maxX, maxY, centerY };
}

// ─── Collision Detection ─────────────────────────────────────────────────────

export function hasCollision(
  pos: { x: number; y: number },
  width: number,
  height: number,
  existingBlocks: ExistingBlock[],
  gap: number = GAP,
): boolean {
  for (const block of existingBlocks) {
    if (rectanglesOverlap(pos, width, height, block, gap)) {
      return true;
    }
  }
  return false;
}

function rectanglesOverlap(
  pos: { x: number; y: number },
  w: number,
  h: number,
  block: ExistingBlock,
  margin: number,
): boolean {
  return !(
    pos.x + w + margin <= block.x ||
    block.x + block.width + margin <= pos.x ||
    pos.y + h + margin <= block.y ||
    block.y + block.height + margin <= pos.y
  );
}

// ─── Collision Resolution ────────────────────────────────────────────────────

export function resolveCollision(
  candidate: { x: number; y: number },
  width: number,
  height: number,
  existingBlocks: ExistingBlock[],
  direction: "up" | "down" | "left" | "right",
): PlacementResult {
  const pos = { x: candidate.x, y: candidate.y };
  let iterations = 0;

  while (
    hasCollision(pos, width, height, existingBlocks) &&
    iterations < MAX_COLLISION_ITERATIONS
  ) {
    switch (direction) {
      case "right":
        pos.x += GAP + width;
        break;
      case "left":
        pos.x -= GAP + width;
        break;
      case "down":
        pos.y += GAP + height;
        break;
      case "up":
        pos.y -= GAP + height;
        break;
    }
    iterations++;
  }

  return pos;
}

// ─── Anchor Position ─────────────────────────────────────────────────────────

function computeAnchorPosition(
  anchor: ExistingBlock,
  direction: "up" | "down" | "left" | "right",
  width: number,
  height: number,
): { x: number; y: number } {
  switch (direction) {
    case "right":
      return { x: anchor.x + anchor.width + GAP, y: anchor.y };
    case "left":
      return { x: anchor.x - width - GAP, y: anchor.y };
    case "down":
      return { x: anchor.x, y: anchor.y + anchor.height + GAP };
    case "up":
      return { x: anchor.x, y: anchor.y - height - GAP };
  }
}

// ─── Single Block Placement ──────────────────────────────────────────────────

export function computePosition(
  input: PlacementInput,
  existingBlocks: ExistingBlock[],
  anchorBlock?: ExistingBlock,
): PlacementResult {
  // Case 1: Explicit position provided → bypass
  if (input.position) {
    return { x: input.position.x, y: input.position.y };
  }

  // Determine dimensions
  const width = input.width ?? getDefaultWidth(input.blockType);
  const height = input.height ?? getDefaultHeight(input.blockType);

  // Case 2: Empty canvas
  if (existingBlocks.length === 0) {
    return { x: 0, y: 0 };
  }

  // Case 3: Anchor specified
  if (anchorBlock) {
    const direction = input.direction ?? "right";
    const candidate = computeAnchorPosition(
      anchorBlock,
      direction,
      width,
      height,
    );
    return resolveCollision(
      candidate,
      width,
      height,
      existingBlocks,
      direction,
    );
  }

  // Case 4: No anchor → place right of bounding box
  const bbox = computeBoundingBox(existingBlocks);
  const candidate = {
    x: bbox.maxX + GAP,
    y: bbox.centerY - height / 2,
  };
  return resolveCollision(candidate, width, height, existingBlocks, "right");
}

// ─── Batch Placement (Grid Layout) ──────────────────────────────────────────

export function computeBatchPositions(
  inputs: PlacementInput[],
  existingBlocks: ExistingBlock[],
  anchorBlock?: ExistingBlock,
): PlacementResult[] {
  // Determine start position
  let startX: number;
  let startY: number;

  if (anchorBlock) {
    startX = anchorBlock.x + anchorBlock.width + GAP;
    startY = anchorBlock.y;
  } else if (existingBlocks.length > 0) {
    const bbox = computeBoundingBox(existingBlocks);
    const gridHeight = estimateGridHeight(inputs);
    startX = bbox.maxX + GAP;
    startY = bbox.centerY - gridHeight / 2;
  } else {
    startX = 0;
    startY = 0;
  }

  const results: PlacementResult[] = [];
  let col = 0;
  let maxHeightInRow = 0;
  let currentX = startX;
  let currentY = startY;

  for (const input of inputs) {
    // Explicit position override
    if (input.position) {
      results.push({ x: input.position.x, y: input.position.y });
      continue;
    }

    const width = input.width ?? getDefaultWidth(input.blockType);
    const height = input.height ?? getDefaultHeight(input.blockType);

    // Wrap to next row if column limit reached
    if (col >= MAX_GRID_COLUMNS) {
      col = 0;
      currentX = startX;
      currentY += maxHeightInRow + GAP;
      maxHeightInRow = 0;
    }

    results.push({ x: currentX, y: currentY });
    currentX += width + GAP;
    maxHeightInRow = Math.max(maxHeightInRow, height);
    col++;
  }

  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estimateGridHeight(inputs: PlacementInput[]): number {
  const rows = Math.ceil(inputs.length / MAX_GRID_COLUMNS);
  if (rows === 0) return 0;

  // Estimate average row height based on block types
  let totalHeight = 0;
  let currentRowMax = 0;
  let col = 0;

  for (const input of inputs) {
    if (input.position) continue;

    const height = input.height ?? getDefaultHeight(input.blockType);

    if (col >= MAX_GRID_COLUMNS) {
      totalHeight += currentRowMax + GAP;
      currentRowMax = 0;
      col = 0;
    }

    currentRowMax = Math.max(currentRowMax, height);
    col++;
  }

  // Add the last row
  if (col > 0) {
    totalHeight += currentRowMax;
  }

  return totalHeight;
}
