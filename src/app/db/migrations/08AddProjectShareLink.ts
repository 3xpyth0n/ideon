import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // SQLite limitation: split addColumn calls and avoid UNIQUE in addColumn
  await db.schema
    .alterTable("projects")
    .addColumn("shareToken", "text")
    .execute();

  await db.schema
    .alterTable("projects")
    .addColumn("shareEnabled", "integer", (col) => col.defaultTo(0))
    .execute();

  await db.schema
    .alterTable("projects")
    .addColumn("shareCreatedAt", "text")
    .execute();

  // Create unique index instead of unique column constraint
  await db.schema
    .createIndex("projects_share_token_index")
    .on("projects")
    .column("shareToken")
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("projects_share_token_index").execute();

  await db.schema.alterTable("projects").dropColumn("shareToken").execute();

  await db.schema.alterTable("projects").dropColumn("shareEnabled").execute();

  await db.schema.alterTable("projects").dropColumn("shareCreatedAt").execute();
}
