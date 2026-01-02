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
});

export const GET = authenticatedAction(
  async (_req, { user }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();

    const projects = await db
      .selectFrom("projects")
      .select([
        "projects.id as id",
        "projects.name as name",
        "projects.description as description",
        "projects.updatedAt as updatedAt",
        "projects.ownerId as ownerId",
        (eb) =>
          eb
            .selectFrom("projectCollaborators")
            .select(sql<number>`count("userId") + 1`.as("count"))
            .whereRef("projectCollaborators.projectId", "=", "projects.id")
            .whereRef("projectCollaborators.userId", "!=", "projects.ownerId")
            .as("collaboratorCount"),
      ])
      .where((eb) =>
        eb.or([
          eb("projects.ownerId", "=", user.id),
          eb(
            "projects.id",
            "in",
            eb
              .selectFrom("projectCollaborators")
              .select("projectId")
              .where("userId", "=", user.id),
          ),
        ]),
      )
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

    const { name, description } = body;

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
      collaboratorCount: 1,
      ownerId: user.id,
      updatedAt: now,
    };
  },
  { schema: createProjectSchema, requireUser: true },
);
