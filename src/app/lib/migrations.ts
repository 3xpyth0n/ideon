import { Migrator, MigrationProvider, Migration } from "kysely";
import { getDb } from "./db";
import { isBuildMode } from "./runtime";
import { logger } from "./logger";
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
import * as addUserGitTokensMigration from "../db/migrations/14AddUserGitTokens";
import * as fixFolderRlsRecursionMigration from "../db/migrations/15FixFolderRlsRecursion";
import * as addLinkPreviewsMigration from "../db/migrations/16AddLinkPreviews";
import * as migrateLinkMetadataMigration from "../db/migrations/17MigrateLinkMetadata";
import * as addSketchBlockTypeMigration from "../db/migrations/18AddSketchBlockType";
import * as addLabelsAndReactionsMigration from "../db/migrations/19AddLabelsAndReactions";

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
      "14AddUserGitTokens": addUserGitTokensMigration,
      "15FixFolderRlsRecursion": fixFolderRlsRecursionMigration,
      "16AddLinkPreviews": addLinkPreviewsMigration,
      "17MigrateLinkMetadata": migrateLinkMetadataMigration,
      "18AddSketchBlockType": addSketchBlockTypeMigration,
      "19AddLabelsAndReactions": addLabelsAndReactionsMigration,
    };
  }
}

export async function runMigrations() {
  if (isBuildMode() && !process.env.VITEST) {
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
