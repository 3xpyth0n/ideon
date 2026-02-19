import { Migrator, FileMigrationProvider } from "kysely";
import { getDb } from "./db";
import { isBuildMode } from "./runtime";
import { logger } from "./logger";
import { promises as fs } from "fs";
import * as path from "path";

export async function runMigrations() {
  if (isBuildMode() && !process.env.VITEST) {
    return { results: [] };
  }

  const db = getDb();
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(process.cwd(), "src/app/db/migrations"),
    }),
    migrationTableName: "kyselyMigration",
    migrationLockTableName: "kyselyMigrationLock",
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      if (!process.env.VITEST) {
        logger.info(
          `[DB] Migration "${it.migrationName}" was executed successfully`,
        );
      }
    } else if (it.status === "Error") {
      logger.error(`[DB] Failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    logger.error({ error }, "[DB] Failed to migrate");
    throw error;
  }

  return { error, results };
}
