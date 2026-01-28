import { Kysely } from "kysely";
import { database } from "../../lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  await db.schema
    .alterTable("systemSettings")
    .addColumn("ssoRegistrationEnabled", "integer", (col) =>
      col.notNull().defaultTo(1),
    )
    .execute();
}

export async function down(db: Kysely<database>): Promise<void> {
  await db.schema
    .alterTable("systemSettings")
    .dropColumn("ssoRegistrationEnabled")
    .execute();
}
