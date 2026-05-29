import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`
      CREATE TABLE IF NOT EXISTS "apiKeys" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "name" TEXT NOT NULL,
        "keyHash" TEXT NOT NULL UNIQUE,
        "keyHint" TEXT NOT NULL,
        "lastUsedAt" BIGINT,
        "createdAt" BIGINT NOT NULL
      )
    `.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS "apiKeys_userId_idx" ON "apiKeys"("userId")`.execute(
      db,
    );
    await sql`CREATE INDEX IF NOT EXISTS "apiKeys_keyHash_idx" ON "apiKeys"("keyHash")`.execute(
      db,
    );
  } else {
    await sql`
      CREATE TABLE IF NOT EXISTS "apiKeys" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "name" TEXT NOT NULL,
        "keyHash" TEXT NOT NULL UNIQUE,
        "keyHint" TEXT NOT NULL,
        "lastUsedAt" INTEGER,
        "createdAt" INTEGER NOT NULL
      )
    `.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS "apiKeys_userId_idx" ON "apiKeys"("userId")`.execute(
      db,
    );
    await sql`CREATE INDEX IF NOT EXISTS "apiKeys_keyHash_idx" ON "apiKeys"("keyHash")`.execute(
      db,
    );
  }
}

export async function down(db: Kysely<database>): Promise<void> {
  await sql`DROP TABLE IF EXISTS "apiKeys"`.execute(db);
}
