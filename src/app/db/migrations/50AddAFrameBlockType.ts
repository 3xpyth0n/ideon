import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

const BLOCK_TYPES = [
  "text",
  "link",
  "file",
  "core",
  "github",
  "palette",
  "contact",
  "video",
  "snippet",
  "checklist",
  "kanban",
  "sketch",
  "shell",
  "folder",
  "vercel",
  "frame",
  "webhook",
  "cron",
  "latex",
  "mermaid",
  "calendar",
  "subcanvas",
  "database",
  "aframe",
] as const;

function buildCheckTypes(withoutAframe: boolean): string {
  const types = withoutAframe
    ? BLOCK_TYPES.filter((t) => t !== "aframe")
    : BLOCK_TYPES;
  return types.map((t) => `'${t}'`).join(", ");
}

function buildBlocksTable(
  db: Kysely<database>,
  name: string,
  checkTypes: string,
) {
  return db.schema
    .createTable(name)
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("projectId", "text", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("blockType", "text", (col) =>
      col
        .notNull()
        .defaultTo("text")
        .check(sql.raw(`"blockType" IN (${checkTypes})`)),
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
    await sql`ALTER TABLE blocks ADD CONSTRAINT "blocks_blockType_check" CHECK ("blockType" IN (${sql.raw(
      buildCheckTypes(false),
    )}))`.execute(db);
    return;
  }

  await sql`PRAGMA foreign_keys=OFF`.execute(db);
  try {
    await db.transaction().execute(async (trx) => {
      await buildBlocksTable(trx, "blocks_next", buildCheckTypes(false));
      await sql`INSERT INTO blocks_next SELECT * FROM blocks`.execute(trx);
      await sql`DROP TABLE blocks`.execute(trx);
      await sql`ALTER TABLE blocks_next RENAME TO blocks`.execute(trx);
    });
  } finally {
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
    await sql`ALTER TABLE blocks ADD CONSTRAINT "blocks_blockType_check" CHECK ("blockType" IN (${sql.raw(
      buildCheckTypes(true),
    )}))`.execute(db);
    return;
  }

  await sql`PRAGMA foreign_keys=OFF`.execute(db);
  try {
    await db.transaction().execute(async (trx) => {
      await buildBlocksTable(trx, "blocks_prev", buildCheckTypes(true));
      const aframeCount =
        await sql`SELECT COUNT(*) as count FROM blocks WHERE blockType = 'aframe'`.execute(
          trx,
        );
      if (
        Number((aframeCount.rows[0] as Record<string, unknown>)?.count ?? 0) > 0
      ) {
        throw new Error(
          "Cannot rollback 3D Scene block type migration: 3D scene (aframe) blocks exist. Back up or delete them first.",
        );
      }
      await sql`INSERT INTO blocks_prev SELECT * FROM blocks`.execute(trx);
      await sql`DROP TABLE blocks`.execute(trx);
      await sql`ALTER TABLE blocks_prev RENAME TO blocks`.execute(trx);
    });
  } finally {
    await sql`PRAGMA foreign_keys=ON`.execute(db);
  }
}
