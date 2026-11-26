import { randomBytes } from "crypto";
import { getDb } from "@lib/db";
import { projectAction } from "@lib/server-utils";
import { canManageAutomationRules } from "@lib/automation-rules";

export const dynamic = "force-dynamic";

function assertCanManage(role: string) {
  if (!canManageAutomationRules(role)) {
    throw {
      status: 403,
      message: "Only project owners can access webhook secrets",
    };
  }
}

export const GET = projectAction(async (_req, { project, params, role }) => {
  assertCanManage(role);

  const rule = await getDb()
    .selectFrom("automationRules")
    .select("webhookSecret")
    .where("id", "=", params.ruleId)
    .where("projectId", "=", project.id)
    .executeTakeFirst();

  if (!rule) throw { status: 404, message: "Automation rule not found" };
  return { webhookSecret: rule.webhookSecret };
});

export const POST = projectAction(async (_req, { project, params, role }) => {
  assertCanManage(role);

  const rule = await getDb()
    .updateTable("automationRules")
    .set({ webhookSecret: randomBytes(32).toString("hex") })
    .where("id", "=", params.ruleId)
    .where("projectId", "=", project.id)
    .returning("webhookSecret")
    .executeTakeFirst();

  if (!rule) throw { status: 404, message: "Automation rule not found" };
  return { webhookSecret: rule.webhookSecret };
});
