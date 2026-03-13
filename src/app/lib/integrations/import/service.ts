import { runTransaction } from "@lib/db";
import { sanitizeFileName } from "@lib/file-utils";
import { database } from "@lib/types/db";
import { Kysely, Insertable } from "kysely";
import { mkdir, writeFile } from "fs/promises";
import { join, posix } from "path";
import {
  IntegrationImportResult,
  NormalizedImportData,
  ImportedAsset,
} from "./types";
import { blocksTable, linksTable } from "@lib/types/db";

interface PersistImportPayload {
  db: Kysely<database>;
  userId: string;
  projectName: string;
  description: string;
  data: NormalizedImportData;
}

type HierarchyNodeKind = "folder" | "note" | "asset";

interface HierarchyNode {
  key: string;
  kind: HierarchyNodeKind;
  path: string;
  parentKey: string;
}

interface PositionedNode {
  x: number;
  y: number;
}

type BlockHandle = "left" | "right" | "top" | "bottom";

function getUploadStorageDirectory(projectId: string): string {
  return join(process.cwd(), "storage", "uploads", `project-${projectId}`);
}

function getAssetMimeType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "pdf":
      return "application/pdf";
    case "md":
      return "text/markdown";
    default:
      return "application/octet-stream";
  }
}

function createUniqueFileName(
  originalName: string,
  usedNames: Set<string>,
): string {
  const safeName = sanitizeFileName(originalName);
  if (!usedNames.has(safeName)) {
    usedNames.add(safeName);
    return safeName;
  }

  const dotIndex = safeName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const extension = dotIndex > 0 ? safeName.slice(dotIndex) : "";

  let suffix = 1;
  while (usedNames.has(`${baseName}-${suffix}${extension}`)) {
    suffix += 1;
  }

  const uniqueName = `${baseName}-${suffix}${extension}`;
  usedNames.add(uniqueName);
  return uniqueName;
}

async function writeImportedAssets(
  projectId: string,
  assets: ImportedAsset[],
): Promise<Map<string, { fileName: string; mimeType: string; size: number }>> {
  const storageDirectory = getUploadStorageDirectory(projectId);
  await mkdir(storageDirectory, { recursive: true });

  const usedNames = new Set<string>();
  const writtenAssets = new Map<
    string,
    { fileName: string; mimeType: string; size: number }
  >();

  for (const asset of assets) {
    const fileName = createUniqueFileName(asset.name, usedNames);
    const filePath = join(storageDirectory, fileName);
    await writeFile(filePath, asset.content);

    writtenAssets.set(asset.path, {
      fileName,
      mimeType: asset.mimeType || getAssetMimeType(fileName),
      size: asset.content.byteLength,
    });
  }

  return writtenAssets;
}

function buildGridPosition(index: number): { x: number; y: number } {
  return {
    x: 200 + index * 20,
    y: 120 + index * 20,
  };
}

function getParentFolderPath(pathValue: string): string {
  const normalized = pathValue.replace(/^\/+|\/+$/g, "");
  if (!normalized || !normalized.includes("/")) {
    return "";
  }
  return normalized.split("/").slice(0, -1).join("/");
}

function getFolderDepth(pathValue: string): number {
  if (!pathValue) {
    return 0;
  }
  return pathValue.split("/").filter(Boolean).length;
}

function collectFolderPaths(paths: string[]): string[] {
  const folders = new Set<string>();

  for (const pathValue of paths) {
    let folder = getParentFolderPath(pathValue);
    while (folder) {
      folders.add(folder);
      folder = getParentFolderPath(folder);
    }
  }

  return Array.from(folders).sort((left, right) => {
    const leftDepth = getFolderDepth(left);
    const rightDepth = getFolderDepth(right);
    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }
    return left.localeCompare(right);
  });
}

function getFolderName(folderPath: string): string {
  return posix.basename(folderPath) || folderPath;
}

function buildHierarchyNodes(data: NormalizedImportData): HierarchyNode[] {
  const contentPaths = [
    ...data.notes.map((note) => note.path),
    ...data.assets.map((asset) => asset.path),
  ];

  const folderPaths = collectFolderPaths(contentPaths);
  const folderKeyByPath = new Map<string, string>();
  const nodes: HierarchyNode[] = [];

  for (const folderPath of folderPaths) {
    const key = `folder:${folderPath}`;
    folderKeyByPath.set(folderPath, key);

    const parentFolderPath = getParentFolderPath(folderPath);
    const parentKey = parentFolderPath
      ? folderKeyByPath.get(parentFolderPath) ?? "core"
      : "core";

    nodes.push({
      key,
      kind: "folder",
      path: folderPath,
      parentKey,
    });
  }

  for (const note of data.notes) {
    const parentFolderPath = getParentFolderPath(note.path);
    nodes.push({
      key: `note:${note.path}`,
      kind: "note",
      path: note.path,
      parentKey: parentFolderPath
        ? folderKeyByPath.get(parentFolderPath) ?? "core"
        : "core",
    });
  }

  for (const asset of data.assets) {
    const parentFolderPath = getParentFolderPath(asset.path);
    nodes.push({
      key: `asset:${asset.path}`,
      kind: "asset",
      path: asset.path,
      parentKey: parentFolderPath
        ? folderKeyByPath.get(parentFolderPath) ?? "core"
        : "core",
    });
  }

  return nodes;
}

function buildNodeOrderingScore(node: HierarchyNode): number {
  if (node.kind === "folder") {
    return 0;
  }
  if (node.kind === "note") {
    return 1;
  }
  return 2;
}

function buildLayeredTreePositions(
  nodes: HierarchyNode[],
): Map<string, PositionedNode> {
  const children = new Map<string, HierarchyNode[]>();

  for (const node of nodes) {
    const list = children.get(node.parentKey) || [];
    list.push(node);
    children.set(node.parentKey, list);
  }

  children.forEach((nodeChildren) => {
    nodeChildren.sort((left, right) => {
      const kindOrder =
        buildNodeOrderingScore(left) - buildNodeOrderingScore(right);
      if (kindOrder !== 0) {
        return kindOrder;
      }
      return left.path.localeCompare(right.path);
    });
  });

  const depthByKey = new Map<string, number>();
  depthByKey.set("core", 0);

  const queue: string[] = ["core"];
  while (queue.length > 0) {
    const currentKey = queue.shift();
    if (!currentKey) {
      continue;
    }

    const currentDepth = depthByKey.get(currentKey) || 0;
    const nodeChildren = children.get(currentKey) || [];
    nodeChildren.forEach((child) => {
      depthByKey.set(child.key, currentDepth + 1);
      queue.push(child.key);
    });
  }

  const positions = new Map<string, PositionedNode>();
  positions.set("core", { x: 0, y: 0 });

  const levelGap = 920;
  const leafGap = 360;
  let nextLeafY = 0;

  const placeSubtree = (parentKey: string): number => {
    const nodeChildren = children.get(parentKey) || [];
    if (!nodeChildren.length) {
      const leafY = nextLeafY;
      nextLeafY += leafGap;
      return leafY;
    }

    const childYValues: number[] = [];

    nodeChildren.forEach((child) => {
      const childY = placeSubtree(child.key);
      childYValues.push(childY);

      const childDepth = depthByKey.get(child.key) || 1;
      positions.set(child.key, {
        x: childDepth * levelGap,
        y: childY,
      });
    });

    const minY = Math.min(...childYValues);
    const maxY = Math.max(...childYValues);
    return (minY + maxY) / 2;
  };

  const rootCenterY = placeSubtree("core");

  positions.forEach((position, key) => {
    if (key === "core") {
      return;
    }
    positions.set(key, {
      x: position.x,
      y: position.y - rootCenterY,
    });
  });

  return positions;
}

function resolveHandlesFromPositions(
  sourcePosition: PositionedNode,
  targetPosition: PositionedNode,
  options?: {
    forceHorizontal?: boolean;
    horizontalBias?: number;
  },
): { sourceHandle: BlockHandle; targetHandle: BlockHandle } {
  const deltaX = targetPosition.x - sourcePosition.x;
  const deltaY = targetPosition.y - sourcePosition.y;
  const horizontalBias = options?.horizontalBias ?? 1.0;

  if (options?.forceHorizontal) {
    return deltaX >= 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" };
  }

  if (Math.abs(deltaX) * horizontalBias >= Math.abs(deltaY)) {
    return deltaX >= 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" };
  }

  return deltaY >= 0
    ? { sourceHandle: "bottom", targetHandle: "top" }
    : { sourceHandle: "top", targetHandle: "bottom" };
}

export async function persistNormalizedImport({
  db,
  userId,
  projectName,
  description,
  data,
}: PersistImportPayload): Promise<IntegrationImportResult> {
  const now = new Date().toISOString();
  const projectId = crypto.randomUUID();
  const coreBlockId = crypto.randomUUID();
  const hierarchyNodes = buildHierarchyNodes(data);
  const positions = buildLayeredTreePositions(hierarchyNodes);
  let persistedRelationsCount = 0;

  const writtenAssets = await writeImportedAssets(projectId, data.assets);

  await runTransaction(db, async (trx) => {
    await trx
      .insertInto("projects")
      .values({
        id: projectId,
        name: projectName,
        description,
        ownerId: userId,
        folderId: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await trx
      .insertInto("blocks")
      .values({
        id: coreBlockId,
        projectId,
        blockType: "core",
        positionX: 0,
        positionY: 0,
        width: 640,
        height: 480,
        ownerId: userId,
        content: projectName,
        metadata: JSON.stringify({ description }),
        data: JSON.stringify({ blockType: "core", isLocked: false }),
        createdAt: now,
        updatedAt: now,
        selected: 0,
      } as Insertable<blocksTable>)
      .execute();

    const blockIdByNodeKey = new Map<string, string>();
    blockIdByNodeKey.set("core", coreBlockId);
    const noteIdByPath = new Map<string, string>();
    const noteByPath = new Map(data.notes.map((note) => [note.path, note]));
    const assetByPath = new Map(
      data.assets.map((asset) => [asset.path, asset]),
    );

    const folderBlocks = hierarchyNodes
      .filter((node) => node.kind === "folder")
      .map((node, index) => {
        const blockId = crypto.randomUUID();
        blockIdByNodeKey.set(node.key, blockId);

        const position = positions.get(node.key) || buildGridPosition(index);
        const folderName = getFolderName(node.path);

        return {
          id: blockId,
          projectId,
          blockType: "folder",
          positionX: position.x,
          positionY: position.y,
          width: 320,
          height: 240,
          ownerId: userId,
          content: folderName,
          metadata: JSON.stringify({
            sourcePath: node.path,
            kind: "obsidian-folder",
            isCollapsed: false,
          }),
          data: JSON.stringify({
            blockType: "folder",
            title: folderName,
            isLocked: false,
            metadata: {
              sourcePath: node.path,
              kind: "obsidian-folder",
              isCollapsed: false,
            },
          }),
          createdAt: now,
          updatedAt: now,
          selected: 0,
        } as Insertable<blocksTable>;
      });

    if (folderBlocks.length) {
      await trx.insertInto("blocks").values(folderBlocks).execute();
    }

    const noteBlocks = hierarchyNodes
      .filter((node) => node.kind === "note")
      .map((node, index) => {
        const note = noteByPath.get(node.path);
        if (!note) {
          return null;
        }

        const blockId = crypto.randomUUID();
        blockIdByNodeKey.set(node.key, blockId);
        noteIdByPath.set(node.path, blockId);
        const position = positions.get(node.key) || buildGridPosition(index);

        return {
          id: blockId,
          projectId,
          blockType: "text",
          positionX: position.x,
          positionY: position.y,
          width: 360,
          height: 240,
          ownerId: userId,
          content: note.content,
          metadata: JSON.stringify({ sourcePath: note.path }),
          data: JSON.stringify({
            blockType: "text",
            title: note.title,
            isLocked: false,
            metadata: {
              sourcePath: note.path,
            },
          }),
          createdAt: now,
          updatedAt: now,
          selected: 0,
        } as Insertable<blocksTable>;
      })
      .filter((block): block is Insertable<blocksTable> => Boolean(block));

    if (noteBlocks.length) {
      await trx.insertInto("blocks").values(noteBlocks).execute();
    }

    const fileBlocks = hierarchyNodes
      .filter((node) => node.kind === "asset")
      .map((node, index) => {
        const asset = assetByPath.get(node.path);
        if (!asset) {
          return null;
        }

        const writtenAsset = writtenAssets.get(node.path);
        if (!writtenAsset) {
          return null;
        }

        const blockId = crypto.randomUUID();
        blockIdByNodeKey.set(node.key, blockId);

        const position =
          positions.get(node.key) ||
          buildGridPosition(data.notes.length + index);

        return {
          id: blockId,
          projectId,
          blockType: "file",
          positionX: position.x,
          positionY: position.y,
          width: 300,
          height: 220,
          ownerId: userId,
          content: writtenAsset.fileName,
          metadata: JSON.stringify({
            name: writtenAsset.fileName,
            size: writtenAsset.size,
            type: writtenAsset.mimeType,
            sourcePath: node.path,
          }),
          data: JSON.stringify({
            blockType: "file",
            title: writtenAsset.fileName,
            isLocked: false,
            metadata: {
              name: writtenAsset.fileName,
              size: writtenAsset.size,
              type: writtenAsset.mimeType,
              sourcePath: node.path,
            },
          }),
          createdAt: now,
          updatedAt: now,
          selected: 0,
        } as Insertable<blocksTable>;
      })
      .filter((block): block is Insertable<blocksTable> => Boolean(block));

    if (fileBlocks.length) {
      await trx.insertInto("blocks").values(fileBlocks).execute();
    }

    const hierarchyRelations = hierarchyNodes
      .map((node) => {
        const source = blockIdByNodeKey.get(node.parentKey || "core");
        const target = blockIdByNodeKey.get(node.key);
        const sourcePosition = positions.get(node.parentKey || "core");
        const targetPosition = positions.get(node.key);
        if (!source || !target) {
          return null;
        }

        const handles =
          sourcePosition && targetPosition
            ? resolveHandlesFromPositions(sourcePosition, targetPosition, {
                forceHorizontal: true,
              })
            : { sourceHandle: "right", targetHandle: "left" };

        return {
          id: crypto.randomUUID(),
          projectId,
          source,
          target,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: "connection",
          animated: 0,
          sourceX: null,
          sourceY: null,
          targetX: null,
          targetY: null,
          sourceOrientation: null,
          targetOrientation: null,
          data: JSON.stringify({
            relationType: node.kind === "folder" ? "folder" : "contains",
          }),
          label: null,
          createdAt: now,
          updatedAt: now,
        } as Insertable<linksTable>;
      })
      .filter((relation): relation is Insertable<linksTable> =>
        Boolean(relation),
      );

    const uniqueRelations = new Map<string, Insertable<linksTable>>();
    hierarchyRelations.forEach((relation) => {
      const key = `${relation.source}->${relation.target}->${
        relation.label ?? ""
      }`;
      if (!uniqueRelations.has(key)) {
        uniqueRelations.set(key, relation);
      }
    });

    const relations = Array.from(uniqueRelations.values());
    persistedRelationsCount = relations.length;

    if (relations.length) {
      await trx.insertInto("links").values(relations).execute();
    }

    await trx
      .updateTable("projects")
      .set({ updatedAt: now })
      .where("id", "=", projectId)
      .execute();
  });

  return {
    projectId,
    projectName,
    notesCount: data.notes.length,
    assetsCount: data.assets.length,
    relationsCount: persistedRelationsCount,
  };
}
