import { Node, Edge } from "@xyflow/react";
import { getDb, runTransaction } from "@lib/db";
import { projectAction } from "@lib/server-utils";
import {
  transformBlock,
  transformLink,
  prepareBlockForDb,
  prepareLinkForDb,
  DbBlock,
} from "@lib/graph";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = projectAction(async (_req, { project, user }) => {
  const db = getDb();

  const blocks = await db
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
    .where("blocks.projectId", "=", project.id)
    .execute();

  // SELF-REPAIR: If no blocks found, assume corruption or failed creation and restore Core Block
  if (blocks.length === 0) {
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
      authorName: user.username || "System", // Fallback
      authorColor: user.color || null,
    });
  }

  const links = await db
    .selectFrom("links")
    .selectAll()
    .where("projectId", "=", project.id)
    .execute();

  return {
    blocks: blocks.map((b) => transformBlock(b as unknown as DbBlock)),
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
