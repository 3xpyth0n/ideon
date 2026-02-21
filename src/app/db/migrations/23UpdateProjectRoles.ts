import { Kysely } from "kysely";

interface MigrationDB {
  projectCollaborators: {
    role: string;
  };
}

export async function up(db: Kysely<MigrationDB>): Promise<void> {
  // 1. Update existing roles
  // Convert 'member' to 'editor'
  await db
    .updateTable("projectCollaborators")
    .set({ role: "editor" })
    .where("role", "=", "member")
    .execute();

  // Convert 'admin' to 'owner' (if any exist from previous versions)
  await db
    .updateTable("projectCollaborators")
    .set({ role: "owner" })
    .where("role", "=", "admin")
    .execute();
}

export async function down(db: Kysely<MigrationDB>): Promise<void> {
  // Revert 'editor' to 'member'
  await db
    .updateTable("projectCollaborators")
    .set({ role: "member" })
    .where("role", "=", "editor")
    .execute();

  // Revert 'owner' to 'admin'
  await db
    .updateTable("projectCollaborators")
    .set({ role: "admin" })
    .where("role", "=", "owner")
    .execute();
}
