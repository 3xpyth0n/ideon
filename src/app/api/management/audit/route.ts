import { getDb } from "@lib/db";
import { adminAction } from "@lib/server-utils";

export const GET = adminAction(
  async () => {
    const db = getDb();
    const logs = await db
      .selectFrom("auditLogs")
      .leftJoin("users", "users.id", "auditLogs.userId")
      .select([
        "auditLogs.id",
        "auditLogs.action",
        "auditLogs.status",
        "auditLogs.ipAddress",
        "auditLogs.createdAt",
        "users.email as userEmail",
      ])
      .orderBy("auditLogs.createdAt", "desc")
      .limit(100)
      .execute();

    return logs;
  },
  { requireUser: true },
);
