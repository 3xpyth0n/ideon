import { Kysely, sql } from "kysely";
import { database } from "../../lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    // 1. Drop existing policies that cause recursion
    await sql`DROP POLICY IF EXISTS folders_select ON folders`.execute(db);
    await sql`DROP POLICY IF EXISTS folders_update ON folders`.execute(db);
    await sql`DROP POLICY IF EXISTS folder_collaborators_select ON "folderCollaborators"`.execute(db);
    await sql`DROP POLICY IF EXISTS folder_collaborators_write ON "folderCollaborators"`.execute(db);

    // 2. Create a SECURITY DEFINER function to check folder access
    // This bypasses RLS for the tables it queries because it runs with the privileges of the creator
    await sql`
      CREATE OR REPLACE FUNCTION check_folder_access(f_id text, u_id text)
      RETURNS boolean
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT EXISTS (
          SELECT 1 FROM folders WHERE id = f_id AND "ownerId" = u_id
          UNION
          SELECT 1 FROM "folderCollaborators" WHERE "folderId" = f_id AND "userId" = u_id
        );
      $$;
    `.execute(db);

    // 3. Re-create policies using the helper function
    
    // Folders SELECT: User is owner or has access via collaboration
    await sql`
      CREATE POLICY folders_select ON folders FOR SELECT
      USING (
        "ownerId" = current_setting('app.current_user_id', true)::text
        OR
        check_folder_access(id, current_setting('app.current_user_id', true)::text)
      )
    `.execute(db);

    // Folders UPDATE: Owner or Admin/Owner role in collaborators
    await sql`
      CREATE POLICY folders_update ON folders FOR UPDATE
      USING (
        "ownerId" = current_setting('app.current_user_id', true)::text
        OR
        EXISTS (
            SELECT 1 FROM "folderCollaborators"
            WHERE "folderCollaborators"."folderId" = folders.id
            AND "folderCollaborators"."userId" = current_setting('app.current_user_id', true)::text
            AND "folderCollaborators"."role" IN ('owner', 'admin')
        )
      )
    `.execute(db);

    // FolderCollaborators SELECT: User is in the folder or owner of the folder
    await sql`
      CREATE POLICY folder_collaborators_select ON "folderCollaborators" FOR SELECT
      USING (
        "userId" = current_setting('app.current_user_id', true)::text
        OR
        check_folder_access("folderId", current_setting('app.current_user_id', true)::text)
      )
    `.execute(db);

    // FolderCollaborators WRITE: Owner of the folder only
    await sql`
      CREATE POLICY folder_collaborators_write ON "folderCollaborators"
      USING (
        EXISTS (
          SELECT 1 FROM folders
          WHERE folders.id = "folderCollaborators"."folderId"
          AND folders."ownerId" = current_setting('app.current_user_id', true)::text
        )
      )
    `.execute(db);

    // 4. Update projects policies to include folder access
    // This fixes the missing folder-based access in RLS that was bypassed in 09Folders.ts
    await sql`DROP POLICY IF EXISTS projects_select ON projects`.execute(db);
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
        OR
        (
          "folderId" IS NOT NULL
          AND
          check_folder_access("folderId", current_setting('app.current_user_id', true)::text)
        )
      )
    `.execute(db);

    await sql`DROP POLICY IF EXISTS projects_update ON projects`.execute(db);
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
        OR
        (
          "folderId" IS NOT NULL
          AND
          check_folder_access("folderId", current_setting('app.current_user_id', true)::text)
        )
      )
    `.execute(db);

    await sql`DROP POLICY IF EXISTS projects_delete ON projects`.execute(db);
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
        OR
        (
          "folderId" IS NOT NULL
          AND
          check_folder_access("folderId", current_setting('app.current_user_id', true)::text)
        )
      )
    `.execute(db);

    // 5. Update Blocks, Links, and Snapshots policies
    // These must also account for folder-based access inherited from projects
    await sql`DROP POLICY IF EXISTS blocks_isolation ON blocks`.execute(db);
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
            OR
            (
              projects."folderId" IS NOT NULL
              AND
              check_folder_access(projects."folderId", current_setting('app.current_user_id', true)::text)
            )
          )
        )
      )
    `.execute(db);

    await sql`DROP POLICY IF EXISTS links_isolation ON links`.execute(db);
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
            OR
            (
              projects."folderId" IS NOT NULL
              AND
              check_folder_access(projects."folderId", current_setting('app.current_user_id', true)::text)
            )
          )
        )
      )
    `.execute(db);

    await sql`DROP POLICY IF EXISTS block_snapshots_isolation ON "blockSnapshots"`.execute(db);
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
            OR
            (
              projects."folderId" IS NOT NULL
              AND
              check_folder_access(projects."folderId", current_setting('app.current_user_id', true)::text)
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
    // Revert to the state in 09Folders.ts (though it was recursive, this is for completeness)
    await sql`DROP POLICY IF EXISTS folders_select ON folders`.execute(db);
    await sql`DROP POLICY IF EXISTS folders_update ON folders`.execute(db);
    await sql`DROP POLICY IF EXISTS folder_collaborators_select ON "folderCollaborators"`.execute(db);
    await sql`DROP POLICY IF EXISTS folder_collaborators_write ON "folderCollaborators"`.execute(db);
    await sql`DROP FUNCTION IF EXISTS check_folder_access(text, text)`.execute(db);

    await sql`
      CREATE POLICY folders_select ON folders FOR SELECT
      USING (
        "ownerId" = current_setting('app.current_user_id', true)::text
        OR
        EXISTS (
          SELECT 1 FROM "folderCollaborators"
          WHERE "folderCollaborators"."folderId" = folders.id
          AND "folderCollaborators"."userId" = current_setting('app.current_user_id', true)::text
        )
      )
    `.execute(db);

    await sql`
      CREATE POLICY folders_update ON folders FOR UPDATE
      USING (
        "ownerId" = current_setting('app.current_user_id', true)::text
        OR
        EXISTS (
            SELECT 1 FROM "folderCollaborators"
            WHERE "folderCollaborators"."folderId" = folders.id
            AND "folderCollaborators"."userId" = current_setting('app.current_user_id', true)::text
            AND "folderCollaborators"."role" IN ('owner', 'admin')
        )
      )
    `.execute(db);

    await sql`
      CREATE POLICY folder_collaborators_select ON "folderCollaborators" FOR SELECT
      USING (
        "userId" = current_setting('app.current_user_id', true)::text
        OR
        EXISTS (
          SELECT 1 FROM folders
          WHERE folders.id = "folderCollaborators"."folderId"
          AND folders."ownerId" = current_setting('app.current_user_id', true)::text
        )
        OR
        EXISTS (
            SELECT 1 FROM "folderCollaborators" as fc
            WHERE fc."folderId" = "folderCollaborators"."folderId"
            AND fc."userId" = current_setting('app.current_user_id', true)::text
        )
      )
    `.execute(db);

    await sql`
      CREATE POLICY folder_collaborators_write ON "folderCollaborators"
      USING (
        EXISTS (
          SELECT 1 FROM folders
          WHERE folders.id = "folderCollaborators"."folderId"
          AND folders."ownerId" = current_setting('app.current_user_id', true)::text
        )
      )
    `.execute(db);
  }
}
