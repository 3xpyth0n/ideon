import { projectAction } from "@lib/server-utils";
import { getDb } from "@lib/db";
import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { zipSync } from "fflate";
import type { Edge, Node } from "@xyflow/react";
import {
  captureCanvasStateSnapshots,
  type CanvasStateSnapshot,
} from "../../../../../lib/yjs-canvas-state";
import { getProjectYjsDoc } from "../../../../../lib/projectYjsDoc";

function serializeBlock(
  node: Node<Record<string, unknown>>,
  existing: Record<string, unknown> | undefined,
  timestamp: string,
) {
  const data = node.data ?? {};
  const metadata = data.metadata;
  return {
    id: node.id,
    blockType:
      typeof data.blockType === "string" ? data.blockType : node.type || "text",
    metadata:
      typeof metadata === "string" ? metadata : JSON.stringify(metadata ?? {}),
    parentBlockId:
      (existing?.parentBlockId as string | null | undefined) ?? null,
    positionX: node.position.x,
    positionY: node.position.y,
    width: node.width ?? null,
    height: node.height ?? null,
    content:
      typeof data.content === "string"
        ? data.content
        : (existing?.content as string | null | undefined) ?? null,
    data: JSON.stringify(data),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt:
      (typeof data.updatedAt === "string" && data.updatedAt) ||
      existing?.updatedAt ||
      timestamp,
  };
}

function serializeLink(
  edge: Edge,
  existing: Record<string, unknown> | undefined,
  timestamp: string,
) {
  const data = (edge.data ?? {}) as Record<string, unknown>;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    animated: edge.animated ? 1 : 0,
    type: edge.type ?? (existing?.type as string | null | undefined) ?? null,
    label:
      typeof data.label === "string"
        ? data.label
        : (existing?.label as string | null | undefined) ?? null,
    data: JSON.stringify(data),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: existing?.updatedAt ?? timestamp,
  };
}

export const GET = projectAction(async (_req, { project, role }) => {
  if (role !== "creator" && role !== "owner") {
    throw { status: 403, message: "Only project owners can export" };
  }

  const db = getDb();

  const databaseBlocks = await db
    .selectFrom("blocks")
    .select([
      "id",
      "blockType",
      "metadata",
      "parentBlockId",
      "positionX",
      "positionY",
      "width",
      "height",
      "content",
      "data",
      "createdAt",
      "updatedAt",
    ])
    .where("projectId", "=", project.id)
    .execute();

  const databaseLinks = await db
    .selectFrom("links")
    .select([
      "id",
      "source",
      "target",
      "sourceHandle",
      "targetHandle",
      "animated",
      "type",
      "label",
      "data",
      "createdAt",
      "updatedAt",
    ])
    .where("projectId", "=", project.id)
    .execute();

  const projectYjsDoc = await getProjectYjsDoc(project.id);
  let canvasStates: CanvasStateSnapshot[] | null = null;
  try {
    if (projectYjsDoc) {
      const snapshots = captureCanvasStateSnapshots(projectYjsDoc.doc);
      const rootCanvas = snapshots.find(
        (snapshot) => snapshot.canvasId === "root",
      );
      if (rootCanvas && rootCanvas.blocks.length > 0) {
        canvasStates = snapshots;
      }
    }
  } finally {
    if (projectYjsDoc && !projectYjsDoc.isLive) {
      projectYjsDoc.doc.destroy();
    }
  }

  const existingBlocks = new Map(
    databaseBlocks.map((block) => [block.id, block]),
  );
  const existingLinks = new Map(databaseLinks.map((link) => [link.id, link]));
  const rootCanvas = canvasStates?.find(
    (snapshot) => snapshot.canvasId === "root",
  );
  const blocks = rootCanvas
    ? rootCanvas.blocks.map((block) =>
        serializeBlock(
          block,
          existingBlocks.get(block.id),
          new Date().toISOString(),
        ),
      )
    : databaseBlocks;
  const links = rootCanvas
    ? rootCanvas.links.map((link) =>
        serializeLink(
          link,
          existingLinks.get(link.id),
          new Date().toISOString(),
        ),
      )
    : databaseLinks;

  const manifest = {
    version: canvasStates ? "2" : "1",
    format: "ideon-project",
    exportedAt: new Date().toISOString(),
    blockCount: blocks.length,
    linkCount: links.length,
    ...(canvasStates && { canvasCount: canvasStates.length }),
  };

  const projectMeta = {
    name: project.name,
    description: project.description,
  };

  const files: Record<string, Uint8Array> = {
    "manifest.json": Buffer.from(JSON.stringify(manifest, null, 2)),
    "project.json": Buffer.from(JSON.stringify(projectMeta, null, 2)),
    "blocks.json": Buffer.from(JSON.stringify(blocks, null, 2)),
    "links.json": Buffer.from(JSON.stringify(links, null, 2)),
    ...(canvasStates && {
      "canvas-states.json": Buffer.from(JSON.stringify(canvasStates)),
    }),
  };

  const uploadsDir = join(
    process.cwd(),
    "storage",
    "uploads",
    `project-${project.id}`,
  );

  if (existsSync(uploadsDir)) {
    const fileNames = await readdir(uploadsDir);
    for (const fileName of fileNames) {
      const filePath = join(uploadsDir, fileName);
      const content = await readFile(filePath);
      files[`assets/${fileName}`] = content;
    }
  }

  const safeName = project.name.replace(/[^a-zA-Z0-9_\- ]/g, "_");
  const zip = Buffer.from(zipSync(files));

  return new NextResponse(zip, {
    headers: {
      "Content-Disposition": `attachment; filename="${safeName}.ideon"`,
      "Content-Type": "application/zip",
    },
  });
});
