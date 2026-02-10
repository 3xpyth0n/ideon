import { getDb } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { z } from "zod";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";

const updateFolderSchema = z.object({
  name: z.string().min(1).optional(),
  isStarred: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
});

export const GET = authenticatedAction(
  async (req, { user, params }) => {
    if (!user) throw new Error("Unauthorized");

    // params is a plain object here thanks to authenticatedAction
    const id = params.id;
    if (!id) throw { status: 400, message: "Missing folder ID" };

    const db = getDb();

    // Simple regex check for UUID to be safe
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      throw { status: 400, message: "Invalid folder ID" };
    }

    // Fetch folder with read permissions
    const folder = await db
      .selectFrom("folders")
      .selectAll()
      .where("id", "=", id)
      .where((eb) =>
        eb.or([
          eb("ownerId", "=", user.id),
          eb.exists(
            eb
              .selectFrom("folderCollaborators")
              .selectAll()
              .where("folderCollaborators.folderId", "=", id)
              .where("folderCollaborators.userId", "=", user.id),
          ),
        ]),
      )
      .executeTakeFirst();

    if (!folder) throw { status: 404, message: "Folder not found" };

    return folder;
  },
  { requireUser: true },
);

export const PATCH = authenticatedAction(
  async (req, { user, params, body }) => {
    if (!user) throw new Error("Unauthorized");
    const { id } = z.object({ id: z.string().uuid() }).parse(params);
    const db = getDb();

    // Verify ownership (only owner can rename for now)
    const folder = await db
      .selectFrom("folders")
      .select("ownerId")
      .where("id", "=", id)
      .executeTakeFirst();

    if (!folder) throw { status: 404, message: "Folder not found" };
    if (folder.ownerId !== user.id) throw { status: 403, message: "Forbidden" };

    const { name, isStarred, deletedAt } = body;

    await db
      .updateTable("folders")
      .set({
        name,
        isStarred: isStarred !== undefined ? (isStarred ? 1 : 0) : undefined,
        deletedAt,
        updatedAt: new Date().toISOString(),
      })
      .where("id", "=", id)
      .execute();

    return { success: true };
  },
  { schema: updateFolderSchema, requireUser: true },
);

export const DELETE = authenticatedAction(
  async (req, { user, params }) => {
    if (!user) throw new Error("Unauthorized");
    const { id } = z.object({ id: z.string().uuid() }).parse(params);
    const db = getDb();
    const url = new URL(req.url);
    const permanent = url.searchParams.get("permanent") === "true";

    // Verify ownership
    const folder = await db
      .selectFrom("folders")
      .select("ownerId")
      .where("id", "=", id)
      .executeTakeFirst();

    if (!folder) throw { status: 404, message: "Folder not found" };
    if (folder.ownerId !== user.id) throw { status: 403, message: "Forbidden" };

    if (permanent) {
      // Move projects to root (folderId = null) before deleting
      await db
        .updateTable("projects")
        .set({ folderId: null })
        .where("folderId", "=", id)
        .execute();

      await db.deleteFrom("folders").where("id", "=", id).execute();
      await db
        .deleteFrom("folderCollaborators")
        .where("folderId", "=", id)
        .execute();
    } else {
      // Soft delete
      await db
        .updateTable("folders")
        .set({ deletedAt: new Date().toISOString() })
        .where("id", "=", id)
        .execute();
    }

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    await logSecurityEvent("folderDelete", "success", {
      userId: user.id,
      ip,
    });

    return { success: true };
  },
  { requireUser: true },
);
