import { Kysely, sql } from "kysely";
import type { database } from "../../lib/types/db.ts";

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  // Add deletedAt to projects
  await db.schema
    .alterTable("projects")
    .addColumn("deletedAt", "text")
    .execute();

  // Create projectStars table
  await db.schema
    .createTable("projectStars")
    .ifNotExists()
    .addColumn("projectId", "text", (col) => col.notNull())
    .addColumn("userId", "text", (col) => col.notNull())
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint("projectStarsPk", ["projectId", "userId"])
    .execute();

  if (isPostgres) {
    // Enable RLS for projectStars
    await sql`ALTER TABLE "projectStars" ENABLE ROW LEVEL SECURITY`.execute(db);
    await sql`ALTER TABLE "projectStars" FORCE ROW LEVEL SECURITY`.execute(db);

    // RLS Policies for projectStars
    // SELECT: Users can see their own stars
    await sql`
      CREATE POLICY project_stars_isolation ON "projectStars"
      USING (
        "userId" = current_setting('app.current_user_id', true)::text
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
    await sql`DROP POLICY IF EXISTS project_stars_isolation ON "projectStars"`.execute(
      db,
    );
  }

  await db.schema.dropTable("projectStars").execute();
  await db.schema.alterTable("projects").dropColumn("deletedAt").execute();
}
