import { authenticatedAction } from "@lib/server-utils";
import { getDb, runTransaction } from "@lib/db";
import { sanitizeFileName } from "@lib/file-utils";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { unzipSync, strFromU8 } from "fflate";
import type { NewBlock, NewLink } from "@lib/types/db";

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

    if (manifest.format !== "ideon-project" || manifest.version !== "1") {
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

    try {
      projectMeta = JSON.parse(strFromU8(projectEntry));
      exportedBlocks = JSON.parse(strFromU8(blocksEntry));
      exportedLinks = JSON.parse(strFromU8(linksEntry));
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

    const blocks: NewBlock[] = exportedBlocks.map((block) => ({
      id: idMap.get(block.id)!,
      projectId: newProjectId,
      blockType: block.blockType as NewBlock["blockType"],
      metadata: remapMetadataBlockIds(block.blockType, block.metadata, idMap),
      parentBlockId: block.parentBlockId
        ? (idMap.get(block.parentBlockId) ?? null)
        : null,
      positionX: block.positionX,
      positionY: block.positionY,
      width: block.width ?? null,
      height: block.height ?? null,
      ownerId: user.id,
      content: block.content ?? null,
      data: block.data,
      selected: 0,
      createdAt: now,
      updatedAt: now,
    }));

    const links: NewLink[] = exportedLinks.map((link) => ({
      id: uuidv4(),
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
