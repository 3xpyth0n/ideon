import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS "sealedStates" (
      "id" TEXT PRIMARY KEY,
      "projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      "stateId" TEXT NOT NULL,
      "authorId" TEXT NOT NULL,
      "stateHash" TEXT NOT NULL,
      "summary" TEXT NOT NULL DEFAULT '',
      "createdAt" TEXT NOT NULL
    )
  `.execute(db);
  await sql`CREATE INDEX IF NOT EXISTS "sealedStates_projectId_createdAt_idx" ON "sealedStates"("projectId", "createdAt")`.execute(
    db,
  );
  await sql`CREATE INDEX IF NOT EXISTS "sealedStates_stateId_idx" ON "sealedStates"("stateId")`.execute(
    db,
  );

  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`ALTER TABLE "sealedStates" ENABLE ROW LEVEL SECURITY`.execute(db);
    await sql`ALTER TABLE "sealedStates" FORCE ROW LEVEL SECURITY`.execute(db);
    await sql`DROP POLICY IF EXISTS sealed_states_isolation ON "sealedStates"`.execute(
      db,
    );
    await sql`
      CREATE POLICY sealed_states_isolation ON "sealedStates"
      FOR ALL
      USING (
        "projectId" IN (
          SELECT id FROM get_accessible_project_ids(current_setting('app.current_user_id', true)::text)
        )
      )
      WITH CHECK (
        "authorId" = current_setting('app.current_user_id', true)::text
      )
    `.execute(db);
  }
}

export async function down(db: Kysely<database>): Promise<void> {
  await sql`DROP TABLE IF EXISTS "sealedStates"`.execute(db);
}
