import { Kysely } from "kysely";
import { database } from "../../lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  await db.schema
    .alterTable("folders")
    .addColumn("deletedAt", "text")
    .execute();
}

export async function down(db: Kysely<database>): Promise<void> {
  await db.schema.alterTable("folders").dropColumn("deletedAt").execute();
}
