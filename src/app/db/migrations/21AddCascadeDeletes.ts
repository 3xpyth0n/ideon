import { Kysely, sql, Transaction } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    // Postgres: Add ON DELETE CASCADE constraints
    await addCascadeConstraint(db, "blocks", "projectId", "projects", "id");
    // blocks.parentBlockId -> blocks.id
    await addCascadeConstraint(db, "blocks", "parentBlockId", "blocks", "id");

    await addCascadeConstraint(db, "links", "projectId", "projects", "id");
    await addCascadeConstraint(
      db,
      "projectCollaborators",
      "projectId",
      "projects",
      "id",
    );
    await addCascadeConstraint(
      db,
      "projectStars",
      "projectId",
      "projects",
      "id",
    );
    await addCascadeConstraint(
      db,
      "temporalStates",
      "projectId",
      "projects",
      "id",
    );

    // projects -> folders
    await addCascadeConstraint(db, "projects", "folderId", "folders", "id");

    // folderCollaborators -> folders
    await addCascadeConstraint(
      db,
      "folderCollaborators",
      "folderId",
      "folders",
      "id",
    );

    // blockSnapshots -> blocks
    await addCascadeConstraint(db, "blockSnapshots", "blockId", "blocks", "id");

    // linkPreviews -> blocks
    await addCascadeConstraint(db, "linkPreviews", "blockId", "blocks", "id");

    // blockReactions -> blocks
    await addCascadeConstraint(db, "blockReactions", "blockId", "blocks", "id");
  } else {
    // SQLite: Recreate tables with ON DELETE CASCADE
    // We must handle FKs off/on to avoid issues during recreation
    await sql`PRAGMA foreign_keys=OFF`.execute(db);

    await db.transaction().execute(async (trx) => {
      // 1. projects (folderId cascade)
      await recreateProjectsTable(trx);

      // 2. blocks (projectId cascade, parentBlockId cascade)
      await recreateBlocksTable(trx);

      // 3. links (projectId cascade)
      await recreateLinksTable(trx);

      // 4. projectCollaborators (projectId cascade)
      await recreateProjectCollaboratorsTable(trx);

      // 5. projectStars (projectId cascade)
      await recreateProjectStarsTable(trx);

      // 6. temporalStates (projectId cascade)
      await recreateTemporalStatesTable(trx);

      // 7. folderCollaborators (folderId cascade)
      await recreateFolderCollaboratorsTable(trx);

      // 8. blockSnapshots (blockId cascade)
      await recreateBlockSnapshotsTable(trx);

      // 9. linkPreviews (blockId cascade)
      await recreateLinkPreviewsTable(trx);

      // 10. blockReactions (blockId cascade)
      await recreateBlockReactionsTable(trx);
    });

    await sql`PRAGMA foreign_keys=ON`.execute(db);
  }
}

async function addCascadeConstraint(
  db: Kysely<database>,
  table: string,
  column: string,
  refTable: string,
  refColumn: string,
) {
  const constraintName = `${table}_${column}_fkey`;

  // 1. Clean up orphaned records to avoid FK violation
  await sql`
    DELETE FROM ${sql.table(table)}
    WHERE ${sql.ref(column)} IS NOT NULL
    AND ${sql.ref(column)} NOT IN (SELECT ${sql.ref(
      refColumn,
    )} FROM ${sql.table(refTable)})
  `.execute(db);

  // 2. Drop existing constraint safely using raw SQL to avoid transaction abortion
  await sql`ALTER TABLE ${sql.table(table)} DROP CONSTRAINT IF EXISTS ${sql.id(
    constraintName,
  )}`.execute(db);

  // 3. Add new constraint with CASCADE
  await db.schema
    .alterTable(table)
    .addForeignKeyConstraint(constraintName, [column], refTable, [refColumn])
    .onDelete("cascade")
    .execute();
}

// SQLite Recreation Helpers

async function cleanupOrphansTrx(
  trx: Transaction<database>,
  table: string,
  column: string,
  refTable: string,
  refColumn: string,
) {
  await sql`
    DELETE FROM ${sql.table(table)}
    WHERE ${sql.ref(column)} IS NOT NULL
    AND ${sql.ref(column)} NOT IN (SELECT ${sql.ref(
      refColumn,
    )} FROM ${sql.table(refTable)})
  `.execute(trx);
}

async function recreateProjectsTable(trx: Transaction<database>) {
  await cleanupOrphansTrx(trx, "projects", "folderId", "folders", "id");
  await sql`ALTER TABLE projects RENAME TO projects_old`.execute(trx);

  await trx.schema
    .createTable("projects")
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
    .addColumn("deletedAt", "text") // 06
    .addColumn("lastOpenedAt", "text") // 07
    .addColumn("shareToken", "text") // 08
    .addColumn("shareEnabled", "integer", (col) => col.defaultTo(0)) // 08
    .addColumn("shareCreatedAt", "text") // 08
    .addColumn("folderId", "text", (col) =>
      col.references("folders.id").onDelete("cascade"),
    ) // 09 + cascade
    .execute();

  // Create index from 08
  // Check if index exists before creating it (to handle re-runs or test environments)
  const indexExists = await sql`
    SELECT 1 FROM sqlite_master
    WHERE type='index' AND name='projects_share_token_index'
  `
    .execute(trx)
    .then((r) => r.rows.length > 0);

  if (!indexExists) {
    await trx.schema
      .createIndex("projects_share_token_index")
      .on("projects")
      .column("shareToken")
      .unique()
      .execute();
  }

  // Copy data
  await sql`INSERT INTO projects SELECT * FROM projects_old`.execute(trx);
  await sql`DROP TABLE projects_old`.execute(trx);
}

async function recreateBlocksTable(trx: Transaction<database>) {
  await cleanupOrphansTrx(trx, "blocks", "projectId", "projects", "id");
  await cleanupOrphansTrx(trx, "blocks", "parentBlockId", "blocks", "id");
  await sql`ALTER TABLE blocks RENAME TO blocks_old`.execute(trx);

  await trx.schema
    .createTable("blocks")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("projectId", "text", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("blockType", "text", (col) =>
      col
        .notNull()
        .defaultTo("text")
        .check(
          sql`"blockType" IN ('text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'sketch')`,
        ),
    )
    .addColumn("metadata", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("parentBlockId", "text", (col) =>
      col.references("blocks.id").onDelete("cascade"),
    )
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

  await sql`INSERT INTO blocks SELECT * FROM blocks_old`.execute(trx);
  await sql`DROP TABLE blocks_old`.execute(trx);
}

async function recreateLinksTable(trx: Transaction<database>) {
  await cleanupOrphansTrx(trx, "links", "projectId", "projects", "id");
  await sql`ALTER TABLE links RENAME TO links_old`.execute(trx);

  await trx.schema
    .createTable("links")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("projectId", "text", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
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
    .addColumn("label", "text") // 19
    .execute();

  await sql`INSERT INTO links SELECT * FROM links_old`.execute(trx);
  await sql`DROP TABLE links_old`.execute(trx);
}

async function recreateProjectCollaboratorsTable(trx: Transaction<database>) {
  await cleanupOrphansTrx(
    trx,
    "projectCollaborators",
    "projectId",
    "projects",
    "id",
  );
  await sql`ALTER TABLE "projectCollaborators" RENAME TO "projectCollaborators_old"`.execute(
    trx,
  );

  await trx.schema
    .createTable("projectCollaborators")
    .addColumn("projectId", "text", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("userId", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull().defaultTo("editor"))
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint("projectUserPk", ["projectId", "userId"])
    .execute();

  await sql`INSERT INTO "projectCollaborators" SELECT * FROM "projectCollaborators_old"`.execute(
    trx,
  );
  await sql`DROP TABLE "projectCollaborators_old"`.execute(trx);
}

async function recreateProjectStarsTable(trx: Transaction<database>) {
  await cleanupOrphansTrx(trx, "projectStars", "projectId", "projects", "id");
  await sql`ALTER TABLE "projectStars" RENAME TO "projectStars_old"`.execute(
    trx,
  );

  await trx.schema
    .createTable("projectStars")
    .addColumn("projectId", "text", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("userId", "text", (col) => col.notNull())
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint("projectStarsPk", ["projectId", "userId"])
    .execute();

  await sql`INSERT INTO "projectStars" SELECT * FROM "projectStars_old"`.execute(
    trx,
  );
  await sql`DROP TABLE "projectStars_old"`.execute(trx);
}

async function recreateTemporalStatesTable(trx: Transaction<database>) {
  await cleanupOrphansTrx(trx, "temporalStates", "projectId", "projects", "id");
  await sql`ALTER TABLE "temporalStates" RENAME TO "temporalStates_old"`.execute(
    trx,
  );

  await trx.schema
    .createTable("temporalStates")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("projectId", "text", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("parentId", "text")
    .addColumn("authorId", "text", (col) => col.notNull())
    .addColumn("intent", "text", (col) => col.notNull())
    .addColumn("diff", "text", (col) => col.notNull())
    .addColumn("isSnapshot", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("timestamp", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await sql`INSERT INTO "temporalStates" SELECT * FROM "temporalStates_old"`.execute(
    trx,
  );
  await sql`DROP TABLE "temporalStates_old"`.execute(trx);
}

async function recreateFolderCollaboratorsTable(trx: Transaction<database>) {
  await cleanupOrphansTrx(
    trx,
    "folderCollaborators",
    "folderId",
    "folders",
    "id",
  );
  await sql`ALTER TABLE "folderCollaborators" RENAME TO "folderCollaborators_old"`.execute(
    trx,
  );

  await trx.schema
    .createTable("folderCollaborators")
    .addColumn("folderId", "text", (col) =>
      col.notNull().references("folders.id").onDelete("cascade"),
    )
    .addColumn("userId", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull().defaultTo("editor"))
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint("folderUserPk", ["folderId", "userId"])
    .execute();

  await sql`INSERT INTO "folderCollaborators" SELECT * FROM "folderCollaborators_old"`.execute(
    trx,
  );
  await sql`DROP TABLE "folderCollaborators_old"`.execute(trx);
}

async function recreateBlockSnapshotsTable(trx: Transaction<database>) {
  await cleanupOrphansTrx(trx, "blockSnapshots", "blockId", "blocks", "id");
  await sql`ALTER TABLE "blockSnapshots" RENAME TO "blockSnapshots_old"`.execute(
    trx,
  );

  await trx.schema
    .createTable("blockSnapshots")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("blockId", "text", (col) =>
      col.notNull().references("blocks.id").onDelete("cascade"),
    )
    .addColumn("label", "text")
    .addColumn("data", "text", (col) => col.notNull())
    .addColumn("createdAt", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await sql`INSERT INTO "blockSnapshots" SELECT * FROM "blockSnapshots_old"`.execute(
    trx,
  );
  await sql`DROP TABLE "blockSnapshots_old"`.execute(trx);
}

async function recreateLinkPreviewsTable(trx: Transaction<database>) {
  await cleanupOrphansTrx(trx, "linkPreviews", "blockId", "blocks", "id");
  await sql`ALTER TABLE "linkPreviews" RENAME TO "linkPreviews_old"`.execute(
    trx,
  );

  await trx.schema
    .createTable("linkPreviews")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("blockId", "text", (col) =>
      col.notNull().references("blocks.id").onDelete("cascade"),
    )
    .addColumn("url", "text", (col) => col.notNull())
    .addColumn("title", "text")
    .addColumn("description", "text")
    .addColumn("imageUrl", "text")
    .addColumn("imageStoragePath", "text")
    .addColumn("fetchedAt", "timestamp")
    .execute();

  await sql`INSERT INTO "linkPreviews" SELECT * FROM "linkPreviews_old"`.execute(
    trx,
  );
  await sql`DROP TABLE "linkPreviews_old"`.execute(trx);
}

async function recreateBlockReactionsTable(trx: Transaction<database>) {
  await cleanupOrphansTrx(trx, "blockReactions", "blockId", "blocks", "id");
  await cleanupOrphansTrx(trx, "blockReactions", "userId", "users", "id");
  await sql`ALTER TABLE "blockReactions" RENAME TO "blockReactions_old"`.execute(
    trx,
  );

  await trx.schema
    .createTable("blockReactions")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("blockId", "text", (col) =>
      col.notNull().references("blocks.id").onDelete("cascade"),
    )
    .addColumn("userId", "text", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("emoji", "text", (col) => col.notNull())
    .addColumn("createdAt", "text", (col) => col.notNull())
    .execute();

  await sql`INSERT INTO "blockReactions" SELECT * FROM "blockReactions_old"`.execute(
    trx,
  );
  await sql`DROP TABLE "blockReactions_old"`.execute(trx);
}

export async function down(): Promise<void> {
  // Irreversible
}
