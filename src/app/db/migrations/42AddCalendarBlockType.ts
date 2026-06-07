import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

const TYPES_WITH_CALENDAR = `'text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'kanban', 'sketch', 'shell', 'folder', 'vercel', 'frame', 'webhook', 'cron', 'latex', 'calendar'`;
const TYPES_WITHOUT_CALENDAR = `'text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'kanban', 'sketch', 'shell', 'folder', 'vercel', 'frame', 'webhook', 'cron', 'latex'`;

function buildBlocksTable(
  db: Kysely<database>,
  name: string,
  checkTypes: string,
) {
  return db.schema
    .createTable(name)
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("projectId", "text", (col) => col.notNull())
    .addColumn("blockType", "text", (col) =>
      col
        .notNull()
        .defaultTo("text")
        .check(sql.raw(`"blockType" IN (${checkTypes})`)),
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
}

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`ALTER TABLE blocks DROP CONSTRAINT IF EXISTS "blocks_blockType_check"`.execute(
      db,
    );
    await sql`ALTER TABLE blocks ADD CONSTRAINT "blocks_blockType_check" CHECK ("blockType" IN ('text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'kanban', 'sketch', 'shell', 'folder', 'vercel', 'frame', 'webhook', 'cron', 'latex', 'calendar'))`.execute(
      db,
    );
  } else {
    await sql`PRAGMA foreign_keys=OFF`.execute(db);
    await db.transaction().execute(async (trx) => {
      await buildBlocksTable(trx, "blocks_next", TYPES_WITH_CALENDAR);
      await sql`INSERT INTO blocks_next SELECT * FROM blocks`.execute(trx);
      await sql`DROP TABLE blocks`.execute(trx);
      await sql`ALTER TABLE blocks_next RENAME TO blocks`.execute(trx);
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
    await sql`ALTER TABLE blocks ADD CONSTRAINT "blocks_blockType_check" CHECK ("blockType" IN ('text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'kanban', 'sketch', 'shell', 'folder', 'vercel', 'frame', 'webhook', 'cron', 'latex'))`.execute(
      db,
    );
  } else {
    await sql`PRAGMA foreign_keys=OFF`.execute(db);
    await db.transaction().execute(async (trx) => {
      await buildBlocksTable(trx, "blocks_prev", TYPES_WITHOUT_CALENDAR);
      await sql`INSERT INTO blocks_prev SELECT * FROM blocks WHERE blockType != 'calendar'`.execute(
        trx,
      );
      await sql`DROP TABLE blocks`.execute(trx);
      await sql`ALTER TABLE blocks_prev RENAME TO blocks`.execute(trx);
    });
    await sql`PRAGMA foreign_keys=ON`.execute(db);
  }
}
