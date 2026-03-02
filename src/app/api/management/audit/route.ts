import { getDb, getPool } from "@lib/db";
import { adminAction } from "@lib/server-utils";

export const GET = adminAction(
  async () => {
    // Bypass FORCE RLS so admins can see all audit entries (not just their own).
    const pool = getPool();
    if (pool) {
      const result = await pool.query<{
        id: string;
        action: string;
        status: string;
        ipAddress: string | null;
        createdAt: string;
        userEmail: string | null;
      }>(
        `SELECT a.id, a.action, a.status, a."ipAddress", a."createdAt", u.email AS "userEmail"
         FROM "auditLogs" a
         LEFT JOIN users u ON u.id = a."userId"
         ORDER BY a."createdAt" DESC
         LIMIT 100`,
      );
      return result.rows;
    }

    // SQLite fallback (no RLS)
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
