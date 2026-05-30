import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import * as Y from "yjs";
import type { LeveldbPersistence } from "y-leveldb";
import { getDb, getGlobalDb } from "../../app/lib/db";
import { docs } from "../y-websocket/utils";
import { expandTemplateRecord } from "./template";
import { evaluateConditionsDetailed } from "./conditions";
import type { AutomationRule } from "../../app/lib/types/db";
import type { Node } from "@xyflow/react";
import type { BlockData } from "../../app/components/project/CanvasBlock";
import type { Column, Task } from "../../app/components/project/kanbanModel";
import { logger } from "../../app/lib/logger";

const MAX_PAYLOAD_BYTES = 512 * 1024;
const MAX_LOG_PAYLOAD_BYTES = 4 * 1024;

// In-memory rate limiter: ruleId → { count, windowStart }
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ruleId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ruleId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ruleId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

function verifyHmac(
  secret: string,
  rawBody: Buffer,
  signature: string,
): boolean {
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_PAYLOAD_BYTES) {
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(null));
  });
}

async function writeLog(
  ruleId: string,
  status: "success" | "error" | "skipped" | "test",
  payload: unknown,
  error?: string,
) {
  try {
    const db = getDb();
    const id = randomBytes(16).toString("hex");
    const trimmedPayload = JSON.stringify(payload).slice(
      0,
      MAX_LOG_PAYLOAD_BYTES,
    );
    await db
      .insertInto("automationLogs")
      .values({
        id,
        ruleId,
        status,
        payload: trimmedPayload,
        error: error ?? null,
        appliedAt: Date.now(),
      })
      .execute();
    // Keep last 100 entries per rule
    await db
      .deleteFrom("automationLogs")
      .where("ruleId", "=", ruleId)
      .where(
        "id",
        "not in",
        db
          .selectFrom("automationLogs")
          .select("id")
          .where("ruleId", "=", ruleId)
          .orderBy("appliedAt", "desc")
          .limit(100),
      )
      .execute();
  } catch {
    // Log write failure must never crash the webhook handler
  }
}

async function getOrLoadYDoc(
  docName: string,
  ldb: LeveldbPersistence,
): Promise<{ ydoc: Y.Doc; isLive: boolean }> {
  const live = docs.get(docName);
  if (live) return { ydoc: live, isLive: true };

  const persisted = await ldb.getYDoc(docName);
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persisted));
  return { ydoc, isLive: false };
}

async function applyAction(
  rule: AutomationRule,
  payload: unknown,
  ldb: LeveldbPersistence,
): Promise<void> {
  const actionParams = rule.actionParams
    ? (JSON.parse(rule.actionParams) as Record<string, unknown>)
    : {};
  const expanded = expandTemplateRecord(actionParams, payload);

  const docName = `project-${rule.projectId}`;
  const { ydoc, isLive } = await getOrLoadYDoc(docName, ldb);
  const decayAt = Date.now() + rule.stateDecayMinutes * 60_000;

  ydoc.transact(() => {
    const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");

    if (rule.action === "set_state") {
      const VALID_STATES = [
        "neutral",
        "processing",
        "success",
        "warning",
        "error",
      ] as const;
      type ValidState = (typeof VALID_STATES)[number];
      const rawState = (expanded.state as string) ?? "success";
      const state: ValidState = (VALID_STATES as readonly string[]).includes(
        rawState,
      )
        ? (rawState as ValidState)
        : "success";
      const label = (expanded.label as string | undefined) ?? null;
      const blockId = rule.targetBlockId;
      if (!blockId) {
        logger.warn({ ruleId: rule.id }, "set_state: no targetBlockId");
        return;
      }

      const block = yBlocks.get(blockId);
      if (!block) {
        logger.warn(
          { ruleId: rule.id, blockId },
          "set_state: block not found in Yjs",
        );
        return;
      }

      const yAutomationStates = ydoc.getMap<{
        state: string;
        label: string | null;
        decayAt: number;
      }>("automationStates");
      yAutomationStates.set(blockId, { state, label, decayAt });
    } else if (rule.action === "set_color") {
      const color = (expanded.color as string) ?? "#6366f1";
      const blockId = rule.targetBlockId;
      if (!blockId) return;

      const block = yBlocks.get(blockId);
      if (!block) return;

      yBlocks.set(blockId, {
        ...block,
        data: {
          ...block.data,
          metadata:
            typeof block.data.metadata === "string"
              ? JSON.stringify({
                  ...JSON.parse(block.data.metadata || "{}"),
                  color,
                })
              : { ...(block.data.metadata ?? {}), color },
        },
      });
    } else if (rule.action === "update_note") {
      const prefix = (expanded.text as string) ?? "";
      const blockId = rule.targetBlockId;
      if (!blockId || !prefix) return;

      const yContents = ydoc.getMap<Y.Text>("contents");
      const yText = yContents.get(blockId);
      if (!yText) {
        logger.warn(
          { ruleId: rule.id, blockId },
          "update_note: Y.Text not found",
        );
        return;
      }

      yText.insert(0, prefix + "\n");
    } else if (rule.action === "create_kanban_task") {
      const blockId = rule.targetBlockId;
      if (!blockId) return;

      const block = yBlocks.get(blockId);
      if (!block || block.data.blockType !== "kanban") return;

      const rawMeta =
        typeof block.data.metadata === "string"
          ? block.data.metadata
          : JSON.stringify(block.data.metadata ?? "{}");
      let meta: { columns?: Column[]; fields?: unknown[] };
      try {
        meta = JSON.parse(rawMeta);
      } catch {
        return;
      }

      if (!meta.columns || meta.columns.length === 0) return;

      const todoColumn =
        meta.columns.find((c) => c.workflowState === "todo") ?? meta.columns[0];

      const newTask: Task = {
        id: randomBytes(8).toString("hex"),
        text: (expanded.title as string) || "Webhook task",
        checked: false,
      };

      const updatedColumns = meta.columns.map((col) =>
        col.id === todoColumn.id
          ? { ...col, tasks: [newTask, ...col.tasks] }
          : col,
      );

      yBlocks.set(blockId, {
        ...block,
        data: {
          ...block.data,
          metadata: JSON.stringify({ ...meta, columns: updatedColumns }),
        },
      });
    }
  });

  if (!isLive) {
    await ldb.storeUpdate(docName, Y.encodeStateAsUpdate(ydoc));
  }
}

async function syncAutomationStateToSql(
  rule: AutomationRule,
  payload: unknown,
): Promise<void> {
  if (rule.action !== "set_state") return;

  const actionParams = rule.actionParams
    ? (JSON.parse(rule.actionParams) as Record<string, unknown>)
    : {};
  const expanded = expandTemplateRecord(actionParams, payload);
  const rawState = (expanded.state as string) ?? "success";
  const validStates = [
    "neutral",
    "processing",
    "success",
    "warning",
    "error",
  ] as const;
  type AutomationStateValue = (typeof validStates)[number];
  const state: AutomationStateValue = (
    validStates as readonly string[]
  ).includes(rawState)
    ? (rawState as AutomationStateValue)
    : "success";
  const label = (expanded.label as string | undefined) ?? null;
  const blockId = rule.targetBlockId;
  if (!blockId) return;

  const db = getGlobalDb();
  await db
    .insertInto("blockAutomationStates")
    .values({ blockId, ruleId: rule.id, state, label, lastUpdated: Date.now() })
    .onConflict((oc) =>
      oc.column("blockId").doUpdateSet({
        ruleId: rule.id,
        state,
        label,
        lastUpdated: Date.now(),
      }),
    )
    .execute();
}

export async function executeCronRule(
  rule: AutomationRule,
  ldb: LeveldbPersistence,
  triggerType: "scheduled" | "manual" = "scheduled",
): Promise<void> {
  const payload = {
    cron: true,
    schedule: rule.triggerEvent,
    triggeredAt: Date.now(),
    manual: triggerType === "manual",
  };
  try {
    await applyAction(rule, payload, ldb);
    await syncAutomationStateToSql(rule, payload);
    await writeLog(
      rule.id,
      triggerType === "manual" ? "test" : "success",
      payload,
    );
    await getDb()
      .updateTable("automationRules")
      .set({ lastTriggeredAt: Date.now() })
      .where("id", "=", rule.id)
      .execute();
  } catch (err) {
    await writeLog(rule.id, "error", payload, String(err));
  }
}

export async function handleWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
  projectId: string,
  ruleId: string,
  ldb: LeveldbPersistence,
): Promise<void> {
  if (!checkRateLimit(ruleId)) {
    res.statusCode = 429;
    res.end("Too Many Requests");
    return;
  }

  const rawBody = await readBody(req);
  if (rawBody === null) {
    res.statusCode = 413;
    res.end("Payload Too Large");
    return;
  }

  const db = getDb();
  const rule = await db
    .selectFrom("automationRules")
    .selectAll()
    .where("id", "=", ruleId)
    .where("projectId", "=", projectId)
    .executeTakeFirst();

  if (!rule || !rule.enabled) {
    res.statusCode = 200;
    res.end("OK");
    return;
  }

  // Validate secret
  const hmacHeader = req.headers["x-hub-signature-256"] as string | undefined;
  const tokenHeader = req.headers["x-ideon-secret"] as string | undefined;
  const authHeader = req.headers["authorization"] as string | undefined;
  const isTest = req.headers["x-ideon-test"] === "true";

  let authenticated = false;
  if (hmacHeader) {
    authenticated = verifyHmac(rule.webhookSecret, rawBody, hmacHeader);
  } else if (tokenHeader) {
    try {
      authenticated = timingSafeEqual(
        Buffer.from(rule.webhookSecret),
        Buffer.from(tokenHeader),
      );
    } catch {
      authenticated = false;
    }
  } else if (authHeader?.startsWith("Bearer sk-ideon-")) {
    const rawKey = authHeader.slice(7);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const apiKey = await db
      .selectFrom("apiKeys")
      .select("id")
      .where("keyHash", "=", keyHash)
      .executeTakeFirst();
    if (apiKey) {
      authenticated = true;
      void db
        .updateTable("apiKeys")
        .set({ lastUsedAt: Date.now() })
        .where("id", "=", apiKey.id)
        .execute();
    }
  }

  if (!authenticated) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  // Extract event name from GitHub header or payload
  const githubEvent = req.headers["x-github-event"] as string | undefined;
  const action =
    typeof payload === "object" && payload !== null && "action" in payload
      ? (payload as Record<string, unknown>).action
      : undefined;
  const eventName = githubEvent
    ? `${githubEvent}${action ? `.${String(action)}` : ""}`
    : "*";

  // Check trigger event match
  if (rule.triggerEvent !== "*" && rule.triggerEvent !== eventName) {
    res.statusCode = 200;
    res.end("OK");
    return;
  }

  // Evaluate conditions
  const conditions = rule.conditions
    ? (JSON.parse(rule.conditions) as {
        field: string;
        op: "eq" | "neq" | "contains" | "exists" | "gt" | "lt" | "gte" | "lte";
        value?: unknown;
      }[])
    : [];

  const evalResult = evaluateConditionsDetailed(conditions, payload);
  if (!evalResult.passed) {
    await writeLog(ruleId, "skipped", payload, evalResult.reason);
    res.statusCode = 200;
    res.end("OK");
    return;
  }

  const logStatus = isTest ? "test" : "success";

  try {
    await applyAction(rule, payload, ldb);
    await syncAutomationStateToSql(rule, payload);
    await db
      .updateTable("automationRules")
      .set({ lastTriggeredAt: Date.now() })
      .where("id", "=", ruleId)
      .execute();
    await writeLog(ruleId, logStatus, payload);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await writeLog(ruleId, "error", payload, errorMsg);
  }

  res.statusCode = 200;
  res.end("OK");
}
