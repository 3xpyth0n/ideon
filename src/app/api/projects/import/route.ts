import { authenticatedAction } from "@lib/server-utils";
import { getDb, runTransaction } from "@lib/db";
import { sanitizeFileName } from "@lib/file-utils";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { unzipSync, strFromU8 } from "fflate";
import type { NewBlock, NewLink } from "@lib/types/db";
import {
  parseCanvasStateSnapshots,
  remapCanvasStateSnapshots,
  restoreCanvasStateSnapshots,
  type CanvasStateSnapshot,
} from "../../../../lib/yjs-canvas-state";
import { getProjectYjsDoc } from "../../../../lib/projectYjsDoc";

function remapMetadataBlockIds(
  blockType: string,
  metadata: string,
  idMap: Map<string, string>,
): string {
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (!parsed || typeof parsed !== "object") return metadata;

    if (blockType === "frame") {
      const meta = parsed as { color?: string; childBlockIds?: string[] };
      if (Array.isArray(meta.childBlockIds)) {
        meta.childBlockIds = meta.childBlockIds.map(
          (id) => idMap.get(id) ?? id,
        );
        return JSON.stringify(meta);
      }
    }

    if (blockType === "kanban") {
      const meta = parsed as {
        columns?: Array<{
          tasks?: Array<{
            linkedTasks?: Array<{ blockId: string; [k: string]: unknown }>;
            [k: string]: unknown;
          }>;
          [k: string]: unknown;
        }>;
        [k: string]: unknown;
      };
      if (Array.isArray(meta.columns)) {
        for (const col of meta.columns) {
          if (Array.isArray(col.tasks)) {
            for (const task of col.tasks) {
              if (Array.isArray(task.linkedTasks)) {
                for (const ref of task.linkedTasks) {
                  ref.blockId = idMap.get(ref.blockId) ?? ref.blockId;
                }
              }
            }
          }
        }
        return JSON.stringify(meta);
      }
    }
  } catch {
    // Return original on parse failure
  }
  return metadata;
}

interface ExportedBlock {
  id: string;
  blockType: string;
  metadata: string;
  parentBlockId: string | null;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  content: string | null;
  data: string;
  createdAt: string;
  updatedAt: string;
}

interface ExportedLink {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  animated: number | null;
  type: string | null;
  label: string | null;
  data: string | null;
  createdAt: string;
  updatedAt: string;
}

function remapMetadataValue(
  blockType: string,
  metadata: unknown,
  idMap: Map<string, string>,
): unknown {
  const serialized =
    typeof metadata === "string" ? metadata : JSON.stringify(metadata ?? {});
  const remapped = remapMetadataBlockIds(blockType, serialized, idMap);
  try {
    return JSON.parse(remapped) as unknown;
  } catch {
    return metadata;
  }
}

function remapBlockData(
  blockType: string,
  data: string,
  idMap: Map<string, string>,
  ownerId: string,
): string {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return data;
    }
    const remapped = { ...(parsed as Record<string, unknown>), ownerId };
    if ("metadata" in remapped) {
      remapped.metadata = remapMetadataValue(
        blockType,
        remapped.metadata,
        idMap,
      );
    }
    return JSON.stringify(remapped);
  } catch {
    return data;
  }
}

export const POST = authenticatedAction(
  async (req, { user }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw { status: 400, message: "No file provided" };
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let archive: ReturnType<typeof unzipSync>;
    try {
      archive = unzipSync(new Uint8Array(buffer));
    } catch {
      throw { status: 400, message: "Invalid archive format" };
    }

    const manifestEntry = archive["manifest.json"];
    if (!manifestEntry) {
      throw { status: 400, message: "Invalid import format" };
    }

    let manifest: { format: string; version: string };
    try {
      manifest = JSON.parse(strFromU8(manifestEntry));
    } catch {
      throw { status: 400, message: "Failed to parse manifest" };
    }

    if (
      manifest.format !== "ideon-project" ||
      !["1", "2"].includes(manifest.version)
    ) {
      throw { status: 400, message: "Unsupported export format or version" };
    }

    const projectEntry = archive["project.json"];
    const blocksEntry = archive["blocks.json"];
    const linksEntry = archive["links.json"];

    if (!projectEntry || !blocksEntry || !linksEntry) {
      throw { status: 400, message: "Incomplete import archive" };
    }

    let projectMeta: { name: string; description: string | null };
    let exportedBlocks: ExportedBlock[];
    let exportedLinks: ExportedLink[];
    let canvasStates: CanvasStateSnapshot[] = [];

    try {
      projectMeta = JSON.parse(strFromU8(projectEntry));
      exportedBlocks = JSON.parse(strFromU8(blocksEntry));
      exportedLinks = JSON.parse(strFromU8(linksEntry));
      if (manifest.version === "2") {
        const canvasStatesEntry = archive["canvas-states.json"];
        if (!canvasStatesEntry) {
          throw new Error("Canvas state file is missing");
        }
        canvasStates = parseCanvasStateSnapshots(
          JSON.parse(strFromU8(canvasStatesEntry)),
        );
      }
    } catch {
      throw { status: 400, message: "Failed to parse import file" };
    }

    const newProjectId = uuidv4();
    const now = new Date().toISOString();

    // Build old-to-new block ID map
    const idMap = new Map<string, string>();
    for (const block of exportedBlocks) {
      idMap.set(block.id, uuidv4());
    }
    for (const canvas of canvasStates) {
      for (const block of canvas.blocks) {
        if (!idMap.has(block.id)) idMap.set(block.id, uuidv4());
      }
    }

    const linkIdMap = new Map<string, string>();
    for (const link of exportedLinks) linkIdMap.set(link.id, uuidv4());
    for (const canvas of canvasStates) {
      for (const link of canvas.links) {
        if (!linkIdMap.has(link.id)) linkIdMap.set(link.id, uuidv4());
      }
    }

    const importedCanvasStates = remapCanvasStateSnapshots(
      canvasStates,
      idMap,
      linkIdMap,
      (block) => {
        const data: Record<string, unknown> = {
          ...(block.data ?? {}),
          ownerId: user.id,
        };
        const blockType =
          typeof data.blockType === "string"
            ? data.blockType
            : block.type ?? "text";
        if ("metadata" in data) {
          data.metadata = remapMetadataValue(blockType, data.metadata, idMap);
        }
        return { ...block, data };
      },
    );
    const projectYjsDoc =
      importedCanvasStates.length > 0
        ? await getProjectYjsDoc(newProjectId)
        : null;
    if (importedCanvasStates.length > 0 && !projectYjsDoc) {
      throw {
        status: 503,
        message: "Yjs persistence is unavailable for this import",
      };
    }
    if (projectYjsDoc) {
      restoreCanvasStateSnapshots(projectYjsDoc.doc, importedCanvasStates);
    }

    const blocks: NewBlock[] = exportedBlocks.map((block) => ({
      id: idMap.get(block.id)!,
      projectId: newProjectId,
      blockType: block.blockType as NewBlock["blockType"],
      metadata: remapMetadataBlockIds(block.blockType, block.metadata, idMap),
      parentBlockId: block.parentBlockId
        ? idMap.get(block.parentBlockId) ?? null
        : null,
      positionX: block.positionX,
      positionY: block.positionY,
      width: block.width ?? null,
      height: block.height ?? null,
      ownerId: user.id,
      content: block.content ?? null,
      data: remapBlockData(block.blockType, block.data, idMap, user.id),
      selected: 0,
      createdAt: now,
      updatedAt: now,
    }));

    const links: NewLink[] = exportedLinks.map((link) => ({
      id: linkIdMap.get(link.id)!,
      projectId: newProjectId,
      source: idMap.get(link.source) ?? link.source,
      target: idMap.get(link.target) ?? link.target,
      sourceHandle: link.sourceHandle ?? null,
      targetHandle: link.targetHandle ?? null,
      animated: link.animated ?? 0,
      type: link.type ?? null,
      label: link.label ?? null,
      data: link.data ?? null,
      createdAt: now,
      updatedAt: now,
    }));

    const db = getDb();

    await runTransaction(db, async (trx) => {
      await trx
        .insertInto("projects")
        .values({
          id: newProjectId,
          name: projectMeta.name,
          description: projectMeta.description ?? null,
          ownerId: user.id,
          folderId: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      if (blocks.length > 0) {
        await trx.insertInto("blocks").values(blocks).execute();
      }

      if (links.length > 0) {
        await trx.insertInto("links").values(links).execute();
      }
    });

    if (projectYjsDoc) {
      await projectYjsDoc.persist();
      if (!projectYjsDoc.isLive) projectYjsDoc.doc.destroy();
    }

    // Write bundled assets if present
    const assetEntries = Object.entries(archive).filter(([path]) =>
      path.startsWith("assets/"),
    );

    if (assetEntries.length > 0) {
      const uploadsDir = join(
        process.cwd(),
        "storage",
        "uploads",
        `project-${newProjectId}`,
      );
      await mkdir(uploadsDir, { recursive: true });

      for (const [assetPath, content] of assetEntries) {
        const rawName = assetPath.replace(/^assets\//, "");
        const safeName = sanitizeFileName(rawName);
        if (safeName) {
          await writeFile(join(uploadsDir, safeName), content);
        }
      }
    }

    return { projectId: newProjectId, name: projectMeta.name };
  },
  { requireUser: true },
);
