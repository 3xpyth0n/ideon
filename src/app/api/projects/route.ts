import { getDb, runTransaction } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";

import { z } from "zod";
import { Insertable } from "kysely";
import { blocksTable } from "@lib/types/db";

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  folderId: z.string().uuid().optional(),
});

import { getProjectsQuery } from "@lib/queries";

export const GET = authenticatedAction(
  async (req, { user }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();
    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "all";
    const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
    const folderId = url.searchParams.get("folderId");

    const query = getProjectsQuery(db, user.id, view, folderId, ids);
    const projects = await query.execute();
    return projects;
  },
  { requireUser: true },
);

export const POST = authenticatedAction(
  async (_req, { user, body }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();

    const { name, description, folderId } = body;

    if (folderId) {
      const folder = await db
        .selectFrom("folders")
        .select("ownerId")
        .where("id", "=", folderId)
        .executeTakeFirst();

      if (!folder) throw new Error("Folder not found");

      const hasAccess =
        folder.ownerId === user.id ||
        (await db
          .selectFrom("folderCollaborators")
          .selectAll()
          .where("folderId", "=", folderId)
          .where("userId", "=", user.id)
          .executeTakeFirst());

      if (!hasAccess) throw new Error("Forbidden: No access to folder");
    }

    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();

    await runTransaction(db, async (trx) => {
      await trx
        .insertInto("projects")
        .values({
          id: projectId,
          name,
          description: description || null,
          ownerId: user.id,
          folderId: folderId || null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      const blockId = crypto.randomUUID();
      await trx
        .insertInto("blocks")
        .values({
          id: blockId,
          projectId,
          blockType: "core",
          positionX: 0,
          positionY: 0,
          width: 640,
          height: 480,
          ownerId: user.id,
          content: name,
          metadata: JSON.stringify({
            description: description || "",
          }),
          data: JSON.stringify({
            blockType: "core",
            isLocked: false,
          }),
          createdAt: now,
          updatedAt: now,
          selected: 0,
        } as Insertable<blocksTable>)
        .execute();
    });

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    await logSecurityEvent("projectCreate", "success", {
      userId: user.id,
      ip,
    });

    return {
      id: projectId,
      name,
      description,
      folderId: folderId || null,
      collaboratorCount: 1,
      ownerId: user.id,
      updatedAt: now,
    };
  },
  { schema: createProjectSchema, requireUser: true },
);
