import { getDb } from "@lib/db";
import { sql } from "kysely";
import { projectAction } from "@lib/server-utils";

export const GET = projectAction(async (_req, { project }) => {
  const db = getDb();

  // Get project owner
  const projectWithOwner = await db
    .selectFrom("projects")
    .innerJoin("users", "users.id", "projects.ownerId")
    .select([
      "users.id as id",
      "users.email as email",
      "users.username as username",
      "users.displayName as displayName",
      "users.avatarUrl as avatarUrl",
      "users.color as color",
      sql<string>`'owner'`.as("role"),
    ])
    .where("projects.id", "=", project.id)
    .executeTakeFirst();

  const collaborators = await db
    .selectFrom("projectCollaborators")
    .innerJoin("users", "users.id", "projectCollaborators.userId")
    .select([
      "users.id as id",
      "users.email as email",
      "users.username as username",
      "users.displayName as displayName",
      "users.avatarUrl as avatarUrl",
      "users.color as color",
      "projectCollaborators.role as role",
    ])
    .where("projectCollaborators.projectId", "=", project.id)
    .whereRef("projectCollaborators.userId", "!=", (eb) =>
      eb.selectFrom("projects").select("ownerId").where("id", "=", project.id),
    )
    .execute();

  const allUsers = projectWithOwner
    ? [projectWithOwner, ...collaborators]
    : collaborators;

  return allUsers;
});

export const POST = projectAction(
  async (_req, { project, user: auth, body }) => {
    const { userId, role } = body as { userId: string; role?: string };

    if (!userId || typeof userId !== "string") {
      throw { status: 400, message: "Invalid userId" };
    }

    // Only owner can add collaborators
    if (project.ownerId !== auth.id) {
      throw { status: 403, message: "Forbidden" };
    }

    const db = getDb();

    await db
      .insertInto("projectCollaborators")
      .values({
        projectId: project.id,
        userId: userId,
        role: (role || "editor") as "owner" | "admin" | "editor" | "viewer",
        createdAt: new Date().toISOString(),
      })
      .onConflict((oc) =>
        oc.columns(["projectId", "userId"]).doUpdateSet({
          role: (role || "editor") as "owner" | "admin" | "editor" | "viewer",
        }),
      )
      .execute();

    return { success: true };
  },
);

export const DELETE = projectAction(async (req, { project, user: auth }) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    throw { status: 400, message: "userId is required" };
  }

  // Only owner can remove collaborators
  if (project.ownerId !== auth.id) {
    throw { status: 403, message: "Forbidden" };
  }

  const db = getDb();

  await db
    .deleteFrom("projectCollaborators")
    .where("projectId", "=", project.id)
    .where("userId", "=", userId)
    .execute();

  return { success: true };
});
