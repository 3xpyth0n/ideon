import { CORE_BLOCK_MARGIN } from "./constants";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculates the adjusted position of a block to prevent overlap with the core block.
 * Implements a "slide and snap" behavior: if a block enters the restricted zone,
 * it is pushed out to the nearest valid edge.
 */
export function getAdjustedPosition(
  blockRect: Rect,
  coreRect: Rect,
  margin: number = CORE_BLOCK_MARGIN,
): { x: number; y: number } {
  const restrictedZone = {
    left: coreRect.x - margin,
    right: coreRect.x + coreRect.width + margin,
    top: coreRect.y - margin,
    bottom: coreRect.y + coreRect.height + margin,
  };

  const block = {
    left: blockRect.x,
    right: blockRect.x + blockRect.width,
    top: blockRect.y,
    bottom: blockRect.y + blockRect.height,
  };

  // Check for overlap
  const isOverlapping =
    block.right > restrictedZone.left &&
    block.left < restrictedZone.right &&
    block.bottom > restrictedZone.top &&
    block.top < restrictedZone.bottom;

  if (!isOverlapping) {
    return { x: blockRect.x, y: blockRect.y };
  }

  // Calculate distances to move the block out of the restricted zone
  const moveLeft = block.right - restrictedZone.left;
  const moveRight = restrictedZone.right - block.left;
  const moveUp = block.bottom - restrictedZone.top;
  const moveDown = restrictedZone.bottom - block.top;

  // Find the smallest movement required to exit the zone (snap to nearest edge)
  const minMove = Math.min(moveLeft, moveRight, moveUp, moveDown);

  let adjustedX = blockRect.x;
  let adjustedY = blockRect.y;

  if (minMove === moveLeft) {
    adjustedX = restrictedZone.left - blockRect.width;
  } else if (minMove === moveRight) {
    adjustedX = restrictedZone.right;
  } else if (minMove === moveUp) {
    adjustedY = restrictedZone.top - blockRect.height;
  } else if (minMove === moveDown) {
    adjustedY = restrictedZone.bottom;
  }

  return { x: adjustedX, y: adjustedY };
}

/**
 * Finds the closest rect within a threshold.
 */
export function getClosestRect(
  sourceRect: Rect,
  targets: { id: string; rect: Rect }[],
  threshold: number = 150,
): string | null {
  let closestId: string | null = null;
  let minDistance = threshold;

  const sourceCenter = {
    x: sourceRect.x + sourceRect.width / 2,
    y: sourceRect.y + sourceRect.height / 2,
  };

  for (const target of targets) {
    const targetCenter = {
      x: target.rect.x + target.rect.width / 2,
      y: target.rect.y + target.rect.height / 2,
    };

    const dx = sourceCenter.x - targetCenter.x;
    const dy = sourceCenter.y - targetCenter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < minDistance) {
      minDistance = distance;
      closestId = target.id;
    }
  }

  return closestId;
}
