import { Node } from "@xyflow/react";
import {
  CORE_BLOCK_HEIGHT,
  CORE_BLOCK_WIDTH,
  DEFAULT_BLOCK_HEIGHT,
  DEFAULT_BLOCK_WIDTH,
} from "./constants";

export interface ViewportSize {
  width: number;
  height: number;
}

export interface FitViewport {
  x: number;
  y: number;
  zoom: number;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FitOptions {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
}

const FALLBACK_PADDING = 0.12;
const FALLBACK_MIN_ZOOM = 0.1;
const FALLBACK_MAX_ZOOM = 2;
const MIN_AXIS_FACTOR = 0.1;
const MOBILE_PORTRAIT_MAX_WIDTH = 768;
const MOBILE_PORTRAIT_SIDE_MARGIN_PX = 10;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toPositiveNumber(value: unknown, fallback: number) {
  if (typeof value !== "number") return fallback;
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function getUsableAxis(
  axisLength: number,
  insetPx: number,
  contentLength: number,
) {
  const usable = axisLength - insetPx * 2;
  return Math.max(contentLength * MIN_AXIS_FACTOR, usable);
}

function getNodeDimensions(node: Node) {
  const isCore = node.type === "core";
  const fallbackWidth = isCore ? CORE_BLOCK_WIDTH : DEFAULT_BLOCK_WIDTH;
  const fallbackHeight = isCore ? CORE_BLOCK_HEIGHT : DEFAULT_BLOCK_HEIGHT;
  const measured = (
    node as unknown as { measured?: { width?: number; height?: number } }
  ).measured;

  return {
    width: toPositiveNumber(node.width ?? measured?.width, fallbackWidth),
    height: toPositiveNumber(node.height ?? measured?.height, fallbackHeight),
  };
}

export function getNodesBoundsWithFallback(nodes: Node[]): Bounds | null {
  if (nodes.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    const absolute = (
      node as unknown as { positionAbsolute?: { x: number; y: number } }
    ).positionAbsolute;
    const position = absolute ?? node.position;
    const { width, height } = getNodeDimensions(node);

    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + width);
    maxY = Math.max(maxY, position.y + height);
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function computeLongestSideViewport(
  bounds: Bounds,
  viewportSize: ViewportSize,
  options?: FitOptions,
): FitViewport {
  const padding = clamp(options?.padding ?? FALLBACK_PADDING, 0, 0.45);
  const minZoom = options?.minZoom ?? FALLBACK_MIN_ZOOM;
  const maxZoom = options?.maxZoom ?? FALLBACK_MAX_ZOOM;
  const dominantIsWidth = bounds.width >= bounds.height;
  const secondaryIsWidth = !dominantIsWidth;
  const isMobilePortrait =
    viewportSize.width <= MOBILE_PORTRAIT_MAX_WIDTH &&
    viewportSize.height > viewportSize.width;

  const contentAxis = dominantIsWidth ? bounds.width : bounds.height;
  const dominantInsetPx = dominantIsWidth
    ? isMobilePortrait
      ? MOBILE_PORTRAIT_SIDE_MARGIN_PX
      : viewportSize.width * padding
    : viewportSize.height * padding;
  const secondaryContentAxis = secondaryIsWidth ? bounds.width : bounds.height;
  const secondaryInsetPx = secondaryIsWidth
    ? isMobilePortrait
      ? MOBILE_PORTRAIT_SIDE_MARGIN_PX
      : viewportSize.width * padding
    : viewportSize.height * padding;
  const dominantUsableAxis = getUsableAxis(
    dominantIsWidth ? viewportSize.width : viewportSize.height,
    dominantInsetPx,
    contentAxis,
  );
  const secondaryUsableAxis = getUsableAxis(
    secondaryIsWidth ? viewportSize.width : viewportSize.height,
    secondaryInsetPx,
    secondaryContentAxis,
  );
  const dominantZoom = dominantUsableAxis / contentAxis;
  const secondaryZoom = secondaryUsableAxis / secondaryContentAxis;

  // Longest-side fit first, then clamp to avoid overflow on the secondary axis.
  const zoom = clamp(Math.min(dominantZoom, secondaryZoom), minZoom, maxZoom);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  return {
    zoom,
    x: viewportSize.width / 2 - centerX * zoom,
    y: viewportSize.height / 2 - centerY * zoom,
  };
}

export function computeViewportToRevealBounds(
  viewport: FitViewport,
  viewportSize: ViewportSize,
  bounds: Bounds,
  options?: Pick<FitOptions, "padding">,
): FitViewport {
  const padding = clamp(options?.padding ?? FALLBACK_PADDING, 0, 0.45);
  const zoom = toPositiveNumber(viewport.zoom, 1);
  const viewportLeft = -viewport.x / zoom;
  const viewportTop = -viewport.y / zoom;
  const viewportWidth = viewportSize.width / zoom;
  const viewportHeight = viewportSize.height / zoom;
  const insetX = (viewportSize.width * padding) / zoom;
  const insetY = (viewportSize.height * padding) / zoom;
  const safeWidth = Math.max(1, viewportWidth - insetX * 2);
  const safeHeight = Math.max(1, viewportHeight - insetY * 2);
  const targetRight = bounds.x + bounds.width;
  const targetBottom = bounds.y + bounds.height;
  let nextLeft = viewportLeft;
  let nextTop = viewportTop;

  if (bounds.width > safeWidth) {
    nextLeft = bounds.x + bounds.width / 2 - viewportWidth / 2;
  } else {
    const safeLeft = viewportLeft + insetX;
    const safeRight = viewportLeft + viewportWidth - insetX;

    if (bounds.x < safeLeft) nextLeft = bounds.x - insetX;
    else if (targetRight > safeRight)
      nextLeft = targetRight + insetX - viewportWidth;
  }

  if (bounds.height > safeHeight) {
    nextTop = bounds.y + bounds.height / 2 - viewportHeight / 2;
  } else {
    const safeTop = viewportTop + insetY;
    const safeBottom = viewportTop + viewportHeight - insetY;

    if (bounds.y < safeTop) nextTop = bounds.y - insetY;
    else if (targetBottom > safeBottom)
      nextTop = targetBottom + insetY - viewportHeight;
  }

  if (
    Math.abs(nextLeft - viewportLeft) < Number.EPSILON &&
    Math.abs(nextTop - viewportTop) < Number.EPSILON
  ) {
    return viewport;
  }

  return {
    zoom,
    x: -nextLeft * zoom,
    y: -nextTop * zoom,
  };
}

export function getReactFlowViewportSize(): ViewportSize | null {
  if (typeof window === "undefined") return null;

  const root = document.querySelector(".react-flow") as HTMLElement | null;
  if (!root) return null;

  const width = root.clientWidth;
  const height = root.clientHeight;

  if (width <= 0 || height <= 0) return null;

  return { width, height };
}
