import { getDb, runTransaction } from "@lib/db";
import { projectAction } from "@lib/server-utils";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";

export const GET = projectAction(async (_req, { project }) => {
  return { project };
});

export const PATCH = projectAction(async (_req, { project, user, body }) => {
  const { name, description, isStarred, deletedAt, folderId } = body as {
    name?: string;
    description?: string;
    isStarred?: boolean;
    deletedAt?: string | null;
    folderId?: string | null;
  };

  const db = getDb();

  // Handle Folder Move
  if (folderId !== undefined) {
    // If moving to a folder (not root), verify access
    if (folderId) {
      const folder = await db
        .selectFrom("folders")
        .select("ownerId")
        .where("id", "=", folderId)
        .executeTakeFirst();

      if (!folder) throw { status: 404, message: "Folder not found" };

      // User must be owner of folder OR collaborator
      const hasAccess =
        folder.ownerId === user.id ||
        (await db
          .selectFrom("folderCollaborators")
          .where("folderId", "=", folderId)
          .where("userId", "=", user.id)
          .executeTakeFirst());

      if (!hasAccess)
        throw { status: 403, message: "Forbidden: No access to folder" };
    }

    await db
      .updateTable("projects")
      .set({ folderId, updatedAt: new Date().toISOString() })
      .where("id", "=", project.id)
      .execute();
  }

  // Handle Star Toggle (User specific)
  if (typeof isStarred === "boolean") {
    if (isStarred) {
      await db
        .insertInto("projectStars")
        .values({
          projectId: project.id,
          userId: user.id,
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
    } else {
      await db
        .deleteFrom("projectStars")
        .where("projectId", "=", project.id)
        .where("userId", "=", user.id)
        .execute();
    }
  }

  // Handle Restore (deletedAt: null)
  if (deletedAt === null) {
    // Only owner can restore
    if (project.ownerId !== user.id) {
      throw { status: 403, message: "Only owner can restore project" };
    }
    await db
      .updateTable("projects")
      .set({ deletedAt: null })
      .where("id", "=", project.id)
      .execute();
  }

  // Handle Name/Description Update
  if (name || description !== undefined) {
    if (name && name.length < 1) {
      throw { status: 400, message: "Name is required" };
    }
    await db
      .updateTable("projects")
      .set({
        ...(name ? { name } : {}),
        ...(description !== undefined
          ? { description: description || null }
          : {}),
        updatedAt: new Date().toISOString(),
      })
      .where("id", "=", project.id)
      .execute();

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    await logSecurityEvent("projectUpdate", "success", {
      userId: user.id,
      ip,
    });
  }

  return { success: true };
});

export const DELETE = projectAction(async (req, { project, user }) => {
  const db = getDb();
  const url = new URL(req.url);
  const permanent = url.searchParams.get("permanent") === "true";

  // Only owner can delete
  if (project.ownerId !== user.id) {
    throw { status: 403, message: "Only owner can delete project" };
  }

  if (permanent) {
    // Hard Delete
    await runTransaction(db, async (trx) => {
      // Delete related data manually to be safe (or if no cascade)
      await trx
        .deleteFrom("projectCollaborators")
        .where("projectId", "=", project.id)
        .execute();
      await trx
        .deleteFrom("projectStars")
        .where("projectId", "=", project.id)
        .execute();

      await trx
        .deleteFrom("blockSnapshots")
        .where(
          "blockId",
          "in",
          trx
            .selectFrom("blocks")
            .select("id")
            .where("projectId", "=", project.id),
        )
        .execute();

      await trx
        .deleteFrom("blocks")
        .where("projectId", "=", project.id)
        .execute();
      await trx
        .deleteFrom("links")
        .where("projectId", "=", project.id)
        .execute();
      await trx
        .deleteFrom("temporalStates")
        .where("projectId", "=", project.id)
        .execute();

      await trx.deleteFrom("projects").where("id", "=", project.id).execute();
    });

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    await logSecurityEvent("projectPermanentDelete", "success", {
      userId: user.id,
      ip,
    });
  } else {
    // Soft Delete
    await db
      .updateTable("projects")
      .set({ deletedAt: new Date().toISOString() })
      .where("id", "=", project.id)
      .execute();

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    await logSecurityEvent("projectSoftDelete", "success", {
      userId: user.id,
      ip,
    });
  }

  return { success: true };
});
