import { Kysely } from "kysely";
import type { database } from "../../lib/types/db.ts";

export async function up(db: Kysely<database>): Promise<void> {
  // Create userGitTokens table
  await db.schema
    .createTable("userGitTokens")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("userId", "text", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("provider", "text", (col) => col.notNull()) // github, gitlab, gitea, etc.
    .addColumn("host", "text", (col) => col.notNull()) // github.com, gitlab.com, etc.
    .addColumn("token", "text", (col) => col.notNull()) // Encrypted token
    .addColumn("enabled", "integer", (col) => col.notNull().defaultTo(1)) // 0 or 1
    .addColumn("createdAt", "text", (col) => col.notNull())
    .addColumn("updatedAt", "text", (col) => col.notNull())
    .execute();

  // Create unique index on userId + host
  await db.schema
    .createIndex("userGitTokens_userId_host_unique")
    .on("userGitTokens")
    .columns(["userId", "host"])
    .unique()
    .execute();
}

export async function down(db: Kysely<database>): Promise<void> {
  await db.schema.dropTable("userGitTokens").execute();
}
