import { getDb } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { z } from "zod";
import * as crypto from "crypto";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";

const createFolderSchema = z.object({
  name: z.string().min(1),
});

export const GET = authenticatedAction(
  async (req, { user }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();
    const url = new URL(req.url);
    const view = url.searchParams.get("view");

    // Get folders where user is owner OR collaborator
    let query = db
      .selectFrom("folders")
      .select([
        "folders.id",
        "folders.name",
        "folders.ownerId",
        "folders.createdAt",
        "folders.updatedAt",
        "folders.isStarred",
        "folders.deletedAt",
        (eb) =>
          eb
            .selectFrom("projects")
            .select(eb.fn.countAll<string>().as("count"))
            .whereRef("projects.folderId", "=", "folders.id")
            .where("projects.deletedAt", "is", null)
            .as("projectCount"),
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

    const folders = await query.orderBy("createdAt", "desc").execute();

    return folders;
  },
  { requireUser: true },
);

export const POST = authenticatedAction(
  async (req, { user, body }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();
    const { name } = body;

    const folderId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .insertInto("folders")
      .values({
        id: folderId,
        name,
        ownerId: user.id,
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
      createdAt: now,
      updatedAt: now,
    };
  },
  { schema: createFolderSchema, requireUser: true },
);
