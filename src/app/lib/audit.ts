import { withAuthenticatedSession, getGlobalDb } from "./db";
import * as crypto from "crypto";
import { logger } from "./logger";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export async function logSecurityEvent(
  action: string,
  status: "success" | "failure",
  reqInfo: { userId?: string; ip?: string },
) {
  const effectiveUserId = reqInfo.userId || SYSTEM_USER_ID;

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
            ipAddress: reqInfo.ip || null,
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
