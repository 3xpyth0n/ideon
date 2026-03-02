import { Kysely, sql } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. projectCollaborators — missing RLS policies
  //
  // This table has ENABLE/FORCE ROW LEVEL SECURITY but zero policies, which
  // means every operation (SELECT, INSERT, UPDATE, DELETE) is denied by default
  // even for the project owner.  All other tables in this schema have explicit
  // policies; projectCollaborators was simply never given any.
  // -------------------------------------------------------------------------

  // SELECT: you may see a row if it belongs to you, you own the project,
  // or you are already a collaborator on the same project.
  await sql`
    CREATE POLICY project_collaborators_select ON "projectCollaborators" FOR SELECT
    USING (
      "userId" = current_setting('app.current_user_id', true)::text
      OR EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = "projectCollaborators"."projectId"
          AND projects."ownerId" = current_setting('app.current_user_id', true)::text
      )
      OR EXISTS (
        SELECT 1 FROM "projectCollaborators" AS pc
        WHERE pc."projectId" = "projectCollaborators"."projectId"
          AND pc."userId" = current_setting('app.current_user_id', true)::text
      )
    )
  `.execute(db);

  // INSERT / UPDATE / DELETE: only the project owner or an owner-role
  // collaborator may manage collaborators — mirrors the app-level role check
  // already enforced in the API route.
  await sql`
    CREATE POLICY project_collaborators_write ON "projectCollaborators"
    USING (
      EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = "projectCollaborators"."projectId"
          AND projects."ownerId" = current_setting('app.current_user_id', true)::text
      )
      OR EXISTS (
        SELECT 1 FROM "projectCollaborators" AS pc
        WHERE pc."projectId" = "projectCollaborators"."projectId"
          AND pc."userId" = current_setting('app.current_user_id', true)::text
          AND pc.role = 'owner'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id = "projectCollaborators"."projectId"
          AND projects."ownerId" = current_setting('app.current_user_id', true)::text
      )
      OR EXISTS (
        SELECT 1 FROM "projectCollaborators" AS pc
        WHERE pc."projectId" = "projectCollaborators"."projectId"
          AND pc."userId" = current_setting('app.current_user_id', true)::text
          AND pc.role = 'owner'
      )
    )
  `.execute(db);

  // -------------------------------------------------------------------------
  // 2. Share-link read policies for projects, blocks, and links
  //
  // The public share route (/api/projects/share/[token]) has no authenticated
  // user, so it cannot set app.current_user_id.  Instead it sets
  // app.share_token (via withShareTokenSession in db.ts).  These policies
  // allow SELECT on share-enabled rows when the token matches, without
  // requiring a user session.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP POLICY IF EXISTS project_collaborators_select ON "projectCollaborators"`.execute(db);
  await sql`DROP POLICY IF EXISTS project_collaborators_write ON "projectCollaborators"`.execute(db);
  await sql`DROP POLICY IF EXISTS projects_share_select ON projects`.execute(db);
  await sql`DROP POLICY IF EXISTS blocks_share_select ON blocks`.execute(db);
  await sql`DROP POLICY IF EXISTS links_share_select ON links`.execute(db);
}
