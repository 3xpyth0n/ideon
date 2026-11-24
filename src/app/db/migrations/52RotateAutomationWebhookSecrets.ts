import { randomBytes } from "crypto";
import { Kysely } from "kysely";
import type { database } from "@lib/types/db";

// Earlier versions copied webhook secrets into block metadata, which collaborators and share links can read
export async function up(db: Kysely<database>): Promise<void> {
  const rules = await db.selectFrom("automationRules").select("id").execute();

  for (const { id } of rules) {
    await db
      .updateTable("automationRules")
      .set({ webhookSecret: randomBytes(32).toString("hex") })
      .where("id", "=", id)
      .execute();
  }
}
