import { Kysely, sql, ExpressionBuilder } from "kysely";
import { database } from "./types/db";

export function getProjectAccessCondition(
  eb: ExpressionBuilder<database, "projects">,
  userId: string,
) {
  return eb.or([
    eb("projects.ownerId", "=", userId),
    eb(
      "projects.id",
      "in",
      eb
        .selectFrom("projectCollaborators")
        .select("projectId")
        .where("userId", "=", userId),
    ),
    eb(
      "projects.folderId",
      "in",
      eb
        .selectFrom("folderCollaborators")
        .select("folderId")
        .where("userId", "=", userId),
    ),
    eb(
      "projects.folderId",
      "in",
      eb.selectFrom("folders").select("id").where("ownerId", "=", userId),
    ),
  ]);
}

export function getProjectsQuery(
  db: Kysely<database>,
  userId: string,
  view: string | null,
  folderId: string | null | undefined,
  ids: string[] | undefined,
) {
  let query = db
    .selectFrom("projects")
    .innerJoin("users", "users.id", "projects.ownerId")
    .leftJoin("projectStars", (join) =>
      join
        .onRef("projectStars.projectId", "=", "projects.id")
        .on("projectStars.userId", "=", userId),
    )
    .select([
      "projects.id",
      "projects.name",
      "projects.description",
      "projects.folderId",
      "projects.createdAt",
      "projects.updatedAt",
      "projects.deletedAt",
      "projects.ownerId",
      "projects.shareToken",
      "projects.shareEnabled",
      "users.username as ownerName",
      "users.displayName as ownerDisplayName",
      "users.avatarUrl as ownerAvatarUrl",
      "users.color as ownerColor",
      sql<number>`(
        SELECT COUNT(*)
        FROM "projectCollaborators"
        WHERE "projectCollaborators"."projectId" = "projects"."id"
      )`.as("collaboratorCount"),
      sql<number>`CASE WHEN "projectStars"."projectId" IS NOT NULL THEN 1 ELSE 0 END`.as(
        "isStarred",
      ),
      sql<string>`(
        CASE
          WHEN "projects"."ownerId" = ${userId} THEN 'creator'
          ELSE (
            SELECT "role"
            FROM "projectCollaborators"
            WHERE "projectCollaborators"."projectId" = "projects"."id"
            AND "projectCollaborators"."userId" = ${userId}
          )
        END
      )`.as("role"),
    ]);

  // Global Access Control: User must be owner OR collaborator (direct/folder)
  query = query.where((eb) => getProjectAccessCondition(eb, userId));

  // Handle Trash
  if (view === "trash") {
    query = query.where("projects.deletedAt", "is not", null);
  } else {
    query = query.where("projects.deletedAt", "is", null);
  }

  // Handle IDs (Recent view)
  if (ids && ids.length > 0) {
    return query.where("projects.id", "in", ids);
  }

  // Handle Views
  if (view === "starred") {
    query = query.where("projectStars.projectId", "is not", null);
  } else if (view === "shared") {
    // Already filtered by access control, so just exclude owned projects
    query = query.where("projects.ownerId", "!=", userId);
  } else if (view === "my-projects") {
    query = query.where("projects.ownerId", "=", userId);
  }

  // Handle Folder
  if (folderId) {
    query = query.where("projects.folderId", "=", folderId);
  } else {
    // If not in a flat view, show root only
    if (!["trash", "starred", "recent", "shared"].includes(view || "")) {
      query = query.where("projects.folderId", "is", null);
    }
  }

  return query.orderBy("projects.updatedAt", "desc");
}
