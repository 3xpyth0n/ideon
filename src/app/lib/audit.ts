import { withAuthenticatedSession, getGlobalDb } from "./db";
import * as crypto from "crypto";
import { logger } from "./logger";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export async function logSecurityEvent(
  action: string,
  status: "success" | "failure",
  reqInfo: { userId?: string; ip?: string; [key: string]: unknown },
) {
  const { userId, ip, ...metadata } = reqInfo;
  const effectiveUserId = userId || SYSTEM_USER_ID;

  try {
    await withAuthenticatedSession(
      effectiveUserId,
      async (db) => {
        await db
          .insertInto("auditLogs")
          .values({
            id: crypto.randomUUID(),
            userId: effectiveUserId,
            action,
            status,
            ipAddress: ip || null,
            metadata: JSON.stringify(metadata),
            createdAt: new Date().toISOString(),
          })
          .execute();
      },
      getGlobalDb(),
    );
  } catch (e) {
    logger.error({ error: e, action, status }, "Failed to log security event");
  }
}
