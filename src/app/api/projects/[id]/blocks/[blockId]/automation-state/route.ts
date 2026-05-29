import { projectAction } from "@lib/server-utils";
import { getDb, getGlobalDb } from "@lib/db";

export const dynamic = "force-dynamic";

export const DELETE = projectAction(async (req, { project }) => {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  const blockId = parts[parts.length - 2];

  if (!blockId) throw { status: 400, message: "blockId required" };

  const db = getDb();
  const block = await db
    .selectFrom("blocks")
    .select("id")
    .where("id", "=", blockId)
    .where("projectId", "=", project.id)
    .executeTakeFirst();

  if (!block) throw { status: 404, message: "Block not found" };

  await getGlobalDb()
    .deleteFrom("blockAutomationStates")
    .where("blockId", "=", blockId)
    .execute();

  return { ok: true };
});
