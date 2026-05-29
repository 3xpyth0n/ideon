import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`ALTER TABLE "automationRules" RENAME COLUMN "stateDecayHours" TO "stateDecayMinutes"`.execute(
      db,
    );
    await sql`UPDATE "automationRules" SET "stateDecayMinutes" = "stateDecayMinutes" * 60`.execute(
      db,
    );
  } else {
    await sql`ALTER TABLE "automationRules" RENAME COLUMN "stateDecayHours" TO "stateDecayMinutes"`.execute(
      db,
    );
    await sql`UPDATE "automationRules" SET "stateDecayMinutes" = "stateDecayMinutes" * 60`.execute(
      db,
    );
  }
}

export async function down(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (isPostgres) {
    await sql`UPDATE "automationRules" SET "stateDecayMinutes" = "stateDecayMinutes" / 60`.execute(
      db,
    );
    await sql`ALTER TABLE "automationRules" RENAME COLUMN "stateDecayMinutes" TO "stateDecayHours"`.execute(
      db,
    );
  } else {
    await sql`UPDATE "automationRules" SET "stateDecayMinutes" = "stateDecayMinutes" / 60`.execute(
      db,
    );
    await sql`ALTER TABLE "automationRules" RENAME COLUMN "stateDecayMinutes" TO "stateDecayHours"`.execute(
      db,
    );
  }
}
