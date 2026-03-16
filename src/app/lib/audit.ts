import {
  withAuthenticatedSession,
  getGlobalDb,
  isInAuthenticatedSession,
  getDb,
} from "./db";
import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger";
import type { Kysely } from "kysely";
import type { database } from "./types/db";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

async function insertAuditLog(
  db: Kysely<database>,
  userId: string,
  action: string,
  status: "success" | "failure",
  ip: string | null,
  metadata: Record<string, unknown>,
) {
  await db
    .insertInto("auditLogs")
    .values({
      id: uuidv4(),
      userId,
      action,
      status,
      ipAddress: ip || null,
      metadata: JSON.stringify(metadata),
      createdAt: new Date().toISOString(),
    })
    .execute();
}

export async function logSecurityEvent(
  action: string,
  status: "success" | "failure",
  reqInfo: { userId?: string; ip?: string; [key: string]: unknown },
) {
  const { userId, ip = null, ...metadata } = reqInfo;
  const effectiveUserId = userId || SYSTEM_USER_ID;

  try {
    if (isInAuthenticatedSession()) {
      const db = getDb();
      await insertAuditLog(db, effectiveUserId, action, status, ip, metadata);
    } else {
      await withAuthenticatedSession(
        effectiveUserId,
        async (db) => {
          await insertAuditLog(
            db,
            effectiveUserId,
            action,
            status,
            ip,
            metadata,
          );
        },
        getGlobalDb(),
      );
    }
  } catch (e) {
    logger.error({ error: e, action, status }, "Failed to log security event");
  }
}
