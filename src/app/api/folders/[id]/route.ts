import { getDb } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { z } from "zod";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";

async function getFolderSubtreeIds(
  db: ReturnType<typeof getDb>,
  rootId: string,
) {
  const subtreeIds = [rootId];
  let frontier = [rootId];

  while (frontier.length > 0) {
    const children = await db
      .selectFrom("folders")
      .select("id")
      .where("parentFolderId", "in", frontier)
      .execute();

    const childIds = children.map((folder) => folder.id);
    if (childIds.length === 0) {
      break;
    }

    subtreeIds.push(...childIds);
    frontier = childIds;
  }

  return subtreeIds;
}

async function ensureValidParentFolder(
  db: ReturnType<typeof getDb>,
  folderId: string,
  parentFolderId: string | null,
  userId: string,
) {
  if (!parentFolderId) {
    return;
  }

  if (parentFolderId === folderId) {
    throw { status: 400, message: "A folder cannot be moved into itself" };
  }

  const targetFolder = await db
    .selectFrom("folders")
    .select(["id", "ownerId", "parentFolderId", "deletedAt"])
    .where("id", "=", parentFolderId)
    .executeTakeFirst();

  if (!targetFolder || targetFolder.deletedAt) {
    throw { status: 404, message: "Target folder not found" };
  }

  if (targetFolder.ownerId !== userId) {
    throw {
      status: 403,
      message: "Forbidden: Only the folder owner can reorganize this tree",
    };
  }

  let cursor: string | null = targetFolder.parentFolderId;
  while (cursor) {
    if (cursor === folderId) {
      throw {
        status: 400,
        message: "A folder cannot be moved into one of its descendants",
      };
    }

    const ancestor = await db
      .selectFrom("folders")
      .select("parentFolderId")
      .where("id", "=", cursor)
      .executeTakeFirst();

    cursor = ancestor?.parentFolderId || null;
  }
}

const updateFolderSchema = z.object({
  name: z.string().min(1).optional(),
  isStarred: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
  parentFolderId: z.string().uuid().nullable().optional(),
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

    const { name, isStarred, deletedAt, parentFolderId } = body;

    if (parentFolderId !== undefined) {
      await ensureValidParentFolder(db, id, parentFolderId, user.id);
    }

    if (deletedAt === null) {
      const subtreeIds = await getFolderSubtreeIds(db, id);

      await db
        .updateTable("folders")
        .set({ deletedAt: null, updatedAt: new Date().toISOString() })
        .where("id", "in", subtreeIds)
        .execute();

      await db
        .updateTable("projects")
        .set({ deletedAt: null, updatedAt: new Date().toISOString() })
        .where("folderId", "in", subtreeIds)
        .execute();

      return { success: true };
    }

    await db
      .updateTable("folders")
      .set({
        name,
        isStarred: isStarred !== undefined ? (isStarred ? 1 : 0) : undefined,
        deletedAt,
        parentFolderId,
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
      .select(["ownerId", "parentFolderId"])
      .where("id", "=", id)
      .executeTakeFirst();

    if (!folder) throw { status: 404, message: "Folder not found" };
    if (folder.ownerId !== user.id) throw { status: 403, message: "Forbidden" };

    if (permanent) {
      const nextParentFolderId = folder.parentFolderId || null;

      await db
        .updateTable("folders")
        .set({ parentFolderId: nextParentFolderId })
        .where("parentFolderId", "=", id)
        .execute();

      await db
        .updateTable("projects")
        .set({ folderId: nextParentFolderId })
        .where("folderId", "=", id)
        .execute();

      await db.deleteFrom("folders").where("id", "=", id).execute();
      await db
        .deleteFrom("folderCollaborators")
        .where("folderId", "=", id)
        .execute();
    } else {
      const subtreeIds = await getFolderSubtreeIds(db, id);
      const deletedAt = new Date().toISOString();

      await db
        .updateTable("folders")
        .set({ deletedAt, updatedAt: deletedAt })
        .where("id", "in", subtreeIds)
        .execute();

      await db
        .updateTable("projects")
        .set({ deletedAt, updatedAt: deletedAt })
        .where("folderId", "in", subtreeIds)
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
