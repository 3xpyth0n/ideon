import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

const ALL_TYPES = `'text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'sketch', 'shell'`;
const PREV_TYPES = `'text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'sketch'`;

async function isPostgres(db: Kysely<database>): Promise<boolean> {
  return sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);
}

function createBlocksTable(db: Kysely<database>, checkTypes: string) {
  return db.schema
    .createTable("blocks")
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
  if (await isPostgres(db)) {
    await sql`ALTER TABLE blocks DROP CONSTRAINT IF EXISTS "blocks_blockType_check"`.execute(
      db,
    );
    await sql
      .raw(
        `ALTER TABLE blocks ADD CONSTRAINT "blocks_blockType_check" CHECK ("blockType" IN (${ALL_TYPES}))`,
      )
      .execute(db);
  } else {
    await sql`PRAGMA foreign_keys=OFF`.execute(db);
    await db.transaction().execute(async (trx) => {
      await sql`ALTER TABLE blocks RENAME TO blocks_old`.execute(trx);
      await createBlocksTable(trx, ALL_TYPES);
      await sql`INSERT INTO blocks SELECT * FROM blocks_old`.execute(trx);
      await sql`DROP TABLE blocks_old`.execute(trx);
    });
    await sql`PRAGMA foreign_keys=ON`.execute(db);
  }
}

export async function down(db: Kysely<database>): Promise<void> {
  if (await isPostgres(db)) {
    await sql`ALTER TABLE blocks DROP CONSTRAINT IF EXISTS "blocks_blockType_check"`.execute(
      db,
    );
    await sql
      .raw(
        `ALTER TABLE blocks ADD CONSTRAINT "blocks_blockType_check" CHECK ("blockType" IN (${PREV_TYPES}))`,
      )
      .execute(db);
  } else {
    await sql`PRAGMA foreign_keys=OFF`.execute(db);
    await db.transaction().execute(async (trx) => {
      await sql`ALTER TABLE blocks RENAME TO blocks_old`.execute(trx);
      await createBlocksTable(trx, PREV_TYPES);
      await sql`INSERT INTO blocks SELECT * FROM blocks_old WHERE blockType != 'shell'`.execute(
        trx,
      );
      await sql`DROP TABLE blocks_old`.execute(trx);
    });
    await sql`PRAGMA foreign_keys=ON`.execute(db);
  }
}
