/**
 * Yjs document access layer for MCP operations.
 *
 * Provides helpers to load Yjs documents (live in-memory or from LevelDB),
 * read blocks/links maps, and persist modifications when the document is not
 * live (no connected WebSocket clients).
 */

import * as Y from "yjs";
import type { LeveldbPersistence } from "y-leveldb";
import type { Node } from "@xyflow/react";
import type { BlockData } from "../../app/components/project/CanvasBlock";
import { docs } from "../y-websocket/utils";

export interface BlockEntry {
  id: string;
  type: string;
  position: { x: number; y: number };
  width: number | undefined;
  height: number | undefined;
  data: BlockData;
}

export interface LinkEntry {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  type: string;
  animated: boolean;
  label: string | null;
}

/**
 * Load or retrieve the Yjs doc for a project.
 * If the doc is live (clients connected via WebSocket), returns the in-memory doc.
 * Otherwise, loads from LevelDB persistence.
 */
export async function getProjectDoc(
  projectId: string,
  ldb: LeveldbPersistence,
): Promise<{ ydoc: Y.Doc; isLive: boolean }> {
  const docName = `project-${projectId}`;
  const live = docs.get(docName);
  if (live) return { ydoc: live, isLive: true };

  const persisted = await ldb.getYDoc(docName);
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persisted));
  return { ydoc, isLive: false };
}

/**
 * Persist changes if the doc is not live.
 * Live docs are automatically persisted by the WebSocket update handler.
 */
export async function persistIfNeeded(
  projectId: string,
  ydoc: Y.Doc,
  isLive: boolean,
  ldb: LeveldbPersistence,
): Promise<void> {
  if (!isLive) {
    const docName = `project-${projectId}`;
    await ldb.storeUpdate(docName, Y.encodeStateAsUpdate(ydoc));
  }
}

/**
 * Read all blocks from the Yjs document's "blocks" map.
 */
export function readBlocks(ydoc: Y.Doc): BlockEntry[] {
  const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
  const blocks: BlockEntry[] = [];

  yBlocks.forEach((node, id) => {
    blocks.push({
      id,
      type: node.data?.blockType ?? node.type ?? "text",
      position: node.position ?? { x: 0, y: 0 },
      width: node.width ?? node.measured?.width ?? undefined,
      height: node.height ?? node.measured?.height ?? undefined,
      data: node.data,
    });
  });

  return blocks;
}

/**
 * Read all links from the Yjs document's "links" map.
 */
export function readLinks(ydoc: Y.Doc): LinkEntry[] {
  const yLinks = ydoc.getMap("links");
  const links: LinkEntry[] = [];

  yLinks.forEach((edge, id) => {
    const e = edge as Record<string, unknown>;
    links.push({
      id,
      source: (e.source as string) ?? "",
      target: (e.target as string) ?? "",
      sourceHandle: (e.sourceHandle as string | null) ?? null,
      targetHandle: (e.targetHandle as string | null) ?? null,
      type: (e.type as string) ?? "default",
      animated: (e.animated as boolean) ?? false,
      label: (e.label as string | null) ?? null,
    });
  });

  return links;
}
