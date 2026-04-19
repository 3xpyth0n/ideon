import { getDb, runTransaction } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { logSecurityEvent } from "@lib/audit";
import { loadDictionaries } from "@i18n/loader";
import { cookies, headers } from "next/headers";
import { v4 as uuidv4 } from "uuid";

import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  folderId: z.string().uuid().nullable().optional(),
});

import { getProjectsQuery } from "@lib/queries";
import { buildStarterProjectGraph } from "./starterProjectGraph";

export const GET = authenticatedAction(
  async (req, { user }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();
    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "all";
    const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
    const folderId = url.searchParams.get("folderId");

    const query = getProjectsQuery(db, user.id, view, folderId, ids);
    const projects = await query.execute();
    return projects;
  },
  { requireUser: true },
);

export const POST = authenticatedAction(
  async (_req, { user, body }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();
    const cookieStore = await cookies();
    const lang = cookieStore.get("ideonLang")?.value || "en";
    const dictionaries = await loadDictionaries();
    const dict = dictionaries[lang] || dictionaries["en"];

    const { name, description, folderId } = body;

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
          .selectAll()
          .where("folderId", "=", folderId)
          .where("userId", "=", user.id)
          .executeTakeFirst());

      if (!hasAccess) throw new Error("Forbidden: No access to folder");
    }

    const projectId = uuidv4();
    const now = new Date().toISOString();
    const starterGraph = buildStarterProjectGraph({
      dict,
      now,
      ownerId: user.id,
      projectDescription: description,
      projectId,
      projectName: name,
    });

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

      await trx.insertInto("blocks").values(starterGraph.blocks).execute();
      await trx.insertInto("links").values(starterGraph.links).execute();
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
