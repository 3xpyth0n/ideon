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

export function clampCenteredRect(
  proposedRect: Rect,
  blockingRects: Rect[],
  margin: number = CORE_BLOCK_MARGIN,
): Rect {
  const centerX = proposedRect.x + proposedRect.width / 2;
  const centerY = proposedRect.y + proposedRect.height / 2;
  const expandedRects = blockingRects.map((rect) => ({
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  }));
  let halfWidth = proposedRect.width / 2;
  let halfHeight = proposedRect.height / 2;

  for (const rect of expandedRects) {
    const verticalOverlap =
      centerY + halfHeight > rect.y &&
      centerY - halfHeight < rect.y + rect.height;

    if (verticalOverlap) {
      if (rect.x >= centerX) {
        halfWidth = Math.min(halfWidth, rect.x - centerX);
      }
      if (rect.x + rect.width <= centerX) {
        halfWidth = Math.min(halfWidth, centerX - (rect.x + rect.width));
      }
    }
  }

  halfWidth = Math.max(0, halfWidth);

  for (const rect of expandedRects) {
    const horizontalOverlap =
      centerX + halfWidth > rect.x && centerX - halfWidth < rect.x + rect.width;

    if (horizontalOverlap) {
      if (rect.y >= centerY) {
        halfHeight = Math.min(halfHeight, rect.y - centerY);
      }
      if (rect.y + rect.height <= centerY) {
        halfHeight = Math.min(halfHeight, centerY - (rect.y + rect.height));
      }
    }
  }

  halfHeight = Math.max(0, halfHeight);

  const width = halfWidth * 2;
  const height = halfHeight * 2;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

export function clampBottomRightRect(
  proposedRect: Rect,
  blockingRects: Rect[],
  margin: number = CORE_BLOCK_MARGIN,
): Rect {
  const expandedRects = blockingRects.map((rect) => ({
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  }));
  let width = proposedRect.width;
  let height = proposedRect.height;

  for (const rect of expandedRects) {
    const verticalOverlap =
      proposedRect.y + height > rect.y && proposedRect.y < rect.y + rect.height;

    if (verticalOverlap && rect.x >= proposedRect.x) {
      width = Math.min(width, rect.x - proposedRect.x);
    }
  }

  width = Math.max(0, width);

  for (const rect of expandedRects) {
    const horizontalOverlap =
      proposedRect.x + width > rect.x && proposedRect.x < rect.x + rect.width;

    if (horizontalOverlap && rect.y >= proposedRect.y) {
      height = Math.min(height, rect.y - proposedRect.y);
    }
  }

  height = Math.max(0, height);

  return {
    x: proposedRect.x,
    y: proposedRect.y,
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
