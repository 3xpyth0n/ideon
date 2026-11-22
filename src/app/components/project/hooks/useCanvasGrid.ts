import { useCallback, useEffect, type RefObject } from "react";
import { DEFAULT_VIEWPORT } from "../utils/constants";

const GRID_GAP = 25;
const GRID_DOT_RADIUS = 0.75;
const MIN_DOT_RADIUS = 0.5;
const MIN_TILE_SIZE = 20;

// Doubling the gap keeps dots on flow coordinates while avoiding a dense haze at low zoom.
export function getGridTileSize(zoom: number) {
  let size = GRID_GAP * zoom;
  while (size < MIN_TILE_SIZE) size *= 2;
  return size;
}

interface GridViewport {
  x: number;
  y: number;
  zoom: number;
}

export function useCanvasGrid(containerRef: RefObject<HTMLElement | null>) {
  const syncGrid = useCallback(
    (viewport: GridViewport) => {
      const element = containerRef.current;
      if (!element) return;
      const size = getGridTileSize(viewport.zoom);
      const radius = Math.max(MIN_DOT_RADIUS, GRID_DOT_RADIUS * viewport.zoom);
      // Tiles center their dot, so shift by half a tile to land dots on flow coordinates.
      element.style.setProperty("--grid-size", `${size}px`);
      element.style.setProperty("--grid-x", `${viewport.x - size / 2}px`);
      element.style.setProperty("--grid-y", `${viewport.y - size / 2}px`);
      element.style.setProperty("--grid-dot", `${radius}px`);
    },
    [containerRef],
  );

  useEffect(() => {
    syncGrid(DEFAULT_VIEWPORT);
  }, [syncGrid]);

  return syncGrid;
}
