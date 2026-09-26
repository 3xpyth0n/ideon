import * as Y from "yjs";
import type { Viewport } from "@xyflow/react";
import type { Node } from "@xyflow/react";
import type { BlockData } from "../CanvasBlock";

/** Maximum nesting depth for sub-canvas blocks. */
export const MAX_CANVAS_DEPTH = 5;

export const SUB_CANVAS_MIN_WIDTH = 160;
export const SUB_CANVAS_MIN_HEIGHT = 120;
export const SUB_CANVAS_MAX_WIDTH = 1920;
export const SUB_CANVAS_MAX_HEIGHT = 1080;

export interface ClampedSize {
  width: number;
  height: number;
}

// Clamp target size to the Sub-Canvas Block boundaries (160-1920 x 120-1080).
export function clampSubCanvasResize(
  width: number,
  height: number,
): ClampedSize {
  return {
    width: Math.min(
      SUB_CANVAS_MAX_WIDTH,
      Math.max(SUB_CANVAS_MIN_WIDTH, width),
    ),
    height: Math.min(
      SUB_CANVAS_MAX_HEIGHT,
      Math.max(SUB_CANVAS_MIN_HEIGHT, height),
    ),
  };
}

// A sub-canvas may only be created when the current nesting depth is below the
// max. Returns false once activeDepth >= maxDepth.
export function canCreateSubCanvas(
  activeDepth: number,
  maxDepth: number,
): boolean {
  return activeDepth < maxDepth;
}

// A Viewer role or preview mode renders the canvas read-only: no mutation is
// allowed. Owners/members/editors may mutate unless in preview mode.
export function isRoleReadOnly(
  userRole: string | null | undefined,
  isPreviewMode: boolean,
): boolean {
  return isPreviewMode || userRole === "viewer";
}

// Applies `mutate` to the blocks map only if the current role is allowed to
// write. When read-only the map is left structurally unchanged and the
// mutation is skipped. This is the single gate every canvas mutation goes
// through, so the Viewer read-only contract is enforced in one place.
export function applyBlockMutationIfAllowed(
  blocksMap: Y.Map<unknown>,
  userRole: string | null | undefined,
  isPreviewMode: boolean,
  mutate: () => void,
): boolean {
  if (isRoleReadOnly(userRole, isPreviewMode)) {
    return false;
  }
  mutate();
  return true;
}

// Trimmed-empty titles are rejected; the previous title is kept.
export function resolveCommittedTitle(
  submitted: string,
  previousTitle: string,
): { title: string; changed: boolean } {
  const trimmed = submitted.trim();
  if (trimmed.length === 0) {
    return { title: previousTitle, changed: false };
  }
  return { title: trimmed, changed: trimmed !== previousTitle };
}

/**
 * Represents a single entry in the sub-canvas navigation stack.
 * Stores the canvas identity, its display title, and the viewport
 * state at the time the user navigated away (null for the root canvas
 * before any navigation has occurred).
 */
export interface CanvasFrame {
  canvasId: string;
  title: string;
  viewport: Viewport | null;
  captureThumbnailOnExit?: boolean;
}

/** A navigation stack is an ordered list of CanvasFrames, with the
 *  last entry being the currently active canvas. */
export type NavStack = CanvasFrame[];

/**
 * The viewport state persisted inside `yDoc.getMap("viewports")`.
 * Mirrors the `{ x, y, zoom }` shape from @xyflow/react `Viewport`,
 * but is stored as a plain JSON-serialisable object so that Yjs can
 * keep it in a Y.Map without requiring a nested Y.Doc structure.
 */
export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Recursively deletes all Yjs data associated with a sub-canvas and any
 * sub-canvases nested within it.
 *
 * The recursion happens *before* the transaction so that nested canvas ids
 * are still readable at traversal time. All map clears and the viewports
 * deletion are then committed atomically inside a single `yDoc.transact()`.
 *
 * Maps cleared for each canvas id:
 *   - `blocks:<canvasId>`
 *   - `links:<canvasId>`
 *   - `contents:<canvasId>`
 *   - `noteDocuments:<canvasId>`
 *   - entry in `viewports` map
 */
export function deleteSubCanvasRecursive(yDoc: Y.Doc, canvasId: string): void {
  const blocksMap = yDoc.getMap<Node<BlockData>>(`blocks:${canvasId}`);

  // Collect nested sub-canvas block ids before we start clearing.
  const nestedSubCanvasIds: string[] = [];
  blocksMap.forEach((block) => {
    if (block.type === "subcanvas") {
      nestedSubCanvasIds.push(block.id);
    }
  });

  // Recurse into nested sub-canvases first so their data is cleaned up
  // before we wipe this level's blocks map.
  for (const nestedId of nestedSubCanvasIds) {
    deleteSubCanvasRecursive(yDoc, nestedId);
  }

  // Clear all maps for this canvas inside a single atomic transaction.
  yDoc.transact(() => {
    yDoc.getMap(`blocks:${canvasId}`).clear();
    yDoc.getMap(`links:${canvasId}`).clear();
    yDoc.getMap(`contents:${canvasId}`).clear();
    yDoc.getMap(`noteDocuments:${canvasId}`).clear();
    yDoc.getMap("viewports").delete(canvasId);
  });
}
