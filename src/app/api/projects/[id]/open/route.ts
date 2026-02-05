import { getDb } from "@lib/db";
import { projectAction } from "@lib/server-utils";

export const POST = projectAction(async (_req, { project }) => {
  const db = getDb();
  
  await db
    .updateTable("projects")
    .set({ lastOpenedAt: new Date().toISOString() })
    .where("id", "=", project.id)
    .execute();

  return { success: true };
});
