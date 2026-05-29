import { randomBytes } from "crypto";
import { getDb } from "@lib/db";
import { projectAction } from "@lib/server-utils";
import { z } from "zod";

const updateRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  triggerEvent: z.string().min(1).optional(),
  conditions: z
    .array(
      z.object({
        field: z.string(),
        op: z.enum([
          "eq",
          "neq",
          "contains",
          "exists",
          "gt",
          "lt",
          "gte",
          "lte",
        ]),
        value: z.unknown().optional(),
      }),
    )
    .nullable()
    .optional(),
  targetBlockId: z.string().nullable().optional(),
  action: z
    .enum(["create_kanban_task", "set_state", "update_note", "set_color"])
    .optional(),
  actionParams: z.record(z.string(), z.unknown()).nullable().optional(),
  stateDecayMinutes: z.number().int().min(1).max(525600).optional(),
  regenerateSecret: z.boolean().optional(),
});

async function getRule(projectId: string, ruleId: string) {
  const db = getDb();
  const rule = await db
    .selectFrom("automationRules")
    .selectAll()
    .where("id", "=", ruleId)
    .where("projectId", "=", projectId)
    .executeTakeFirst();
  if (!rule) throw { status: 404, message: "Automation rule not found" };
  return rule;
}

export const GET = projectAction(async (_req, { project, params }) => {
  return getRule(project.id, params.ruleId);
});

export const PUT = projectAction(
  async (_req, { project, params, body, role }) => {
    if (role !== "creator" && role !== "owner") {
      throw {
        status: 403,
        message: "Only project owners can update automation rules",
      };
    }

    await getRule(project.id, params.ruleId);

    const db = getDb();
    const parsed = body as z.infer<typeof updateRuleSchema>;

    const updates: Record<string, unknown> = {};
    if (parsed.name !== undefined) updates.name = parsed.name;
    if (parsed.enabled !== undefined) updates.enabled = parsed.enabled ? 1 : 0;
    if (parsed.triggerEvent !== undefined)
      updates.triggerEvent = parsed.triggerEvent;
    if (parsed.conditions !== undefined)
      updates.conditions = parsed.conditions
        ? JSON.stringify(parsed.conditions)
        : null;
    if (parsed.targetBlockId !== undefined)
      updates.targetBlockId = parsed.targetBlockId;
    if (parsed.action !== undefined) updates.action = parsed.action;
    if (parsed.actionParams !== undefined)
      updates.actionParams = parsed.actionParams
        ? JSON.stringify(parsed.actionParams)
        : null;
    if (parsed.stateDecayMinutes !== undefined)
      updates.stateDecayMinutes = parsed.stateDecayMinutes;
    if (parsed.regenerateSecret)
      updates.webhookSecret = randomBytes(32).toString("hex");

    if (Object.keys(updates).length === 0) {
      return getRule(project.id, params.ruleId);
    }

    const rule = await db
      .updateTable("automationRules")
      .set(updates)
      .where("id", "=", params.ruleId)
      .where("projectId", "=", project.id)
      .returningAll()
      .executeTakeFirstOrThrow();

    void (
      global as { rescheduleCronBlocks?: () => Promise<void> }
    ).rescheduleCronBlocks?.();
    return rule;
  },
  { schema: updateRuleSchema },
);

export const DELETE = projectAction(async (_req, { project, params, role }) => {
  if (role !== "creator" && role !== "owner") {
    throw {
      status: 403,
      message: "Only project owners can delete automation rules",
    };
  }

  await getRule(project.id, params.ruleId);

  const db = getDb();
  await db
    .deleteFrom("automationRules")
    .where("id", "=", params.ruleId)
    .where("projectId", "=", project.id)
    .execute();

  void (
    global as { rescheduleCronBlocks?: () => Promise<void> }
  ).rescheduleCronBlocks?.();
  return { success: true };
});
