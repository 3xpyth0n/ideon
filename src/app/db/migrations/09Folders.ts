import { Kysely, sql } from "kysely";
import type { database } from "../../lib/types/db.ts";

export async function up(db: Kysely<database>): Promise<void> {
  // 1. Create Folders table
  await db.schema
    .createTable("folders")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("ownerId", "text", (col) => col.notNull())
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // 2. Create Folder Collaborators table
  await db.schema
    .createTable("folderCollaborators")
    .ifNotExists()
    .addColumn("folderId", "text", (col) => col.notNull())
    .addColumn("userId", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull().defaultTo("editor"))
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint("folderUserPk", ["folderId", "userId"])
    .execute();

  // 3. Add folderId to Projects
  await db.schema
    .alterTable("projects")
    .addColumn("folderId", "text")
    .execute();

  // 4. Update RLS Function to include folder permissions
  // This is the core logic: a project is accessible if:
  // - You own it
  // - You are a direct collaborator
  // - You own the folder it's in
  // - You are a collaborator on the folder it's in

  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    // Enable RLS on new tables
    await sql`ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY`.execute(db);
    await sql`ALTER TABLE "folders" FORCE ROW LEVEL SECURITY`.execute(db);

    await sql`ALTER TABLE "folderCollaborators" ENABLE ROW LEVEL SECURITY`.execute(
      db,
    );
    await sql`ALTER TABLE "folderCollaborators" FORCE ROW LEVEL SECURITY`.execute(
      db,
    );

    // Update the get_accessible_project_ids function
    await sql`
      CREATE OR REPLACE FUNCTION get_accessible_project_ids(user_id text)
      RETURNS TABLE (id text)
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $$
        -- 1. Direct Ownership
        SELECT id FROM projects WHERE "ownerId" = user_id
        UNION
        -- 2. Direct Collaboration
        SELECT "projectId" FROM "projectCollaborators" WHERE "userId" = user_id
        UNION
        -- 3. Folder Ownership or Collaboration (Inheritance)
        SELECT id FROM projects
        WHERE "folderId" IN (
            SELECT id FROM folders WHERE "ownerId" = user_id
            UNION
            SELECT "folderId" FROM "folderCollaborators" WHERE "userId" = user_id
        )
      $$;
    `.execute(db);

    // Create Policies for Folders
    // Select: Owner or Collaborator
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

    // Insert: Only authenticated users (implicit in app logic, but good for DB)
    await sql`
      CREATE POLICY folders_insert ON folders FOR INSERT
      WITH CHECK (
        "ownerId" = current_setting('app.current_user_id', true)::text
      )
    `.execute(db);

    // Update: Owner only (simplification for now, or maybe editors too? Sticking to owner for structure)
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

    // Delete: Owner only
    await sql`
      CREATE POLICY folders_delete ON folders FOR DELETE
      USING (
        "ownerId" = current_setting('app.current_user_id', true)::text
      )
    `.execute(db);

    // Create Policies for FolderCollaborators
    // Visible if you are in the folder or owner of the folder
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

    // Insert/Delete/Update collaborators: Owner of the folder only
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

export async function down(db: Kysely<database>): Promise<void> {
  // Revert logic would go here, but for this task we assume forward roll only
  await db.schema.alterTable("projects").dropColumn("folderId").execute();
  await db.schema.dropTable("folderCollaborators").execute();
  await db.schema.dropTable("folders").execute();
}
