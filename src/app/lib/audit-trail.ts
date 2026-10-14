// Any new write path to project state must call appendAuditEvent from this lib.
import { withAuthenticatedSession, getGlobalDb, getDb, getPool } from "./db";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "node:crypto";
import { logger } from "./logger";
import type { Kysely } from "kysely";
import type { database } from "./types/db";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export interface AuditEventInput {
  projectId: string | null;
  userId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface AuditEventRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  metadata: string;
  createdAt: string;
  userId: string | null;
  userEmail: string | null;
}

interface ChainEntry {
  id: string;
  projectId: string | null;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  metadata: string;
  prevHash: string | null;
  hash: string;
  createdAt: string;
}

// Single-process custom server: in-memory serialization per scope is sufficient
const scopeChains = new Map<string, Promise<void>>();

function canonicalAuditEvent(entry: {
  id: string;
  projectId: string | null;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  metadata: string;
  createdAt: string;
}): string {
  return JSON.stringify({
    action: entry.action,
    createdAt: entry.createdAt,
    entityId: entry.entityId,
    entityType: entry.entityType,
    id: entry.id,
    metadata: entry.metadata,
    projectId: entry.projectId,
    summary: entry.summary,
    userId: entry.userId,
  });
}

function computeEntryHash(prevHash: string, canonical: string): string {
  return createHash("sha256")
    .update(`${prevHash}|${canonical}`, "utf8")
    .digest("hex");
}

function genesisHash(scope: string): string {
  return `genesis:${scope}`;
}

function runSerialized(
  scope: string,
  task: () => Promise<void>,
): Promise<void> {
  const previous = scopeChains.get(scope) ?? Promise.resolve();
  const next = previous.then(task).catch((error) => {
    logger.error({ error, scope }, "Audit scope chain failed");
  });
  scopeChains.set(scope, next);
  return next;
}

async function readScopeHead(
  db: Kysely<database>,
  projectId: string | null,
): Promise<{ hash: string; createdAt: string } | null> {
  let query = db.selectFrom("auditEvents").select(["hash", "createdAt"]);
  query =
    projectId === null
      ? query.where("projectId", "is", null)
      : query.where("projectId", "=", projectId);
  const head = await query
    .orderBy("createdAt", "desc")
    .orderBy("id", "desc")
    .limit(1)
    .executeTakeFirst();
  return head ?? null;
}

// Chain order equals createdAt order: timestamps are strictly monotonic per scope,
// so bursts within the same millisecond keep a deterministic, verifiable sequence
function nextCreatedAt(head: { createdAt: string } | null): string {
  const now = new Date();
  if (head && Date.parse(head.createdAt) >= now.getTime()) {
    return new Date(Date.parse(head.createdAt) + 1).toISOString();
  }
  return now.toISOString();
}

export async function appendAuditEvent(input: AuditEventInput): Promise<void> {
  const scope = input.projectId ?? "global";
  const actorId = input.userId ?? SYSTEM_USER_ID;
  await runSerialized(scope, async () => {
    try {
      const id = uuidv4();
      const metadata = JSON.stringify(input.metadata ?? {});
      await withAuthenticatedSession(
        actorId,
        async (db) => {
          const head = await readScopeHead(db, input.projectId);
          const prevHash = head?.hash ?? null;
          const createdAt = nextCreatedAt(head);
          const canonical = canonicalAuditEvent({
            id,
            projectId: input.projectId,
            userId: actorId,
            action: input.action,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            summary: input.summary,
            metadata,
            createdAt,
          });
          const hash = computeEntryHash(
            prevHash ?? genesisHash(scope),
            canonical,
          );
          await db
            .insertInto("auditEvents")
            .values({
              id,
              projectId: input.projectId,
              userId: actorId,
              action: input.action,
              entityType: input.entityType ?? null,
              entityId: input.entityId ?? null,
              summary: input.summary,
              metadata,
              prevHash,
              hash,
              createdAt,
            })
            .execute();
        },
        getGlobalDb(),
      );
    } catch (error) {
      logger.error(
        { error, action: input.action, projectId: input.projectId },
        "Failed to append audit event",
      );
    }
  });
}

export async function verifyProjectChain(
  projectId: string,
): Promise<{ valid: boolean; entries: number; brokenAt: string | null }> {
  const scope = projectId;
  const pool = getPool();
  const entries: ChainEntry[] = pool
    ? (
        await pool.query<ChainEntry>(
          `SELECT id, "projectId", "userId", action, "entityType", "entityId", summary, metadata, "prevHash", hash, "createdAt"
           FROM "auditEvents"
           WHERE "projectId" = $1
           ORDER BY "createdAt" ASC, "id" ASC`,
          [projectId],
        )
      ).rows
    : await getDb()
        .selectFrom("auditEvents")
        .select([
          "id",
          "projectId",
          "userId",
          "action",
          "entityType",
          "entityId",
          "summary",
          "metadata",
          "prevHash",
          "hash",
          "createdAt",
        ])
        .where("projectId", "=", projectId)
        .orderBy("createdAt", "asc")
        .orderBy("id", "asc")
        .execute();

  let expectedPrev: string | null = null;
  for (const entry of entries) {
    const canonical = canonicalAuditEvent(entry);
    const expectedHash = computeEntryHash(
      entry.prevHash ?? genesisHash(scope),
      canonical,
    );
    if (entry.hash !== expectedHash || entry.prevHash !== expectedPrev) {
      return { valid: false, entries: entries.length, brokenAt: entry.id };
    }
    expectedPrev = entry.hash;
  }
  return { valid: true, entries: entries.length, brokenAt: null };
}

async function resolveCursorCreatedAt(
  projectId: string,
  beforeId: string,
): Promise<string | null> {
  const pool = getPool();
  if (pool) {
    const cursor = await pool.query<{ createdAt: string }>(
      `SELECT "createdAt" FROM "auditEvents" WHERE id = $1 AND "projectId" = $2`,
      [beforeId, projectId],
    );
    return cursor.rows[0]?.createdAt ?? null;
  }
  const cursor = await getDb()
    .selectFrom("auditEvents")
    .select("createdAt")
    .where("id", "=", beforeId)
    .where("projectId", "=", projectId)
    .executeTakeFirst();
  return cursor?.createdAt ?? null;
}

export async function getProjectAuditEvents(
  projectId: string,
  options: {
    limit: number;
    before?: string | null;
    action?: string | null;
    userId?: string | null;
  },
): Promise<{ events: AuditEventRow[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(options.limit, 1), 200);
  const pool = getPool();

  let rows: AuditEventRow[];
  if (pool) {
    const cursorCreatedAt = options.before
      ? await resolveCursorCreatedAt(projectId, options.before)
      : null;
    const result = await pool.query<AuditEventRow>(
      `SELECT e.id, e.action, e."entityType", e."entityId", e.summary, e.metadata, e."createdAt", e."userId", u.email AS "userEmail"
       FROM "auditEvents" e
       LEFT JOIN users u ON u.id = e."userId"
       WHERE e."projectId" = $1
         AND ($2::text IS NULL OR e.action = $2)
         AND ($3::text IS NULL OR e."userId" = $3)
         AND ($4::text IS NULL OR e."createdAt" < $4 OR (e."createdAt" = $4 AND e.id < $5))
       ORDER BY e."createdAt" DESC, e.id DESC
       LIMIT ${limit + 1}`,
      [
        projectId,
        options.action ?? null,
        options.userId ?? null,
        cursorCreatedAt,
        options.before ?? null,
      ],
    );
    rows = result.rows;
  } else {
    const cursorCreatedAt = options.before
      ? await resolveCursorCreatedAt(projectId, options.before)
      : null;
    let query = getDb()
      .selectFrom("auditEvents")
      .leftJoin("users", "users.id", "auditEvents.userId")
      .select([
        "auditEvents.id",
        "auditEvents.action",
        "auditEvents.entityType",
        "auditEvents.entityId",
        "auditEvents.summary",
        "auditEvents.metadata",
        "auditEvents.createdAt",
        "auditEvents.userId",
        "users.email as userEmail",
      ]);
    if (options.action) {
      query = query.where("auditEvents.action", "=", options.action);
    }
    if (options.userId) {
      query = query.where("auditEvents.userId", "=", options.userId);
    }
    if (cursorCreatedAt && options.before) {
      query = query.where((eb) =>
        eb.or([
          eb("auditEvents.createdAt", "<", cursorCreatedAt),
          eb.and([
            eb("auditEvents.createdAt", "=", cursorCreatedAt),
            eb("auditEvents.id", "<", options.before as string),
          ]),
        ]),
      );
    }
    rows = await query
      .orderBy("auditEvents.createdAt", "desc")
      .orderBy("auditEvents.id", "desc")
      .limit(limit + 1)
      .execute();
  }

  const hasMore = rows.length > limit;
  return { events: hasMore ? rows.slice(0, limit) : rows, hasMore };
}
