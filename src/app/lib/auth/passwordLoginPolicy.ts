import type { Kysely } from "kysely";
import type { database } from "../types/db";

export async function isPasswordLoginEnabled(
  db: Kysely<database>,
): Promise<boolean> {
  const settings = await db
    .selectFrom("systemSettings")
    .select("passwordLoginEnabled")
    .executeTakeFirst();
  return settings ? !!settings.passwordLoginEnabled : true;
}
