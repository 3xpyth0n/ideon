import { getDb } from "@lib/db";
import { buildRecursiveProjectCounts } from "@lib/folder-project-counts";
import { authenticatedAction } from "@lib/server-utils";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";

const createFolderSchema = z.object({
  name: z.string().min(1),
  parentFolderId: z.string().uuid().nullable().optional(),
});

export const GET = authenticatedAction(
  async (req, { user }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();
    const url = new URL(req.url);
    const view = url.searchParams.get("view");
    const parentFolderId = url.searchParams.get("parentFolderId");
    const includeNested = url.searchParams.get("includeNested") === "true";

    // Get folders where user is owner OR collaborator
    let query = db
      .selectFrom("folders")
      .select([
        "folders.id",
        "folders.name",
        "folders.ownerId",
        "folders.parentFolderId",
        "folders.createdAt",
        "folders.updatedAt",
        "folders.isStarred",
        "folders.deletedAt",
        (eb) =>
          eb
            .selectFrom("folderCollaborators")
            .select(eb.fn.countAll<string>().as("count"))
            .whereRef("folderCollaborators.folderId", "=", "folders.id")
            .as("collaboratorCount"),
      ])
      .where((eb) =>
        eb.or([
          eb("ownerId", "=", user.id),
          eb(
            "id",
            "in",
            eb
              .selectFrom("folderCollaborators")
              .select("folderId")
              .where("userId", "=", user.id),
          ),
        ]),
      );

    if (view === "starred") {
      query = query.where("isStarred", "=", 1).where("deletedAt", "is", null);
    } else if (view === "trash") {
      query = query.where("deletedAt", "is not", null);
    } else if (view === "shared") {
      query = query
        .where("ownerId", "!=", user.id)
        .where("deletedAt", "is", null);
    } else if (view === "my-projects") {
      query = query
        .where("ownerId", "=", user.id)
        .where("deletedAt", "is", null);
    } else {
      query = query.where("deletedAt", "is", null);
    }

    if (!includeNested) {
      if (parentFolderId) {
        query = query.where("parentFolderId", "=", parentFolderId);
      } else if (!["starred", "trash"].includes(view || "")) {
        query = query.where("parentFolderId", "is", null);
      }
    }

    const folders = await query.orderBy("createdAt", "desc").execute();

    if (folders.length === 0) {
      return folders;
    }

    const accessibleFolders = await db
      .selectFrom("folders")
      .select(["id", "parentFolderId"])
      .where((eb) =>
        eb.or([
          eb("ownerId", "=", user.id),
          eb(
            "id",
            "in",
            eb
              .selectFrom("folderCollaborators")
              .select("folderId")
              .where("userId", "=", user.id),
          ),
        ]),
      )
      .execute();

    const accessibleFolderIds = accessibleFolders.map((folder) => folder.id);
    const directProjectCounts = new Map<string, number>();

    if (accessibleFolderIds.length > 0) {
      const projectCountRows = await db
        .selectFrom("projects")
        .select(["folderId", (eb) => eb.fn.countAll<number>().as("count")])
        .where("deletedAt", "is", null)
        .where("folderId", "in", accessibleFolderIds)
        .groupBy("folderId")
        .execute();

      for (const row of projectCountRows) {
        if (!row.folderId) {
          continue;
        }

        directProjectCounts.set(row.folderId, Number(row.count));
      }
    }

    const recursiveProjectCounts = buildRecursiveProjectCounts(
      accessibleFolders.map((folder) => ({
        id: folder.id,
        parentFolderId: folder.parentFolderId,
      })),
      directProjectCounts,
    );

    return folders.map((folder) => ({
      ...folder,
      projectCount: recursiveProjectCounts.get(folder.id) ?? 0,
    }));
  },
  { requireUser: true },
);

export const POST = authenticatedAction(
  async (req, { user, body }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();
    const { name, parentFolderId } = body;

    if (parentFolderId) {
      const parentFolder = await db
        .selectFrom("folders")
        .select(["id", "ownerId", "deletedAt"])
        .where("id", "=", parentFolderId)
        .executeTakeFirst();

      if (!parentFolder || parentFolder.deletedAt) {
        throw { status: 404, message: "Parent folder not found" };
      }

      if (parentFolder.ownerId !== user.id) {
        throw {
          status: 403,
          message: "Forbidden: Only the folder owner can create subfolders",
        };
      }
    }

    const folderId = uuidv4();
    const now = new Date().toISOString();

    await db
      .insertInto("folders")
      .values({
        id: folderId,
        name,
        ownerId: user.id,
        parentFolderId: parentFolderId || null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    await logSecurityEvent("folderCreate", "success", {
      userId: user.id,
      ip,
    });

    return {
      id: folderId,
      name,
      ownerId: user.id,
      parentFolderId: parentFolderId || null,
      createdAt: now,
      updatedAt: now,
    };
  },
  { schema: createFolderSchema, requireUser: true },
);
