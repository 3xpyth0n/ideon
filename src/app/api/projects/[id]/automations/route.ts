import { randomBytes } from "crypto";
import { getDb } from "@lib/db";
import { projectAction } from "@lib/server-utils";
import { z } from "zod";

const createRuleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  source: z.enum(["github", "custom"]),
  triggerEvent: z.string().min(1),
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
    .optional(),
  targetBlockId: z.string().nullable().optional(),
  action: z.enum([
    "create_kanban_task",
    "set_state",
    "update_note",
    "set_color",
  ]),
  actionParams: z.record(z.string(), z.unknown()).optional(),
  stateDecayMinutes: z.number().int().min(1).max(525600).optional(),
  sourceBlockId: z.string().nullable().optional(),
});

export const GET = projectAction(async (_req, { project }) => {
  const db = getDb();
  const rules = await db
    .selectFrom("automationRules")
    .selectAll()
    .where("projectId", "=", project.id)
    .orderBy("createdAt", "desc")
    .execute();
  return rules;
});

export const POST = projectAction(
  async (_req, { project, body, role }) => {
    if (role !== "creator" && role !== "owner") {
      throw {
        status: 403,
        message: "Only project owners can create automation rules",
      };
    }

    const db = getDb();
    const parsed = body as z.infer<typeof createRuleSchema>;
    const id = parsed.id ?? randomBytes(16).toString("hex");
    const webhookSecret = randomBytes(32).toString("hex");
    const now = Date.now();

    const rule = await db
      .insertInto("automationRules")
      .values({
        id,
        projectId: project.id,
        name: parsed.name,
        enabled: 1,
        source: parsed.source,
        triggerEvent: parsed.triggerEvent,
        conditions: parsed.conditions
          ? JSON.stringify(parsed.conditions)
          : null,
        targetBlockId: parsed.targetBlockId ?? null,
        action: parsed.action,
        actionParams: parsed.actionParams
          ? JSON.stringify(parsed.actionParams)
          : null,
        webhookSecret,
        stateDecayMinutes: parsed.stateDecayMinutes ?? 1440,
        sourceBlockId: parsed.sourceBlockId ?? null,
        lastTriggeredAt: null,
        createdAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (parsed.triggerEvent?.startsWith("cron:")) {
      void (
        global as { rescheduleCronBlocks?: () => Promise<void> }
      ).rescheduleCronBlocks?.();
    }
    return rule;
  },
  { schema: createRuleSchema },
);
