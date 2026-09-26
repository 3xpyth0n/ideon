import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";
import { toPng } from "html-to-image";

export const THUMBNAIL_MAX_WIDTH = 800;
export const THUMBNAIL_MAX_HEIGHT = 500;
const THUMBNAIL_QUALITY = 0.6;

export interface ThumbnailCaptureOptions {
  nodes: Node[];
  stage: HTMLElement;
}

export interface SubCanvasThumbnails {
  light: string;
  dark: string;
}

/** Renders every block in the active canvas into a fixed-size image. */
export async function captureSubCanvasThumbnail({
  nodes,
  stage,
}: ThumbnailCaptureOptions): Promise<SubCanvasThumbnails | null> {
  if (typeof document === "undefined" || nodes.length === 0) return null;

  const originalTheme = stage.getAttribute("data-theme");

  try {
    const bounds = getNodesBounds(nodes);
    if (bounds.width <= 0 || bounds.height <= 0) return null;

    const viewport = getViewportForBounds(
      bounds,
      THUMBNAIL_MAX_WIDTH,
      THUMBNAIL_MAX_HEIGHT,
      0.5,
      2,
      0.2,
    );

    const captureForTheme = async (theme: "light" | "dark") => {
      stage.setAttribute("data-theme", theme);
      return toPng(stage, {
        quality: THUMBNAIL_QUALITY,
        pixelRatio: 1,
        backgroundColor: theme === "dark" ? "#000000" : "#ffffff",
        skipFonts: true,
        width: THUMBNAIL_MAX_WIDTH,
        height: THUMBNAIL_MAX_HEIGHT,
        filter: (node) =>
          !(node instanceof HTMLElement && node.dataset.subcanvasThumbnail),
        style: {
          width: `${THUMBNAIL_MAX_WIDTH}px`,
          height: `${THUMBNAIL_MAX_HEIGHT}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        },
      });
    };

    const light = await captureForTheme("light");
    const dark = await captureForTheme("dark");
    return { light, dark };
  } catch {
    return null;
  } finally {
    if (originalTheme === null) {
      stage.removeAttribute("data-theme");
    } else {
      stage.setAttribute("data-theme", originalTheme);
    }
  }
}

export function fitWithinBounds(
  sourceWidth: number,
  sourceHeight: number,
): { width: number; height: number } {
  const scale = Math.min(
    1,
    THUMBNAIL_MAX_WIDTH / sourceWidth,
    THUMBNAIL_MAX_HEIGHT / sourceHeight,
  );
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}
