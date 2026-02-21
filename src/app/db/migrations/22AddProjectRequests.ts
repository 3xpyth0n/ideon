import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await db.schema
      .createTable("projectRequests")
      .addColumn("id", "text", (col) =>
        col.primaryKey().defaultTo(sql`gen_random_uuid()::text`),
      )
      .addColumn("projectId", "text", (col) =>
        col.notNull().references("projects.id").onDelete("cascade"),
      )
      .addColumn("userId", "text", (col) =>
        col.notNull().references("users.id").onDelete("cascade"),
      )
      .addColumn("status", "text", (col) => col.notNull().defaultTo("pending")) // 'pending', 'rejected'
      .addColumn("createdAt", "text", (col) => col.notNull())
      .addUniqueConstraint("project_requests_unique", ["projectId", "userId"])
      .execute();

    // Enable RLS
    await sql`ALTER TABLE "projectRequests" ENABLE ROW LEVEL SECURITY`.execute(
      db,
    );

    // 1. SELECT Policy
    // Users can see their own requests
    // Project Owners can see requests for their projects
    await sql`
      CREATE POLICY project_requests_select ON "projectRequests" FOR SELECT
      USING (
        "userId" = current_setting('app.current_user_id', true)::text
        OR
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = "projectRequests"."projectId"
          AND projects."ownerId" = current_setting('app.current_user_id', true)::text
        )
      )
    `.execute(db);

    // 2. INSERT Policy
    // Authenticated users can create requests for themselves
    await sql`
      CREATE POLICY project_requests_insert ON "projectRequests" FOR INSERT
      WITH CHECK (
        "userId" = current_setting('app.current_user_id', true)::text
      )
    `.execute(db);

    // 3. UPDATE Policy
    // Project Owners can update status (e.g. reject)
    await sql`
      CREATE POLICY project_requests_update ON "projectRequests" FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = "projectRequests"."projectId"
          AND projects."ownerId" = current_setting('app.current_user_id', true)::text
        )
      )
    `.execute(db);

    // 4. DELETE Policy
    // Users can delete their own requests (cancel)
    // Project Owners can delete requests (approve/cleanup)
    await sql`
      CREATE POLICY project_requests_delete ON "projectRequests" FOR DELETE
      USING (
        "userId" = current_setting('app.current_user_id', true)::text
        OR
        EXISTS (
          SELECT 1 FROM projects
          WHERE projects.id = "projectRequests"."projectId"
          AND projects."ownerId" = current_setting('app.current_user_id', true)::text
        )
      )
    `.execute(db);
  } else {
    // SQLite Fallback (No RLS)
    await db.schema
      .createTable("projectRequests")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("projectId", "text", (col) =>
        col.notNull().references("projects.id").onDelete("cascade"),
      )
      .addColumn("userId", "text", (col) =>
        col.notNull().references("users.id").onDelete("cascade"),
      )
      .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
      .addColumn("createdAt", "text", (col) => col.notNull())
      .addUniqueConstraint("project_requests_unique", ["projectId", "userId"])
      .execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("projectRequests").execute();
}
