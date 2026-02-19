import { Kysely } from "kysely";
import type { database } from "../../lib/types/db.ts";

export async function up(db: Kysely<database>): Promise<void> {
  await db.schema.alterTable("links").addColumn("label", "text").execute();

  await db.schema
    .createTable("blockReactions")
    .ifNotExists()
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
}

export async function down(db: Kysely<database>): Promise<void> {
  await db.schema.dropTable("blockReactions").execute();
  await db.schema.alterTable("links").dropColumn("label").execute();
}
