import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  await sql`DROP TABLE IF EXISTS "jackson_ttl"`.execute(db);
  await sql`DROP TABLE IF EXISTS "jackson_index"`.execute(db);
  await sql`DROP TABLE IF EXISTS "jackson_store"`.execute(db);

  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`UPDATE "systemSettings" SET "authProvidersJson" = ("authProvidersJson"::jsonb - 'saml')::text WHERE "authProvidersJson" LIKE '%"saml"%'`.execute(
      db,
    );
  } else {
    await sql`UPDATE "systemSettings" SET "authProvidersJson" = json_remove("authProvidersJson", '$.saml') WHERE "authProvidersJson" LIKE '%"saml"%'`.execute(
      db,
    );
  }
}
