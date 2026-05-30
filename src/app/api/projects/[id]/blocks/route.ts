import { projectAction } from "@lib/server-utils";
import { getDb } from "@lib/db";

export const GET = projectAction(async (_req, { project }) => {
  const db = getDb();
  const rows = await db
    .selectFrom("blocks")
    .select(["id", "blockType", "data"])
    .where("projectId", "=", project.id)
    .execute();

  return rows.map((row) => {
    let title: string | undefined;
    try {
      const parsed = JSON.parse(row.data) as { title?: string };
      if (parsed.title) title = parsed.title;
    } catch {
      // data may be empty or malformed — title remains undefined
    }
    return { id: row.id, blockType: row.blockType, title };
  });
});
