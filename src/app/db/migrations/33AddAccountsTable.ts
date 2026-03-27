import { Kysely } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  await db.schema
    .createTable("accounts")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("userId", "text", (col) =>
      col.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("providerAccountId", "text", (col) => col.notNull())
    .addColumn("accessToken", "text")
    .addColumn("refreshToken", "text")
    .addColumn("expiresAt", "bigint")
    .addColumn("scope", "text")
    .addColumn("createdAt", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("accounts_provider_providerAccountId_unique")
    .on("accounts")
    .columns(["provider", "providerAccountId"])
    .unique()
    .execute();
}

export async function down(db: Kysely<database>): Promise<void> {
  await db.schema
    .dropIndex("accounts_provider_providerAccountId_unique")
    .ifExists()
    .execute();
  await db.schema.dropTable("accounts").ifExists().execute();
}
