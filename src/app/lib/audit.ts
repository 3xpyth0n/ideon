import { getDb } from "./db";
import * as crypto from "crypto";

export async function logSecurityEvent(
  action: string,
  status: "success" | "failure",
  reqInfo: { userId?: string; ip?: string },
) {
  const db = getDb();
  try {
    await db
      .insertInto("auditLogs")
      .values({
        id: crypto.randomUUID(),
        userId: reqInfo.userId || null,
        action,
        status,
        ipAddress: reqInfo.ip || null,
        createdAt: new Date().toISOString(),
      })
      .execute();
  } catch (e) {
    console.error("Failed to log security event:", e);
  }
}
