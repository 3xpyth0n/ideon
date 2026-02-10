import { Kysely } from "kysely";
import { database } from "../../lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  await db.schema
    .alterTable("folders")
    .addColumn("isStarred", "integer", (col) => col.defaultTo(0))
    .execute();
}

export async function down(db: Kysely<database>): Promise<void> {
  await db.schema.alterTable("folders").dropColumn("isStarred").execute();
}
