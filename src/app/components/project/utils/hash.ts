import { Node, Edge } from "@xyflow/react";
import { BlockData } from "../CanvasBlock";

export const generateStateHash = async (
  blocks: Node<BlockData>[],
  links: Edge[],
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

  const stateString = JSON.stringify({
    blocks: sortedBlocks,
    links: sortedLinks,
  });

  // Use Web Crypto for SHA-256
  const msgBuffer = new TextEncoder().encode(stateString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};
