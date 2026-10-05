import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Edge, Node } from "@xyflow/react";
import { getDb } from "@lib/db";
import type { Block, Link, Project } from "@lib/types/db";
import {
  captureCanvasStateSnapshots,
  type CanvasStateSnapshot,
} from "../yjs-canvas-state";
import { getProjectYjsDoc } from "../projectYjsDoc";
import { serializeRepositorySyncProject } from "./serialize";

function parseRecord(
  value: string | null | undefined,
): Record<string, unknown> {
  if (!value) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid project data JSON");
  }
  return parsed as Record<string, unknown>;
}

function parseIdMap(value: string | null | undefined): Record<string, string> {
  const parsed = parseRecord(value);
  const entries = Object.entries(parsed);
  if (entries.some(([, id]) => typeof id !== "string")) {
    throw new Error("Invalid repository identity map");
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function createDatabaseSnapshot(
  blocks: readonly Block[],
  links: readonly Link[],
): CanvasStateSnapshot {
  const nodes: Node<Record<string, unknown>>[] = blocks.map((block) => ({
    id: block.id,
    type: block.blockType,
    position: { x: block.positionX, y: block.positionY },
    width: block.width ?? undefined,
    height: block.height ?? undefined,
    selected: Boolean(block.selected),
    data: {
      ...parseRecord(block.data),
      blockType: block.blockType,
      content: block.content ?? "",
    },
  }));
  const edges: Edge[] = links.map((link) => ({
    id: link.id,
    source: link.source,
    target: link.target,
    sourceHandle: link.sourceHandle ?? undefined,
    targetHandle: link.targetHandle ?? undefined,
    type: link.type ?? undefined,
    animated: Boolean(link.animated),
    data: parseRecord(link.data),
  }));

  return {
    canvasId: "root",
    blocks: nodes,
    links: edges,
    contents: Object.fromEntries(
      blocks.map((block) => [block.id, block.content ?? ""]),
    ),
    noteDocuments: {},
  };
}

export async function createProjectRepositoryBundle(
  project: Pick<Project, "id" | "name" | "description">,
  remoteProjectId?: string,
) {
  const db = getDb();
  const [blocks, links, syncState] = await Promise.all([
    db
      .selectFrom("blocks")
      .selectAll()
      .where("projectId", "=", project.id)
      .execute(),
    db
      .selectFrom("links")
      .selectAll()
      .where("projectId", "=", project.id)
      .execute(),
    db
      .selectFrom("projectRepositorySyncs")
      .select(["remoteProjectId", "blockIdMap", "linkIdMap"])
      .where("projectId", "=", project.id)
      .executeTakeFirst(),
  ]);

  const projectYjsDoc = await getProjectYjsDoc(project.id);
  let snapshots: CanvasStateSnapshot[] = [];
  try {
    if (projectYjsDoc) {
      snapshots = captureCanvasStateSnapshots(projectYjsDoc.doc);
    }
  } finally {
    if (projectYjsDoc && !projectYjsDoc.isLive) {
      projectYjsDoc.doc.destroy();
    }
  }

  if (
    !snapshots.some(
      (snapshot) => snapshot.canvasId === "root" && snapshot.blocks.length > 0,
    )
  ) {
    snapshots = [createDatabaseSnapshot(blocks, links)];
  }

  const assets: Record<string, Uint8Array> = {};
  const uploadsDir = join(
    process.cwd(),
    "storage",
    "uploads",
    `project-${project.id}`,
  );
  if (existsSync(uploadsDir)) {
    const entries = await readdir(uploadsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new Error("Project assets cannot include symbolic links");
      }
      if (!entry.isFile()) continue;
      assets[entry.name] = await readFile(join(uploadsDir, entry.name));
    }
  }

  return serializeRepositorySyncProject({
    project: {
      id: remoteProjectId ?? syncState?.remoteProjectId ?? project.id,
      name: project.name,
      description: project.description,
    },
    blocks,
    links,
    snapshots,
    blockIdMap: parseIdMap(syncState?.blockIdMap),
    linkIdMap: parseIdMap(syncState?.linkIdMap),
    assets,
  });
}
