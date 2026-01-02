import { Migrator, MigrationProvider, Migration } from "kysely";
import { getDb } from "./db";
import { isBuildMode } from "./runtime";
import * as initialMigration from "../db/migrations/01InitialSchema";

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      "01InitialSchema": initialMigration,
    };
  }
}

export async function runMigrations() {
  if (isBuildMode()) {
    return { results: [] };
  }

  const db = getDb();
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider(),
    migrationTableName: "kyselyMigration",
    migrationLockTableName: "kyselyMigrationLock",
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(
        `[DB] Migration "${it.migrationName}" was executed successfully`,
      );
    } else if (it.status === "Error") {
      console.error(`[DB] Failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error("[DB] Failed to migrate");
    console.error(error);
    throw error;
  }

  return { error, results };
}
