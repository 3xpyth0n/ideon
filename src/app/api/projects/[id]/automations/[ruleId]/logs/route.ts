import { getDb } from "@lib/db";
import { projectAction } from "@lib/server-utils";

export const dynamic = "force-dynamic";

export const GET = projectAction(async (_req, { project, params }) => {
  const db = getDb();

  const rule = await db
    .selectFrom("automationRules")
    .select("id")
    .where("id", "=", params.ruleId)
    .where("projectId", "=", project.id)
    .executeTakeFirst();

  if (!rule) throw { status: 404, message: "Automation rule not found" };

  const logs = await db
    .selectFrom("automationLogs")
    .select(["id", "status", "payload", "error", "appliedAt"])
    .where("ruleId", "=", params.ruleId)
    .orderBy("appliedAt", "desc")
    .limit(20)
    .execute();

  return logs;
});
