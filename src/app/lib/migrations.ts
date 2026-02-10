import { Migrator, MigrationProvider, Migration } from "kysely";
import { getDb } from "./db";
import { isBuildMode } from "./runtime";
import * as initialMigration from "../db/migrations/01InitialSchema";
import * as jacksonMigration from "../db/migrations/02JacksonStore";
import * as ssoRegistrationMigration from "../db/migrations/03AddSsoRegistration";
import * as fixProjectRlsMigration from "../db/migrations/04FixProjectRls";
import * as fixRlsRecursionMigration from "../db/migrations/05FixRlsRecursion";
import * as addProjectOrganizationMigration from "../db/migrations/06AddProjectOrganization";
import * as addLastOpenedAtMigration from "../db/migrations/07AddLastOpenedAt";
import * as addProjectShareLinkMigration from "../db/migrations/08AddProjectShareLink";
import * as foldersMigration from "../db/migrations/09Folders";
import * as addFolderStarredMigration from "../db/migrations/10AddFolderStarred";
import * as addFolderDeletedAtMigration from "../db/migrations/11AddFolderDeletedAt";

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      "01InitialSchema": initialMigration,
      "02JacksonStore": jacksonMigration,
      "03AddSsoRegistration": ssoRegistrationMigration,
      "04FixProjectRls": fixProjectRlsMigration,
      "05FixRlsRecursion": fixRlsRecursionMigration,
      "06AddProjectOrganization": addProjectOrganizationMigration,
      "07AddLastOpenedAt": addLastOpenedAtMigration,
      "08AddProjectShareLink": addProjectShareLinkMigration,
      "09Folders": foldersMigration,
      "10AddFolderStarred": addFolderStarredMigration,
      "11AddFolderDeletedAt": addFolderDeletedAtMigration,
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
