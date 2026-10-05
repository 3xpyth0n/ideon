import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import type { database } from "@lib/types/db";
import { down, up } from "../db/migrations/45ProjectRepositorySync";

describe("project repository sync migration", () => {
  let db: Kysely<database> | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it("stores sync state without credentials and rolls back cleanly on SQLite", async () => {
    db = new Kysely<database>({
      dialect: new SqliteDialect({ database: new BetterSqlite3(":memory:") }),
    });
    await sql.raw("CREATE TABLE projects (id TEXT PRIMARY KEY)").execute(db);
    await up(db);
    await sql`INSERT INTO projects (id) VALUES ('project-1')`.execute(db);

    await db
      .insertInto("projectRepositorySyncs")
      .values({
        projectId: "project-1",
        remoteProjectId: "remote-project-1",
        repositoryUrl: "https://example.com/team/project.git",
        repositoryUsername: "oauth2",
        branch: "main",
        repositoryPath: "docs/board",
        lastSyncedCommit: null,
        baseManifest: null,
        blockIdMap: "{}",
        linkIdMap: "{}",
        updatedAt: new Date().toISOString(),
      })
      .execute();

    const state = await db
      .selectFrom("projectRepositorySyncs")
      .selectAll()
      .where("projectId", "=", "project-1")
      .executeTakeFirstOrThrow();
    expect(state.repositoryUrl).toBe("https://example.com/team/project.git");
    expect(state.blockIdMap).toBe("{}");

    await down(db);
    const tables = await db.introspection.getTables();
    expect(
      tables.some((table) => table.name === "projectRepositorySyncs"),
    ).toBe(false);
  });
});
