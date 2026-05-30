import { Kysely, sql } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (!isPostgres) return;

  await sql`ALTER TABLE "automationRules" ALTER COLUMN "createdAt" TYPE bigint USING "createdAt"::bigint`.execute(
    db,
  );
  await sql`ALTER TABLE "automationRules" ALTER COLUMN "lastTriggeredAt" TYPE bigint USING "lastTriggeredAt"::bigint`.execute(
    db,
  );
  await sql`ALTER TABLE "automationLogs" ALTER COLUMN "appliedAt" TYPE bigint USING "appliedAt"::bigint`.execute(
    db,
  );
  await sql`ALTER TABLE "blockAutomationStates" ALTER COLUMN "lastUpdated" TYPE bigint USING "lastUpdated"::bigint`.execute(
    db,
  );
}

export async function down(db: Kysely<database>): Promise<void> {
  const isPostgres = await sql`SELECT version()`
    .execute(db)
    .then(() => true)
    .catch(() => false);

  if (!isPostgres) return;

  await sql`ALTER TABLE "automationRules" ALTER COLUMN "createdAt" TYPE integer USING "createdAt"::integer`.execute(
    db,
  );
  await sql`ALTER TABLE "automationRules" ALTER COLUMN "lastTriggeredAt" TYPE integer USING "lastTriggeredAt"::integer`.execute(
    db,
  );
  await sql`ALTER TABLE "automationLogs" ALTER COLUMN "appliedAt" TYPE integer USING "appliedAt"::integer`.execute(
    db,
  );
  await sql`ALTER TABLE "blockAutomationStates" ALTER COLUMN "lastUpdated" TYPE integer USING "lastUpdated"::integer`.execute(
    db,
  );
}
