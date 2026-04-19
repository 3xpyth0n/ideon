import { Kysely } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  await db.schema
    .alterTable("folders")
    .addColumn("parentFolderId", "text")
    .execute();

  await db.schema
    .createIndex("folders_parentFolderId_idx")
    .on("folders")
    .column("parentFolderId")
    .execute();
}

export async function down(db: Kysely<database>): Promise<void> {
  await db.schema.dropIndex("folders_parentFolderId_idx").ifExists().execute();
  await db.schema.alterTable("folders").dropColumn("parentFolderId").execute();
}
