import { Kysely, sql, Transaction } from "kysely";
import type { database } from "@lib/types/db";

const TYPES_WITH_KANBAN = `'text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'kanban', 'sketch', 'shell'`;
const TYPES_WITHOUT_KANBAN = `'text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'sketch', 'shell'`;

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`ALTER TABLE blocks DROP CONSTRAINT IF EXISTS "blocks_blockType_check"`.execute(
      db,
    );
    await sql`ALTER TABLE blocks ADD CONSTRAINT "blocks_blockType_check" CHECK ("blockType" IN ('text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'kanban', 'sketch', 'shell'))`.execute(
      db,
    );
  } else {
    await sql`PRAGMA foreign_keys=OFF`.execute(db);

    await db.transaction().execute(async (trx) => {
      await recreateBlocksTable(trx, TYPES_WITH_KANBAN);
      await recreateBlockSnapshotsTable(trx);
      await recreateLinkPreviewsTable(trx);
      await recreateBlockReactionsTable(trx);
    });

    await sql`PRAGMA foreign_keys=ON`.execute(db);
  }
}

export async function down(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`ALTER TABLE blocks DROP CONSTRAINT IF EXISTS "blocks_blockType_check"`.execute(
      db,
    );
    await sql`ALTER TABLE blocks ADD CONSTRAINT "blocks_blockType_check" CHECK ("blockType" IN ('text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'sketch', 'shell'))`.execute(
      db,
    );
  } else {
    await sql`PRAGMA foreign_keys=OFF`.execute(db);

    await db.transaction().execute(async (trx) => {
      await recreateBlocksTable(trx, TYPES_WITHOUT_KANBAN, true);
      await recreateBlockSnapshotsTable(trx);
      await recreateLinkPreviewsTable(trx);
      await recreateBlockReactionsTable(trx);
    });

    await sql`PRAGMA foreign_keys=ON`.execute(db);
  }
}

async function recreateBlocksTable(
  trx: Transaction<database>,
  blockTypeValues: string,
  excludeKanban = false,
) {
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
        .check(sql.raw(`"blockType" IN (${blockTypeValues})`)),
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

  if (excludeKanban) {
    await sql`INSERT INTO blocks SELECT * FROM blocks_old WHERE blockType != 'kanban'`.execute(
      trx,
    );
  } else {
    await sql`INSERT INTO blocks SELECT * FROM blocks_old`.execute(trx);
  }

  await sql`DROP TABLE blocks_old`.execute(trx);
}

async function recreateBlockSnapshotsTable(trx: Transaction<database>) {
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
