import { Kysely } from "kysely";
import { database } from "../../lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  await db.schema
    .createTable("linkPreviews")
    .ifNotExists()
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
}

export async function down(db: Kysely<database>): Promise<void> {
  await db.schema.dropTable("linkPreviews").execute();
}
