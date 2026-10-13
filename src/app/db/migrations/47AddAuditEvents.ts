import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS "auditEvents" (
      "id" TEXT PRIMARY KEY,
      "projectId" TEXT,
      "userId" TEXT,
      "action" TEXT NOT NULL,
      "entityType" TEXT,
      "entityId" TEXT,
      "summary" TEXT NOT NULL,
      "metadata" TEXT NOT NULL DEFAULT '{}',
      "prevHash" TEXT,
      "hash" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL
    )
  `.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS "auditEvents_projectId_createdAt_idx" ON "auditEvents"("projectId", "createdAt")`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS "auditEvents_userId_createdAt_idx" ON "auditEvents"("userId", "createdAt")`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS "auditEvents_action_createdAt_idx" ON "auditEvents"("action", "createdAt")`.execute(
    db,
  );

  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`ALTER TABLE "auditEvents" ENABLE ROW LEVEL SECURITY`.execute(db);
    await sql`ALTER TABLE "auditEvents" FORCE ROW LEVEL SECURITY`.execute(db);
    await sql`DROP POLICY IF EXISTS audit_events_isolation ON "auditEvents"`.execute(
      db,
    );
    await sql`
      CREATE POLICY audit_events_isolation ON "auditEvents"
      FOR ALL
      USING (
        "projectId" IN (
          SELECT id FROM get_accessible_project_ids(current_setting('app.current_user_id', true)::text)
        )
      )
      WITH CHECK (
        "userId" = current_setting('app.current_user_id', true)::text
      )
    `.execute(db);
  }
}

export async function down(db: Kysely<database>): Promise<void> {
  await sql`DROP TABLE IF EXISTS "auditEvents"`.execute(db);
}
