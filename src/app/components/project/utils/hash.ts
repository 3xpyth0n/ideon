import { Node, Edge } from "@xyflow/react";
import { BlockData } from "@components/project/CanvasBlock";
import type { CanvasStateSnapshot } from "../../../../lib/yjs-canvas-state";

export const generateStateHash = async (
  blocks: Node<BlockData>[],
  links: Edge[],
  canvasStates?: CanvasStateSnapshot[],
): Promise<string> => {
  // Sort blocks by ID to ensure order independence
  const sortedBlocks = [...blocks]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((b) => ({
      id: b.id,
      position: { x: Math.round(b.position.x), y: Math.round(b.position.y) }, // Round to avoid float jitter
      data: {
        content: b.data.content,
        // Include other relevant data fields that constitute "state"
        title: b.data.title,
        metadata: b.data.metadata,
      },
      width: b.width,
      height: b.height,
      type: b.type,
    }));

  // Sort links by ID
  const sortedLinks = [...links]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((l) => ({
      id: l.id,
      source: l.source,
      target: l.target,
    }));

  const sortedCanvasStates = canvasStates
    ?.map((canvas) => ({
      canvasId: canvas.canvasId,
      blocks: canvas.blocks
        .map((block) => ({
          id: block.id,
          position: {
            x: Math.round(block.position.x),
            y: Math.round(block.position.y),
          },
          data: {
            content: block.data?.content,
            title: block.data?.title,
            metadata: block.data?.metadata,
          },
          width: block.width,
          height: block.height,
          type: block.type,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      links: canvas.links
        .map((link) => ({
          id: link.id,
          source: link.source,
          target: link.target,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      contents: Object.fromEntries(
        Object.entries(canvas.contents).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      noteDocuments: Object.fromEntries(
        Object.entries(canvas.noteDocuments).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      viewport: canvas.viewport,
    }))
    .sort((left, right) => left.canvasId.localeCompare(right.canvasId));

  const stateString = JSON.stringify({
    blocks: sortedBlocks,
    links: sortedLinks,
    canvasStates: sortedCanvasStates,
  });

  // Use Web Crypto for SHA-256
  const msgBuffer = new TextEncoder().encode(stateString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};
