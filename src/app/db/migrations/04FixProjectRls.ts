import { Kysely, sql } from "kysely";
import { database } from "../../lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    // Drop the broken policy
    await sql`DROP POLICY IF EXISTS projects_isolation ON projects`.execute(db);

    // Re-create policies split by action to handle INSERT correctly

    // SELECT: Keep using the function (checks ownership or collaboration)
    await sql`
      CREATE POLICY projects_select ON projects FOR SELECT
      USING (
        id IN (SELECT id FROM get_accessible_project_ids(current_setting('app.current_user_id', true)::text))
      )
    `.execute(db);

    // INSERT: Check that the owner matches the current user
    await sql`
      CREATE POLICY projects_insert ON projects FOR INSERT
      WITH CHECK (
        "ownerId" = current_setting('app.current_user_id', true)::text
      )
    `.execute(db);

    // UPDATE: Check access via function
    await sql`
      CREATE POLICY projects_update ON projects FOR UPDATE
      USING (
        id IN (SELECT id FROM get_accessible_project_ids(current_setting('app.current_user_id', true)::text))
      )
    `.execute(db);

    // DELETE: Check access via function
    await sql`
      CREATE POLICY projects_delete ON projects FOR DELETE
      USING (
        id IN (SELECT id FROM get_accessible_project_ids(current_setting('app.current_user_id', true)::text))
      )
    `.execute(db);
  }
}

export async function down(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`DROP POLICY IF EXISTS projects_select ON projects`.execute(db);
    await sql`DROP POLICY IF EXISTS projects_insert ON projects`.execute(db);
    await sql`DROP POLICY IF EXISTS projects_update ON projects`.execute(db);
    await sql`DROP POLICY IF EXISTS projects_delete ON projects`.execute(db);

    // Restore original broken policy
    await sql`
      CREATE POLICY projects_isolation ON projects
      USING (
        id IN (SELECT id FROM get_accessible_project_ids(current_setting('app.current_user_id', true)::text))
      )
    `.execute(db);
  }
}
