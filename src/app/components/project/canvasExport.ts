import { toPng } from "html-to-image";
import type { Node, Rect } from "@xyflow/react";
import { applyMermaidExportContrast } from "./canvasExportStyles";

const PADDING = 48;
const MAX_SIDE = 4096;

// Captures the viewport (blocks and links only, no controls) sized to the real node bounds at 1:1: nothing cropped, no fixed viewport box.
export async function captureCanvasViewport(
  getNodes: () => Node[],
  getNodesBounds: (nodes: Node[]) => Rect,
  backgroundColor: string,
): Promise<string | null> {
  const nodes = getNodes();
  const bounds = getNodesBounds(nodes);
  if (bounds.width === 0 || bounds.height === 0) {
    return null;
  }

  const rawWidth = Math.ceil(bounds.width) + PADDING * 2;
  const rawHeight = Math.ceil(bounds.height) + PADDING * 2;
  const scale = Math.min(1, MAX_SIDE / Math.max(rawWidth, rawHeight));
  const width = Math.ceil(rawWidth * scale);
  const height = Math.ceil(rawHeight * scale);

  const viewport = document.querySelector(
    ".react-flow__viewport",
  ) as HTMLElement | null;
  if (!viewport) {
    return null;
  }

  const restoreMermaidStyles = applyMermaidExportContrast(viewport);
  try {
    return await toPng(viewport, {
      backgroundColor,
      width,
      height,
      skipFonts: true,
      style: {
        width: String(width),
        height: String(height),
        transformOrigin: "top left",
        transform: `translate(${(PADDING - bounds.x) * scale}px, ${
          (PADDING - bounds.y) * scale
        }px) scale(${scale})`,
      },
    });
  } finally {
    restoreMermaidStyles();
  }
}
