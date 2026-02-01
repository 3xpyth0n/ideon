import { Kysely, sql } from "kysely";
import { database } from "../../lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    // 1. Drop existing policies on projects
    await sql`DROP POLICY IF EXISTS projects_isolation ON projects`.execute(db);
    await sql`DROP POLICY IF EXISTS projects_select ON projects`.execute(db);
    await sql`DROP POLICY IF EXISTS projects_insert ON projects`.execute(db);
    await sql`DROP POLICY IF EXISTS projects_update ON projects`.execute(db);
    await sql`DROP POLICY IF EXISTS projects_delete ON projects`.execute(db);

    // 3. Drop the recursive function
    await sql`DROP FUNCTION IF EXISTS get_accessible_project_ids(text) CASCADE`.execute(
      db,
    );

    // 3. Create a non-recursive, direct policy logic

    // SELECT: User is owner OR user is a collaborator
    await sql`
      CREATE POLICY projects_select ON projects FOR SELECT
      USING (
        "ownerId" = current_setting('app.current_user_id', true)::text
        OR
        EXISTS (
          SELECT 1 FROM "projectCollaborators"
          WHERE "projectCollaborators"."projectId" = projects.id
          AND "projectCollaborators"."userId" = current_setting('app.current_user_id', true)::text
        )
      )
    `.execute(db);

    // INSERT: Owner must be current user
    await sql`
      CREATE POLICY projects_insert ON projects FOR INSERT
      WITH CHECK (
        "ownerId" = current_setting('app.current_user_id', true)::text
      )
    `.execute(db);

    // UPDATE: User is owner OR user is a collaborator
    await sql`
      CREATE POLICY projects_update ON projects FOR UPDATE
      USING (
        "ownerId" = current_setting('app.current_user_id', true)::text
        OR
        EXISTS (
          SELECT 1 FROM "projectCollaborators"
          WHERE "projectCollaborators"."projectId" = projects.id
          AND "projectCollaborators"."userId" = current_setting('app.current_user_id', true)::text
        )
      )
    `.execute(db);

    await sql`
      CREATE POLICY projects_delete ON projects FOR DELETE
      USING (
        "ownerId" = current_setting('app.current_user_id', true)::text
        OR
        EXISTS (
          SELECT 1 FROM "projectCollaborators"
          WHERE "projectCollaborators"."projectId" = projects.id
          AND "projectCollaborators"."userId" = current_setting('app.current_user_id', true)::text
        )
      )
    `.execute(db);

    // 5. Update other tables that relied on get_accessible_project_ids

    // Update Blocks Policy (dropped above, now recreating)
    await sql`
      CREATE POLICY blocks_isolation ON blocks
      USING (
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = blocks."projectId"
          AND (
            projects."ownerId" = current_setting('app.current_user_id', true)::text
            OR
            EXISTS (
              SELECT 1 FROM "projectCollaborators"
              WHERE "projectCollaborators"."projectId" = projects.id
              AND "projectCollaborators"."userId" = current_setting('app.current_user_id', true)::text
            )
          )
        )
      )
    `.execute(db);

    // Update Links Policy (dropped above, now recreating)
    await sql`
      CREATE POLICY links_isolation ON links
      USING (
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = links."projectId"
          AND (
            projects."ownerId" = current_setting('app.current_user_id', true)::text
            OR
            EXISTS (
              SELECT 1 FROM "projectCollaborators"
              WHERE "projectCollaborators"."projectId" = projects.id
              AND "projectCollaborators"."userId" = current_setting('app.current_user_id', true)::text
            )
          )
        )
      )
    `.execute(db);

    // Update Block Snapshots Policy (dropped above, now recreating)
    await sql`
      CREATE POLICY block_snapshots_isolation ON "blockSnapshots"
      USING (
        EXISTS (
          SELECT 1 FROM blocks
          JOIN projects ON projects.id = blocks."projectId"
          WHERE blocks.id = "blockSnapshots"."blockId"
          AND (
            projects."ownerId" = current_setting('app.current_user_id', true)::text
            OR
            EXISTS (
              SELECT 1 FROM "projectCollaborators"
              WHERE "projectCollaborators"."projectId" = projects.id
              AND "projectCollaborators"."userId" = current_setting('app.current_user_id', true)::text
            )
          )
        )
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
    // Restore function
    await sql`
      CREATE OR REPLACE FUNCTION get_accessible_project_ids(user_id text)
      RETURNS TABLE (id text)
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT id FROM projects WHERE "ownerId" = user_id
        UNION
        SELECT "projectId" FROM "projectCollaborators" WHERE "userId" = user_id
      $$;
    `.execute(db);

    // Drop new policies
    await sql`DROP POLICY IF EXISTS projects_select ON projects`.execute(db);
    await sql`DROP POLICY IF EXISTS projects_insert ON projects`.execute(db);
    await sql`DROP POLICY IF EXISTS projects_update ON projects`.execute(db);
    await sql`DROP POLICY IF EXISTS projects_delete ON projects`.execute(db);

    // Restore old policies
    await sql`
      CREATE POLICY projects_isolation ON projects
      USING (
        id IN (SELECT id FROM get_accessible_project_ids(current_setting('app.current_user_id', true)::text))
      )
    `.execute(db);
  }
}
