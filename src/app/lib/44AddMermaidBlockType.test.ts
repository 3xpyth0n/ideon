import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import type { database } from "@lib/types/db";
import { down, up } from "../db/migrations/44AddMermaidBlockType";

describe("Mermaid block type migration", () => {
  let db: Kysely<database> | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it("adds Mermaid while preserving existing blocks on SQLite", async () => {
    db = new Kysely<database>({
      dialect: new SqliteDialect({ database: new BetterSqlite3(":memory:") }),
    });

    await sql.raw("CREATE TABLE projects (id TEXT PRIMARY KEY)").execute(db);
    await sql
      .raw(
        `CREATE TABLE blocks (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      blockType TEXT NOT NULL CHECK (blockType IN ('text')),
      metadata TEXT NOT NULL DEFAULT '{}',
      parentBlockId TEXT REFERENCES blocks(id) ON DELETE CASCADE,
      positionX REAL NOT NULL,
      positionY REAL NOT NULL,
      ownerId TEXT NOT NULL,
      content TEXT,
      data TEXT NOT NULL DEFAULT '{}',
      width REAL,
      height REAL,
      selected INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
      )
      .execute(db);
    await sql`INSERT INTO projects (id) VALUES ('project-1')`.execute(db);
    await sql`INSERT INTO blocks (id, projectId, blockType, positionX, positionY, ownerId, content)
      VALUES ('note-1', 'project-1', 'text', 0, 0, 'user-1', 'Existing note')`.execute(
      db,
    );

    await up(db);

    await sql`INSERT INTO blocks (id, projectId, blockType, positionX, positionY, ownerId, content)
      VALUES ('mermaid-1', 'project-1', 'mermaid', 10, 20, 'user-1', 'flowchart LR')`.execute(
      db,
    );
    const existingBlock = await db
      .selectFrom("blocks")
      .select("content")
      .where("id", "=", "note-1")
      .executeTakeFirst();
    expect(existingBlock?.content).toBe("Existing note");

    await down(db);

    const remainingBlocks = await db
      .selectFrom("blocks")
      .select(["id", "blockType"])
      .execute();
    expect(remainingBlocks).toEqual([{ id: "note-1", blockType: "text" }]);
  });
});
