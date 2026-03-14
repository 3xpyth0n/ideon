import { Node, Edge } from "@xyflow/react";
import { BlockData } from "@components/project/CanvasBlock";
import { parseFolderMetadata } from "@lib/metadata-parsers";

export const getDescendantIds = (rootId: string, graphLinks: Edge[]) => {
  const visited = new Set<string>();
  const queue = graphLinks
    .filter((link) => link.source === rootId)
    .map((link) => link.target);

  while (queue.length > 0) {
    const nextId = queue.shift();
    if (!nextId || visited.has(nextId)) {
      continue;
    }

    visited.add(nextId);

    for (const link of graphLinks) {
      if (link.source === nextId && !visited.has(link.target)) {
        queue.push(link.target);
      }
    }
  }

  return visited;
};

export const getCollapsedFolderIds = (nodes: Node<BlockData>[]) => {
  return new Set(
    nodes
      .filter((node) => node.type === "folder")
      .filter((node) => parseFolderMetadata(node.data?.metadata).isCollapsed)
      .map((node) => node.id),
  );
};

export const computeHiddenNodeIds = (
  nodes: Node<BlockData>[],
  graphLinks: Edge[],
) => {
  const hiddenIds = new Set<string>();
  const collapsedFolderIds = getCollapsedFolderIds(nodes);

  for (const folderId of collapsedFolderIds) {
    const descendants = getDescendantIds(folderId, graphLinks);
    descendants.delete(folderId);
    descendants.forEach((descendantId) => hiddenIds.add(descendantId));
  }

  return hiddenIds;
};
