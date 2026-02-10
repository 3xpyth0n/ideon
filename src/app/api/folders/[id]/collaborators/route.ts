import { getDb } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { z } from "zod";
import { sql } from "kysely";

const addCollaboratorSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "editor", "viewer"]).default("editor"),
});

export const GET = authenticatedAction(
  async (req, { user, params }) => {
    if (!user) throw new Error("Unauthorized");
    const { id } = z.object({ id: z.string().uuid() }).parse(params);
    const db = getDb();

    // Check access to folder
    const folder = await db
      .selectFrom("folders")
      .select("ownerId")
      .where("id", "=", id)
      .executeTakeFirst();

    if (!folder) throw { status: 404, message: "Folder not found" };

    // Allow if owner OR collaborator
    const isOwner = folder.ownerId === user.id;
    const isCollaborator = await db
      .selectFrom("folderCollaborators")
      .select("role")
      .where("folderId", "=", id)
      .where("userId", "=", user.id)
      .executeTakeFirst();

    if (!isOwner && !isCollaborator)
      throw { status: 403, message: "Forbidden" };

    // Fetch Owner details
    const owner = await db
      .selectFrom("users")
      .select([
        "id",
        "username",
        "email",
        "avatarUrl",
        sql<string>`'owner'`.as("role"),
        sql<string>`null`.as("createdAt"),
      ])
      .where("id", "=", folder.ownerId)
      .executeTakeFirst();

    const collaborators = await db
      .selectFrom("folderCollaborators")
      .innerJoin("users", "users.id", "folderCollaborators.userId")
      .select([
        "users.id",
        "users.username",
        "users.email",
        "users.avatarUrl",
        "folderCollaborators.role",
        "folderCollaborators.createdAt",
      ])
      .where("folderId", "=", id)
      .execute();

    return owner ? [owner, ...collaborators] : collaborators;
  },
  { requireUser: true },
);

export const POST = authenticatedAction(
  async (req, { user, params, body }) => {
    if (!user) throw new Error("Unauthorized");
    const { id } = z.object({ id: z.string().uuid() }).parse(params);
    const { userId, role } = body as z.infer<typeof addCollaboratorSchema>;
    const db = getDb();

    // Only owner can add collaborators
    const folder = await db
      .selectFrom("folders")
      .select("ownerId")
      .where("id", "=", id)
      .executeTakeFirst();

    if (!folder) throw { status: 404, message: "Folder not found" };
    if (folder.ownerId !== user.id) throw { status: 403, message: "Forbidden" };

    await db
      .insertInto("folderCollaborators")
      .values({
        folderId: id,
        userId,
        role,
        createdAt: new Date().toISOString(),
      })
      .onConflict((oc) =>
        oc.columns(["folderId", "userId"]).doUpdateSet({ role }),
      )
      .execute();

    return { success: true };
  },
  { schema: addCollaboratorSchema, requireUser: true },
);

export const DELETE = authenticatedAction(
  async (req, { user, params }) => {
    if (!user) throw new Error("Unauthorized");
    const { id } = z.object({ id: z.string().uuid() }).parse(params);
    const url = new URL(req.url);
    const targetUserId = url.searchParams.get("userId");

    if (!targetUserId) throw { status: 400, message: "UserId required" };

    const db = getDb();

    const folder = await db
      .selectFrom("folders")
      .select("ownerId")
      .where("id", "=", id)
      .executeTakeFirst();

    if (!folder) throw { status: 404, message: "Folder not found" };

    // Allow owner to remove anyone, or user to remove themselves (leave)
    if (folder.ownerId !== user.id && user.id !== targetUserId) {
      throw { status: 403, message: "Forbidden" };
    }

    await db
      .deleteFrom("folderCollaborators")
      .where("folderId", "=", id)
      .where("userId", "=", targetUserId)
      .execute();

    return { success: true };
  },
  { requireUser: true },
);
