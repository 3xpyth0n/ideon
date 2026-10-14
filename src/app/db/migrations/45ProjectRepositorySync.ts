import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  await db.schema
    .createTable("projectRepositorySyncs")
    .addColumn("projectId", "text", (column) =>
      column.primaryKey().references("projects.id").onDelete("cascade"),
    )
    .addColumn("remoteProjectId", "text", (column) => column.notNull())
    .addColumn("repositoryUrl", "text")
    .addColumn("repositoryUsername", "text")
    .addColumn("branch", "text")
    .addColumn("repositoryPath", "text", (column) =>
      column.notNull().defaultTo(""),
    )
    .addColumn("lastSyncedCommit", "text")
    .addColumn("baseManifest", "text")
    .addColumn("blockIdMap", "text", (column) =>
      column.notNull().defaultTo("{}"),
    )
    .addColumn("linkIdMap", "text", (column) =>
      column.notNull().defaultTo("{}"),
    )
    .addColumn("updatedAt", "text", (column) => column.notNull())
    .execute();

  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`ALTER TABLE "projectRepositorySyncs" ENABLE ROW LEVEL SECURITY`.execute(
      db,
    );
    await sql`
      CREATE POLICY project_repository_sync_owner_access
      ON "projectRepositorySyncs"
      USING (
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = "projectRepositorySyncs"."projectId"
            AND projects."ownerId" = current_setting('app.current_user_id', true)::text
        )
        OR EXISTS (
          SELECT 1 FROM "projectCollaborators"
          WHERE "projectCollaborators"."projectId" = "projectRepositorySyncs"."projectId"
            AND "projectCollaborators"."userId" = current_setting('app.current_user_id', true)::text
            AND "projectCollaborators"."role" = 'owner'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = "projectRepositorySyncs"."projectId"
            AND projects."ownerId" = current_setting('app.current_user_id', true)::text
        )
        OR EXISTS (
          SELECT 1 FROM "projectCollaborators"
          WHERE "projectCollaborators"."projectId" = "projectRepositorySyncs"."projectId"
            AND "projectCollaborators"."userId" = current_setting('app.current_user_id', true)::text
            AND "projectCollaborators"."role" = 'owner'
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
    await sql`DROP POLICY IF EXISTS project_repository_sync_owner_access ON "projectRepositorySyncs"`.execute(
      db,
    );
  }

  await db.schema.dropTable("projectRepositorySyncs").execute();
}
