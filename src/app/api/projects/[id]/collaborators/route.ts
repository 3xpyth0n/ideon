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
      sql<string>`'creator'`.as("role"),
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
  async (_req, { project, body, role: currentRole }) => {
    const { userId, role } = body as { userId: string; role?: string };

    if (!userId || typeof userId !== "string") {
      throw { status: 400, message: "Invalid userId" };
    }

    // Only creator or owner can add collaborators
    if (currentRole !== "creator" && currentRole !== "owner") {
      throw {
        status: 403,
        message: "Forbidden: Only creator or owner can add collaborators",
      };
    }

    const targetRole = (role || "editor") as "owner" | "editor" | "viewer";

    // Only Creator can assign Owner role
    if (targetRole === "owner" && currentRole !== "creator") {
      throw {
        status: 403,
        message: "Forbidden: Only creator can assign owner role",
      };
    }

    // Validate target role
    if (!["owner", "editor", "viewer"].includes(targetRole)) {
      throw { status: 400, message: "Invalid role" };
    }

    const db = getDb();

    await db
      .insertInto("projectCollaborators")
      .values({
        projectId: project.id,
        userId: userId,
        role: targetRole,
        createdAt: new Date().toISOString(),
      })
      .onConflict((oc) =>
        oc.columns(["projectId", "userId"]).doUpdateSet({
          role: targetRole,
        }),
      )
      .execute();

    return { success: true };
  },
);

export const DELETE = projectAction(
  async (req, { project, role: currentRole }) => {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      throw { status: 400, message: "userId is required" };
    }

    // Only creator or owner can remove collaborators
    if (currentRole !== "creator" && currentRole !== "owner") {
      throw { status: 403, message: "Forbidden" };
    }

    const db = getDb();

    // Check target user role
    const targetCollaborator = await db
      .selectFrom("projectCollaborators")
      .select("role")
      .where("projectId", "=", project.id)
      .where("userId", "=", userId)
      .executeTakeFirst();

    if (targetCollaborator) {
      // Only Creator can remove Owner
      if (targetCollaborator.role === "owner" && currentRole !== "creator") {
        throw {
          status: 403,
          message: "Forbidden: Only creator can remove owners",
        };
      }
    }

    // Cannot remove creator (implied by table structure, but good for safety if we ever change things)
    if (userId === project.ownerId) {
      throw { status: 403, message: "Cannot remove creator" };
    }

    await db
      .deleteFrom("projectCollaborators")
      .where("projectId", "=", project.id)
      .where("userId", "=", userId)
      .execute();

    // Kick user from WebSocket
    const globalWithKick = global as unknown as {
      kickUser?: (pid: string, uid: string) => void;
    };
    if (globalWithKick && typeof globalWithKick.kickUser === "function") {
      globalWithKick.kickUser(project.id, userId);
    }

    return { success: true };
  },
);
