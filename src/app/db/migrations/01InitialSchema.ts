import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  // Users
  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("username", "text")
    .addColumn("displayName", "text")
    .addColumn("avatarUrl", "text")
    .addColumn("color", "text")
    .addColumn("passwordHash", "text")
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("lastOnline", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("invitedByUserId", "text")
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Projects
  await db.schema
    .createTable("projects")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("ownerId", "text", (col) => col.notNull())
    .addColumn("currentStateId", "text")
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Temporal States
  await db.schema
    .createTable("temporalStates")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("projectId", "text", (col) => col.notNull())
    .addColumn("parentId", "text")
    .addColumn("authorId", "text", (col) => col.notNull())
    .addColumn("intent", "text", (col) => col.notNull())
    .addColumn("diff", "text", (col) => col.notNull())
    .addColumn("isSnapshot", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("timestamp", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Blocks (Visual Project OS items: text, links, files)
  await db.schema
    .createTable("blocks")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("projectId", "text", (col) => col.notNull())
    .addColumn("blockType", "text", (col) =>
      col
        .notNull()
        .defaultTo("text")
        .check(
          sql`"blockType" IN ('text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist')`,
        ),
    )
    .addColumn("metadata", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("parentBlockId", "text")
    .addColumn("positionX", "real", (col) => col.notNull())
    .addColumn("positionY", "real", (col) => col.notNull())
    .addColumn("ownerId", "text", (col) => col.notNull())
    .addColumn("content", "text")
    .addColumn("data", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("width", "real")
    .addColumn("height", "real")
    .addColumn("selected", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Links (Consolidated from Edges and previous Links)
  await db.schema
    .createTable("links")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("projectId", "text", (col) => col.notNull())
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("target", "text", (col) => col.notNull())
    .addColumn("sourceHandle", "text")
    .addColumn("targetHandle", "text")
    .addColumn("type", "text")
    .addColumn("animated", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("sourceX", "real")
    .addColumn("sourceY", "real")
    .addColumn("targetX", "real")
    .addColumn("targetY", "real")
    .addColumn("sourceOrientation", "text")
    .addColumn("targetOrientation", "text")
    .addColumn("data", "text")
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Sessions
  await db.schema
    .createTable("sessions")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("userId", "text", (col) => col.notNull())
    .addColumn("expiresAt", "bigint", (col) => col.notNull())
    .execute();

  // Email Verifications
  await db.schema
    .createTable("emailVerifications")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("userId", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("code", "text", (col) => col.notNull())
    .addColumn("expiresAt", "bigint", (col) => col.notNull())
    .execute();

  // Block Snapshots
  await db.schema
    .createTable("blockSnapshots")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("blockId", "text", (col) => col.notNull())
    .addColumn("label", "text")
    .addColumn("data", "text", (col) => col.notNull())
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Project Collaborators
  await db.schema
    .createTable("projectCollaborators")
    .ifNotExists()
    .addColumn("projectId", "text", (col) => col.notNull())
    .addColumn("userId", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull().defaultTo("editor"))
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint("projectUserPk", ["projectId", "userId"])
    .execute();

  // System Settings
  await db.schema
    .createTable("systemSettings")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("installed", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("publicRegistrationEnabled", "integer", (col) =>
      col.notNull().defaultTo(1),
    )
    .addColumn("passwordLoginEnabled", "integer", (col) =>
      col.notNull().defaultTo(1),
    )
    .addColumn("authProvidersJson", "text", (col) =>
      col.notNull().defaultTo("{}"),
    )
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Invitations
  await db.schema
    .createTable("invitations")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("token", "text", (col) => col.notNull().unique())
    .addColumn("role", "text", (col) => col.notNull().defaultTo("member"))
    .addColumn("invitedBy", "text", (col) => col.notNull())
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("expiresAt", "text", (col) => col.notNull())
    .addColumn("acceptedAt", "text")
    .execute();

  // Audit Logs
  await db.schema
    .createTable("auditLogs")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("userId", "text")
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("metadata", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("ipAddress", "text")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Password Resets
  await db.schema
    .createTable("passwordResets")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("userId", "text", (col) => col.notNull())
    .addColumn("token", "text", (col) => col.notNull().unique())
    .addColumn("expiresAt", "bigint", (col) => col.notNull())
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Magic Links
  await db.schema
    .createTable("magicLinks")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("token", "text", (col) => col.notNull().unique())
    .addColumn("expiresAt", "text", (col) => col.notNull())
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Rate Limits (for production rate limiting)
  await db.schema
    .createTable("rateLimits")
    .ifNotExists()
    .addColumn("key", "text", (col) => col.primaryKey())
    .addColumn("points", "integer", (col) => col.notNull())
    .addColumn("expire", "bigint", (col) => col.notNull())
    .execute();

  // GitHub Repo Stats (Cache & History)
  await db.schema
    .createTable("githubRepoStats")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("url", "text", (col) => col.notNull())
    .addColumn("owner", "text", (col) => col.notNull())
    .addColumn("repo", "text", (col) => col.notNull())
    .addColumn("data", "text", (col) => col.notNull()) // JSON blob
    .addColumn("fetchedAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Index for fast lookups by URL
  await db.schema
    .createIndex("githubRepoStats_url_index")
    .ifNotExists()
    .on("githubRepoStats")
    .column("url")
    .execute();

  // RLS Implementation (Postgres only)
  // We detect Postgres by checking if we can run a version() query (SQLite uses sqlite_version())
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    // Enable RLS on tables
    await sql`ALTER TABLE users ENABLE ROW LEVEL SECURITY`.execute(db);
    // Use FORCE for sensitive project data to ensure even the Table Owner (App) is restricted
    await sql`ALTER TABLE projects ENABLE ROW LEVEL SECURITY`.execute(db);
    await sql`ALTER TABLE projects FORCE ROW LEVEL SECURITY`.execute(db);

    await sql`ALTER TABLE blocks ENABLE ROW LEVEL SECURITY`.execute(db);
    await sql`ALTER TABLE blocks FORCE ROW LEVEL SECURITY`.execute(db);

    await sql`ALTER TABLE links ENABLE ROW LEVEL SECURITY`.execute(db);
    await sql`ALTER TABLE links FORCE ROW LEVEL SECURITY`.execute(db);

    await sql`ALTER TABLE "blockSnapshots" ENABLE ROW LEVEL SECURITY`.execute(
      db,
    );
    await sql`ALTER TABLE "blockSnapshots" FORCE ROW LEVEL SECURITY`.execute(
      db,
    );

    await sql`ALTER TABLE "auditLogs" ENABLE ROW LEVEL SECURITY`.execute(db);
    await sql`ALTER TABLE "auditLogs" FORCE ROW LEVEL SECURITY`.execute(db);

    await sql`ALTER TABLE "projectCollaborators" ENABLE ROW LEVEL SECURITY`.execute(
      db,
    );
    await sql`ALTER TABLE "projectCollaborators" FORCE ROW LEVEL SECURITY`.execute(
      db,
    );

    // Create helper function to avoid recursion and simplify policies
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

    // Users Policy
    await sql`
      CREATE POLICY users_isolation ON users
      USING (id = current_setting('app.current_user_id', true)::text)
    `.execute(db);

    // Projects Policy
    await sql`
      CREATE POLICY projects_isolation ON projects
      USING (
        id IN (SELECT id FROM get_accessible_project_ids(current_setting('app.current_user_id', true)::text))
      )
    `.execute(db);

    // Blocks Policy
    await sql`
      CREATE POLICY blocks_isolation ON blocks
      USING (
        "projectId" IN (SELECT id FROM get_accessible_project_ids(current_setting('app.current_user_id', true)::text))
      )
    `.execute(db);

    // Links Policy
    await sql`
      CREATE POLICY links_isolation ON links
      USING (
        "projectId" IN (SELECT id FROM get_accessible_project_ids(current_setting('app.current_user_id', true)::text))
      )
    `.execute(db);

    // Block Snapshots Policy
    await sql`
      CREATE POLICY block_snapshots_isolation ON "blockSnapshots"
      USING (
        "blockId" IN (
          SELECT id FROM blocks
          WHERE "projectId" IN (SELECT id FROM get_accessible_project_ids(current_setting('app.current_user_id', true)::text))
        )
      )
    `.execute(db);

    // Audit Logs Policy
    await sql`
      CREATE POLICY audit_logs_isolation ON "auditLogs"
      USING (
        "userId" = current_setting('app.current_user_id', true)::text
      )
    `.execute(db);
  }
}

export async function down(db: Kysely<database>): Promise<void> {
  await db.schema.dropTable("githubRepoStats").ifExists().execute();
  await db.schema.dropTable("rateLimits").ifExists().execute();
  await db.schema.dropTable("temporalStates").ifExists().execute();
  await db.schema.dropTable("magicLinks").ifExists().execute();
  await db.schema.dropTable("auditLogs").ifExists().execute();
  await db.schema.dropTable("invitations").ifExists().execute();
  await db.schema.dropTable("systemSettings").ifExists().execute();
  await db.schema.dropTable("projectCollaborators").ifExists().execute();
  await db.schema.dropTable("blockSnapshots").ifExists().execute();
  await db.schema.dropTable("passwordResets").ifExists().execute();
  await db.schema.dropTable("emailVerifications").ifExists().execute();
  await db.schema.dropTable("sessions").ifExists().execute();
  await db.schema.dropTable("links").ifExists().execute();
  await db.schema.dropTable("blocks").ifExists().execute();
  await db.schema.dropTable("projects").ifExists().execute();
  await db.schema.dropTable("users").ifExists().execute();
}
