import { Kysely } from "kysely";
import type { database } from "@lib/types/db";

export async function up(db: Kysely<database>): Promise<void> {
  // Invalidate all existing tokens because we are switching to hashed storage.
  await db.deleteFrom("invitations").execute();
  await db.deleteFrom("passwordResets").execute();
  await db.deleteFrom("magicLinks").execute();
}

export async function down(): Promise<void> {
  // Data deletion is irreversible
}
