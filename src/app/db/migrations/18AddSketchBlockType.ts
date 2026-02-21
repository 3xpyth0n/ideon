import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`ALTER TABLE blocks DROP CONSTRAINT IF EXISTS "blocks_blockType_check"`.execute(
      db,
    );
    await sql`ALTER TABLE blocks ADD CONSTRAINT "blocks_blockType_check" CHECK ("blockType" IN ('text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'sketch'))`.execute(
      db,
    );
  } else {
    // In SQLite, we have to recreate the table to change a CHECK constraint
    await sql`PRAGMA foreign_keys=OFF`.execute(db);

    await db.transaction().execute(async (trx) => {
      // 1. Rename existing table
      await sql`ALTER TABLE blocks RENAME TO blocks_old`.execute(trx);

      // 2. Create new table with updated CHECK constraint
      await trx.schema
        .createTable("blocks")
        .addColumn("id", "text", (col) => col.primaryKey())
        .addColumn("projectId", "text", (col) => col.notNull())
        .addColumn("blockType", "text", (col) =>
          col
            .notNull()
            .defaultTo("text")
            .check(
              sql`"blockType" IN ('text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist', 'sketch')`,
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

      // 3. Copy data
      await sql`INSERT INTO blocks SELECT * FROM blocks_old`.execute(trx);

      // 4. Drop old table
      await sql`DROP TABLE blocks_old`.execute(trx);
    });

    await sql`PRAGMA foreign_keys=ON`.execute(db);
  }
}

export async function down(db: Kysely<database>): Promise<void> {
  // Revert logic (removing 'sketch' from constraint)
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`ALTER TABLE blocks DROP CONSTRAINT IF EXISTS "blocks_blockType_check"`.execute(
      db,
    );
    await sql`ALTER TABLE blocks ADD CONSTRAINT "blocks_blockType_check" CHECK ("blockType" IN ('text', 'link', 'file', 'core', 'github', 'palette', 'contact', 'video', 'snippet', 'checklist'))`.execute(
      db,
    );
  } else {
    await sql`PRAGMA foreign_keys=OFF`.execute(db);
    await db.transaction().execute(async (trx) => {
      await sql`ALTER TABLE blocks RENAME TO blocks_old`.execute(trx);
      await trx.schema
        .createTable("blocks")
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
      await sql`INSERT INTO blocks SELECT * FROM blocks_old WHERE blockType != 'sketch'`.execute(
        trx,
      );
      await sql`DROP TABLE blocks_old`.execute(trx);
    });
    await sql`PRAGMA foreign_keys=ON`.execute(db);
  }
}
