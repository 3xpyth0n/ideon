import { CORE_BLOCK_MARGIN } from "./constants";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isOverlappingRestrictedZone(
  blockRect: Rect,
  coreRect: Rect,
  margin: number = CORE_BLOCK_MARGIN,
): boolean {
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

  return (
    block.right > restrictedZone.left &&
    block.left < restrictedZone.right &&
    block.bottom > restrictedZone.top &&
    block.top < restrictedZone.bottom
  );
}

export function getAdjustedPosition(
  blockRect: Rect,
  coreRect: Rect,
  margin: number = CORE_BLOCK_MARGIN,
): { x: number; y: number } {
  if (!isOverlappingRestrictedZone(blockRect, coreRect, margin)) {
    return { x: blockRect.x, y: blockRect.y };
  }

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

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function clampCenteredRect(
  proposedRect: Rect,
  blockingRects: Rect[],
  margin: number = CORE_BLOCK_MARGIN,
): Rect {
  const centerX = proposedRect.x + proposedRect.width / 2;
  const centerY = proposedRect.y + proposedRect.height / 2;
  let width = proposedRect.width;
  let height = proposedRect.height;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const currentRect = {
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    };
    let nextWidth = width;
    let nextHeight = height;

    for (const rect of blockingRects) {
      const expandedRect = {
        x: rect.x - margin,
        y: rect.y - margin,
        width: rect.width + margin * 2,
        height: rect.height + margin * 2,
      };

      if (!overlaps(currentRect, expandedRect)) {
        continue;
      }

      if (expandedRect.x >= centerX) {
        nextWidth = Math.min(nextWidth, (expandedRect.x - centerX) * 2);
      }

      if (expandedRect.x + expandedRect.width <= centerX) {
        nextWidth = Math.min(
          nextWidth,
          (centerX - (expandedRect.x + expandedRect.width)) * 2,
        );
      }

      if (expandedRect.y >= centerY) {
        nextHeight = Math.min(nextHeight, (expandedRect.y - centerY) * 2);
      }

      if (expandedRect.y + expandedRect.height <= centerY) {
        nextHeight = Math.min(
          nextHeight,
          (centerY - (expandedRect.y + expandedRect.height)) * 2,
        );
      }
    }

    if (nextWidth === width && nextHeight === height) {
      break;
    }

    width = Math.max(0, nextWidth);
    height = Math.max(0, nextHeight);
  }

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

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
