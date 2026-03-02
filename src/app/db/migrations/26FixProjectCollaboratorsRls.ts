import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`
      CREATE OR REPLACE FUNCTION check_project_owner(p_id text, u_id text)
      RETURNS boolean
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT
          p_id IS NOT NULL
          AND u_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM projects
            WHERE id = p_id
              AND "ownerId" = u_id
          );
      $$
    `.execute(db);

    // SELECT: own row OR project owner can see all collaborators
    await sql`
      CREATE POLICY project_collaborators_select
      ON "projectCollaborators" FOR SELECT
      USING (
        "userId" = current_setting('app.current_user_id', true)::text
        OR
        check_project_owner("projectId", current_setting('app.current_user_id', true)::text)
      )
    `.execute(db);

    // INSERT/UPDATE/DELETE: only project owner
    await sql`
      CREATE POLICY project_collaborators_write
      ON "projectCollaborators"
      USING (
        check_project_owner("projectId", current_setting('app.current_user_id', true)::text)
      )
      WITH CHECK (
        check_project_owner("projectId", current_setting('app.current_user_id', true)::text)
      )
    `.execute(db);

    // ── Share-link read policies ──
    // Allow public SELECT when app.share_token matches the project's shareToken.

    // Projects: read by share token
    await sql`
      CREATE POLICY projects_share_select
      ON projects FOR SELECT
      USING (
        "shareEnabled" = 1
        AND "shareToken" = current_setting('app.share_token', true)::text
      )
    `.execute(db);

    // Blocks: read when parent project is shared with matching token
    await sql`
      CREATE POLICY blocks_share_select
      ON blocks FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = blocks."projectId"
          AND projects."shareEnabled" = 1
          AND projects."shareToken" = current_setting('app.share_token', true)::text
        )
      )
    `.execute(db);

    // Links: read when parent project is shared with matching token
    await sql`
      CREATE POLICY links_share_select
      ON links FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = links."projectId"
          AND projects."shareEnabled" = 1
          AND projects."shareToken" = current_setting('app.share_token', true)::text
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
    await sql`DROP POLICY IF EXISTS project_collaborators_select ON "projectCollaborators"`.execute(
      db,
    );
    await sql`DROP POLICY IF EXISTS project_collaborators_write ON "projectCollaborators"`.execute(
      db,
    );
    await sql`DROP POLICY IF EXISTS projects_share_select ON projects`.execute(
      db,
    );
    await sql`DROP POLICY IF EXISTS blocks_share_select ON blocks`.execute(db);
    await sql`DROP POLICY IF EXISTS links_share_select ON links`.execute(db);
    await sql`DROP FUNCTION IF EXISTS check_project_owner(text, text)`.execute(
      db,
    );
  }
}
