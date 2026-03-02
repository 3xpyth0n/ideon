import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (!isPostgres) return;

  // -------------------------------------------------------------------------
  // 1. projectCollaborators — missing RLS policies
  //
  // This table has ENABLE/FORCE ROW LEVEL SECURITY but zero policies (since
  // migration 01), which means every operation is denied by default even for
  // the project owner.  All other tables in this schema have explicit policies;
  // projectCollaborators was simply never given any.
  //
  // The naive fix — adding policies whose USING clause queries `projects` —
  // creates infinite recursion: the existing projects_select/update/delete
  // policies already do `EXISTS (SELECT 1 FROM "projectCollaborators" ...)`,
  // so any policy on projectCollaborators that references projects triggers
  // projects_select, which re-triggers the projectCollaborators policy, etc.
  //
  // The proven fix in this codebase (see migration 15 for folders) is a
  // SECURITY DEFINER helper function owned by the table owner (`ideon`).
  // PostgreSQL does not re-apply RLS policies on tables accessed inside a
  // SECURITY DEFINER function when the function owner is the table owner,
  // even when FORCE ROW LEVEL SECURITY is set.  This cleanly breaks the
  // mutual-recursion cycle.
  // -------------------------------------------------------------------------

  // 1a. Helper function: check whether a user owns a project.
  //     SECURITY DEFINER + owned by `ideon` (table owner) → no RLS on the
  //     inner SELECT, so querying this from a projectCollaborators policy does
  //     NOT re-enter the projects_select policy.
  await sql`
    CREATE OR REPLACE FUNCTION check_project_owner(p_project_id text, p_user_id text)
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT EXISTS (
        SELECT 1 FROM projects
        WHERE id = p_project_id
          AND "ownerId" = p_user_id
      )
    $$
  `.execute(db);

  // 1b. SELECT: a user may see a collaborator row if it is their own row, or
  //     if they own the project (so the owner can list all collaborators).
  await sql`
    CREATE POLICY project_collaborators_select ON "projectCollaborators" FOR SELECT
    USING (
      "userId" = current_setting('app.current_user_id', true)::text
      OR check_project_owner(
           "projectId",
           current_setting('app.current_user_id', true)::text
         )
    )
  `.execute(db);

  // 1c. INSERT / UPDATE / DELETE: only the project owner may manage
  //     collaborators.  App-level role checks (in server-utils.ts projectAction)
  //     additionally enforce that owner-role collaborators can also manage
  //     members — the DB policy enforces the minimum safety floor.
  await sql`
    CREATE POLICY project_collaborators_write ON "projectCollaborators"
    USING (
      check_project_owner(
        "projectId",
        current_setting('app.current_user_id', true)::text
      )
    )
    WITH CHECK (
      check_project_owner(
        "projectId",
        current_setting('app.current_user_id', true)::text
      )
    )
  `.execute(db);

  // -------------------------------------------------------------------------
  // 2. Share-link read policies for projects, blocks, and links
  //
  // The public share page (/share/[token]) and API route
  // (/api/projects/share/[token]) have no authenticated user, so they cannot
  // set app.current_user_id.  Instead they set app.share_token via
  // withShareTokenSession() in db.ts.  These policies allow SELECT on
  // share-enabled rows when the token matches, without requiring a user session.
  //
  // blocks_share_select and links_share_select reference `projects` in a
  // sub-SELECT, but that does NOT cause recursion: the subquery evaluates
  // projects_share_select (simple token comparison, no further joins) and
  // projects_select (ownerId/collaborator checks, returns false for anonymous
  // requests — harmless because PERMISSIVE policies OR together).
  // -------------------------------------------------------------------------

  await sql`
    CREATE POLICY projects_share_select ON projects FOR SELECT
    USING (
      "shareEnabled" = 1
      AND "shareToken" IS NOT NULL
      AND "shareToken" = current_setting('app.share_token', true)::text
    )
  `.execute(db);

  await sql`
    CREATE POLICY blocks_share_select ON blocks FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = blocks."projectId"
          AND projects."shareEnabled" = 1
          AND projects."shareToken" IS NOT NULL
          AND projects."shareToken" = current_setting('app.share_token', true)::text
      )
    )
  `.execute(db);

  await sql`
    CREATE POLICY links_share_select ON links FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = links."projectId"
          AND projects."shareEnabled" = 1
          AND projects."shareToken" IS NOT NULL
          AND projects."shareToken" = current_setting('app.share_token', true)::text
      )
    )
  `.execute(db);
}

export async function down(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (!isPostgres) return;

  await sql`DROP POLICY IF EXISTS project_collaborators_select ON "projectCollaborators"`.execute(db);
  await sql`DROP POLICY IF EXISTS project_collaborators_write ON "projectCollaborators"`.execute(db);
  await sql`DROP FUNCTION IF EXISTS check_project_owner(text, text)`.execute(db);
  await sql`DROP POLICY IF EXISTS projects_share_select ON projects`.execute(db);
  await sql`DROP POLICY IF EXISTS blocks_share_select ON blocks`.execute(db);
  await sql`DROP POLICY IF EXISTS links_share_select ON links`.execute(db);
}
