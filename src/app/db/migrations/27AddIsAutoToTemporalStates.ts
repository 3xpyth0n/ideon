import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`ALTER TABLE "temporalStates" ADD COLUMN "isAuto" integer NOT NULL DEFAULT 0`.execute(
      db,
    );
  } else {
    await db.schema
      .alterTable("temporalStates")
      .addColumn("isAuto", "integer", (col) => col.notNull().defaultTo(0))
      .execute();
  }
}

export async function down(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`ALTER TABLE "temporalStates" DROP COLUMN "isAuto"`.execute(db);
  } else {
    await db.schema.alterTable("temporalStates").dropColumn("isAuto").execute();
  }
}
