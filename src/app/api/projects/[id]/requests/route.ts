import { NextResponse } from "next/server";
import { getDb } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { z } from "zod";

// Declare global helper
declare global {
  var updateProjectRequests: (projectId: string) => Promise<void>;
  var notifyAccessGranted: (projectId: string, userId: string) => Promise<void>;
}

const updateSchema = z.object({
  userId: z.string(),
  action: z.enum(["approve", "reject", "restore"]),
});

export const GET = authenticatedAction<unknown>(async (req, { params, user }) => {
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();

  // Verify ownership
  const project = await db
    .selectFrom("projects")
    .select("ownerId")
    .where("id", "=", params.id)
    .executeTakeFirst();

  if (!project || project.ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requests = await db
    .selectFrom("projectRequests")
    .innerJoin("users", "users.id", "projectRequests.userId")
    .select([
      "projectRequests.id",
      "projectRequests.projectId",
      "projectRequests.userId",
      "projectRequests.status",
      "projectRequests.createdAt",
      "users.email",
      "users.username",
      "users.displayName",
      "users.avatarUrl",
    ])
    .where("projectRequests.projectId", "=", params.id)
    .orderBy("projectRequests.createdAt", "desc")
    .execute();

  return NextResponse.json(requests);
}, { requireUser: true });

export const PATCH = authenticatedAction<unknown, z.infer<typeof updateSchema>>(async (req, { params, user, body }) => {
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, action } = body;
  const db = await getDb();
  const projectId = params.id;

  // Verify ownership
  const project = await db
    .selectFrom("projects")
    .select("ownerId")
    .where("id", "=", projectId)
    .executeTakeFirst();

  if (!project || project.ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "approve") {
    await db.transaction().execute(async (trx) => {
      // Add to collaborators (ignore if already exists)
      const existing = await trx.selectFrom("projectCollaborators")
        .selectAll()
        .where("projectId", "=", projectId)
        .where("userId", "=", userId)
        .executeTakeFirst();

      if (!existing) {
        await trx.insertInto("projectCollaborators")
          .values({
            projectId,
            userId,
            role: "editor",
            createdAt: new Date().toISOString(),
          })
          .execute();
      }

      // Delete request
      await trx.deleteFrom("projectRequests")
        .where("projectId", "=", projectId)
        .where("userId", "=", userId)
        .execute();
    });

    // Notify the user that access is granted
    if (global.notifyAccessGranted) {
      await global.notifyAccessGranted(projectId, userId);
    }
  } else if (action === "reject") {
    await db.updateTable("projectRequests")
      .set({ status: "rejected" })
      .where("projectId", "=", projectId)
      .where("userId", "=", userId)
      .execute();
  } else if (action === "restore") {
    await db.updateTable("projectRequests")
      .set({ status: "pending" })
      .where("projectId", "=", projectId)
      .where("userId", "=", userId)
      .execute();
  }

  // Notify WebSocket clients
  if (global.updateProjectRequests) {
    await global.updateProjectRequests(projectId);
  }

  return NextResponse.json({ success: true });
}, { schema: updateSchema, requireUser: true });
