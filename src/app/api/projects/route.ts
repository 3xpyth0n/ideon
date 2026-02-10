import { getDb, runTransaction } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";

import { z } from "zod";
import { sql, Insertable } from "kysely";
import { blocksTable } from "@lib/types/db";

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  folderId: z.string().uuid().optional(),
});

export const GET = authenticatedAction(
  async (req, { user }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();
    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "all";
    const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
    const folderId = url.searchParams.get("folderId");

    let query = db
      .selectFrom("projects")
      .leftJoin("projectStars", (join) =>
        join
          .onRef("projectStars.projectId", "=", "projects.id")
          .on("projectStars.userId", "=", user.id),
      )
      .select([
        "projects.id as id",
        "projects.name as name",
        "projects.description as description",
        "projects.updatedAt as updatedAt",
        "projects.ownerId as ownerId",
        "projects.deletedAt as deletedAt",
        "projects.folderId as folderId",
        sql<number>`CASE WHEN "projectStars"."projectId" IS NOT NULL THEN 1 ELSE 0 END`.as(
          "isStarred",
        ),
        (eb) =>
          eb
            .selectFrom("projectCollaborators")
            .select(sql<number>`count("userId") + 1`.as("count"))
            .whereRef("projectCollaborators.projectId", "=", "projects.id")
            .whereRef("projectCollaborators.userId", "!=", "projects.ownerId")
            .as("collaboratorCount"),
      ]);

    // Apply View Filters
    if (view === "trash") {
      // Trash view: Only show soft-deleted projects owned by the user
      query = query
        .where("projects.deletedAt", "is not", null)
        .where("projects.ownerId", "=", user.id);
    } else {
      // Default views: Exclude soft-deleted projects
      query = query.where("projects.deletedAt", "is", null);

      if (folderId) {
        // Folder View: Show projects in specific folder
        query = query.where("projects.folderId", "=", folderId);
      } else if (view === "my-projects") {
        query = query
          .where("projects.ownerId", "=", user.id)
          .where("projects.folderId", "is", null);
      } else if (view === "shared") {
        query = query
          .where("projects.ownerId", "!=", user.id)
          .where((eb) =>
            eb.or([
              eb.exists(
                eb
                  .selectFrom("projectCollaborators")
                  .select("projectCollaborators.userId")
                  .whereRef("projectId", "=", "projects.id")
                  .where("userId", "=", user.id),
              ),
              eb.exists(
                eb
                  .selectFrom("folders")
                  .innerJoin(
                    "folderCollaborators",
                    "folderCollaborators.folderId",
                    "folders.id",
                  )
                  .whereRef("folders.id", "=", "projects.folderId")
                  .where("folderCollaborators.userId", "=", user.id),
              ),
            ]),
          );
      } else if (view === "starred") {
        query = query.where("projectStars.projectId", "is not", null);
      } else if (view === "recent" && ids && ids.length > 0) {
        query = query.where("projects.id", "in", ids);
      } else if (view === "recent" && (!ids || ids.length === 0)) {
        return [];
      } else {
        // view === "all" (default)
        query = query.where("projects.folderId", "is", null);
      }
    }

    // Access Control: User must be owner, direct collaborator, or folder collaborator
    if (view !== "my-projects" && view !== "trash") {
      query = query.where((eb) =>
        eb.or([
          // 1. Direct Owner
          eb("projects.ownerId", "=", user.id),
          // 2. Direct Collaborator
          eb(
            "projects.id",
            "in",
            eb
              .selectFrom("projectCollaborators")
              .select("projectId")
              .where("userId", "=", user.id),
          ),
          // 3. Folder Access (Owner or Collaborator)
          eb(
            "projects.folderId",
            "in",
            eb
              .selectFrom("folders")
              .select("id")
              .where((feb) =>
                feb.or([
                  feb("ownerId", "=", user.id),
                  feb(
                    "id",
                    "in",
                    eb
                      .selectFrom("folderCollaborators")
                      .select("folderId")
                      .where("userId", "=", user.id),
                  ),
                ]),
              ),
          ),
        ]),
      );
    }

    const projects = await query
      .orderBy("projects.updatedAt", "desc")
      .execute();

    return projects;
  },
  { requireUser: true },
);

export const POST = authenticatedAction(
  async (_req, { user, body }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();

    const { name, description, folderId } = body;

    // If folderId provided, verify access
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

      // Create default Core Block
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
