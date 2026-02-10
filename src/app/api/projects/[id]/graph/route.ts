import { Node, Edge } from "@xyflow/react";
import { getDb, runTransaction } from "@lib/db";
import { projectAction } from "@lib/server-utils";
import { logger } from "@lib/logger";
import {
  transformBlock,
  transformLink,
  prepareBlockForDb,
  prepareLinkForDb,
  DbBlock,
} from "@lib/graph";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = projectAction(async (req, { project, user }) => {
  const startTime = Date.now();
  const db = getDb();
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "full";
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);
  const viewport = {
    x1: parseFloat(url.searchParams.get("x1") || "-Infinity"),
    y1: parseFloat(url.searchParams.get("y1") || "-Infinity"),
    x2: parseFloat(url.searchParams.get("x2") || "Infinity"),
    y2: parseFloat(url.searchParams.get("y2") || "Infinity"),
  };

  logger.info(
    {
      mode,
      offset,
      limit,
      viewport: mode === "viewport" ? viewport : "N/A",
    },
    `[GraphAPI] Fetching graph for project ${project.id}`,
  );

  // SUMMARY MODE: Return lightweight block structure (positions only)
  if (mode === "summary") {
    const blocks = await db
      .selectFrom("blocks")
      .select([
        "id",
        "blockType",
        "positionX",
        "positionY",
        "width",
        "height",
        "selected",
      ])
      .where("projectId", "=", project.id)
      .execute();

    if (blocks.length === 0) {
      // Fall through to full logic if empty, to trigger repair
    } else {
      // Return minimal nodes for React Flow
      const summaryNodes = blocks.map((b) => ({
        id: b.id,
        type: b.blockType,
        position: { x: b.positionX, y: b.positionY },
        data: {
          // Minimal data to prevent crashes
          blockType: b.blockType,
          isLocked: false,
          isSummary: true, // Flag for frontend to know it needs details
        },
        width: b.width,
        height: b.height,
        selected: Boolean(b.selected),
      }));

      // We also need links in summary mode to show connections
      const links = await db
        .selectFrom("links")
        .selectAll()
        .where("projectId", "=", project.id)
        .execute();

      return {
        blocks: summaryNodes,
        links: links.map((l) => transformLink(l)),
        projectOwnerId: project.ownerId,
        currentStateId: project.currentStateId,
      };
    }
  }

  // FULL or VIEWPORT MODE
  let query = db
    .selectFrom("blocks")
    .leftJoin("users", "users.id", "blocks.ownerId")
    .select([
      "blocks.id",
      "blocks.blockType",
      "blocks.positionX",
      "blocks.positionY",
      "blocks.width",
      "blocks.height",
      "blocks.selected",
      "blocks.content",
      "blocks.data",
      "blocks.metadata",
      "blocks.ownerId",
      "blocks.updatedAt",
      "users.username as authorName",
      "users.color as authorColor",
    ])
    .where("blocks.projectId", "=", project.id);

  // Apply viewport filtering if provided
  if (
    mode === "viewport" &&
    isFinite(viewport.x1) &&
    isFinite(viewport.y1) &&
    isFinite(viewport.x2) &&
    isFinite(viewport.y2)
  ) {
    query = query
      .where("blocks.positionX", "<", viewport.x2)
      .where("blocks.positionY", "<", viewport.y2)
      .where((eb) =>
        eb.and([
          eb("blocks.positionX", ">", viewport.x1 - 1000),
          eb("blocks.positionX", "<", viewport.x2),
          eb("blocks.positionY", ">", viewport.y1 - 1000),
          eb("blocks.positionY", "<", viewport.y2),
        ]),
      );
  } else {
    const ids = url.searchParams.get("ids");
    if (ids) {
      const idList = ids.split(",");
      query = query.where("blocks.id", "in", idList);
    } else {
      query = query.limit(limit).offset(offset);
    }
  }

  const blocks = (await query.execute()) as unknown as DbBlock[];

  if (
    blocks.length === 0 &&
    mode === "full" &&
    offset === 0 &&
    !url.searchParams.get("ids")
  ) {
    const now = new Date();
    const nowString = now.toISOString();
    const coreBlockId = crypto.randomUUID();

    // Insert default Core Block
    await db
      .insertInto("blocks")
      .values({
        id: coreBlockId,
        projectId: project.id,
        blockType: "core",
        positionX: 0,
        positionY: 0,
        width: 640,
        height: 480,
        ownerId: project.ownerId,
        content: project.name,
        metadata: JSON.stringify({
          description: project.description || "",
        }),
        data: JSON.stringify({ blockType: "core", isLocked: false }),
        createdAt: nowString,
        updatedAt: nowString,
        selected: 0,
      })
      .execute();

    // Return the restored block immediately without re-fetching
    blocks.push({
      id: coreBlockId,
      blockType: "core",
      positionX: 0,
      positionY: 0,
      width: 640,
      height: 480,
      selected: 0,
      content: project.name,
      data: JSON.stringify({ blockType: "core", isLocked: false }),
      metadata: JSON.stringify({
        description: project.description || "",
      }),
      ownerId: project.ownerId,
      updatedAt: now,
      createdAt: now,
      authorName: user.username || "System", // Fallback
      authorColor: user.color || null,
    } as DbBlock);
  }

  // Fetch links only on initial load
  let links: Record<string, unknown>[] = [];
  if (offset === 0 && !url.searchParams.get("ids")) {
    links = await db
      .selectFrom("links")
      .selectAll()
      .where("projectId", "=", project.id)
      .execute();
  }

  logger.info(
    {
      blockCount: blocks.length,
      linkCount: links.length,
    },
    `[GraphAPI] Request completed in ${Date.now() - startTime}ms`,
  );

  return {
    blocks: blocks.map((b) => transformBlock(b)),
    links: links.map((l) => transformLink(l)),
    projectOwnerId: project.ownerId,
    currentStateId: project.currentStateId,
  };
});

const postSchema = z.object({
  blocks: z.array(z.any()).optional(),
  links: z.array(z.any()).optional(),
  force: z.boolean().optional(),
});

export const POST = projectAction(
  async (_req, { project, user, body }) => {
    const { blocks, links, force } = body;
    const db = getDb();

    await runTransaction(db, async (trx) => {
      if (!force && !blocks?.length && !links?.length) return;

      await trx
        .deleteFrom("blocks")
        .where("projectId", "=", project.id)
        .execute();
      await trx
        .deleteFrom("links")
        .where("projectId", "=", project.id)
        .execute();

      if (blocks?.length) {
        const blocksToInsert = blocks.map((n: Node) =>
          prepareBlockForDb(n, project.id, user.id || project.ownerId),
        );

        for (let i = 0; i < blocksToInsert.length; i += 1000) {
          await trx
            .insertInto("blocks")
            .values(blocksToInsert.slice(i, i + 1000))
            .execute();
        }
      }

      if (links?.length) {
        const linksToInsert = links.map((l: Edge) =>
          prepareLinkForDb(l, project.id),
        );

        for (let i = 0; i < linksToInsert.length; i += 1000) {
          await trx
            .insertInto("links")
            .values(linksToInsert.slice(i, i + 1000))
            .execute();
        }
      }

      await trx
        .updateTable("projects")
        .set({ updatedAt: new Date().toISOString() })
        .where("id", "=", project.id)
        .execute();
    });

    return { success: true };
  },
  { schema: postSchema },
);
