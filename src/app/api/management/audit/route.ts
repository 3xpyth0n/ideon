import { getDb, getPool } from "@lib/db";
import { adminAction } from "@lib/server-utils";

export const GET = adminAction(
  async () => {
    // Admin audit log must show ALL users' entries, not just the admin's own.
    // The auditLogs table has FORCE RLS with an `audit_logs_isolation` policy
    // that restricts SELECT to rows where userId = current_user_id.  Running
    // inside adminAction's withAuthenticatedSession means only the admin's own
    // rows would be visible.
    //
    // We bypass FORCE RLS intentionally here: access control is already
    // enforced at the route level by adminAction (role ≥ admin required).
    // A raw pool query runs as the `ideon` role which owns the table and is
    // exempt from RLS (FORCE RLS only applies to non-superuser roles that
    // have RLS enabled for them, not the table owner).
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
        `SELECT al.id, al.action, al.status, al."ipAddress", al."createdAt", u.email AS "userEmail"
         FROM "auditLogs" al
         LEFT JOIN users u ON u.id = al."userId"
         ORDER BY al."createdAt" DESC
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
