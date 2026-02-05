import { Kysely } from "kysely";
import { database } from "../../lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  await db.schema
    .alterTable("projects")
    .addColumn("lastOpenedAt", "text")
    .execute();
}

export async function down(db: Kysely<database>): Promise<void> {
  await db.schema.alterTable("projects").dropColumn("lastOpenedAt").execute();
}
