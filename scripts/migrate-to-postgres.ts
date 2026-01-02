// Try to load dotenv for local development, ignore if missing (production/docker)
try {
  await import("dotenv/config");
} catch {
  // Ignore module not found error
}
import DatabaseDriver from "better-sqlite3";
import pg from "pg";
import path from "path";
import fs from "fs";
import readline from "readline";
import { fileURLToPath } from "url";
import {
  Kysely,
  PostgresDialect,
  Migrator,
  MigrationProvider,
  Migration,
} from "kysely";
import * as initialMigration from "../src/app/db/migrations/01InitialSchema";
import type { database } from "../src/app/lib/types/db";

// Environment and path configuration
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Table data structure
interface TableData {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      "01InitialSchema": initialMigration as Migration,
    };
  }
}

// Main migration handler class
class MigrationHandler {
  private sqlite: DatabaseDriver.Database | null = null;
  private postgres: pg.Pool | null = null;
  private dryRun: boolean = false;

  constructor(options: { dryRun?: boolean } = {}) {
    this.dryRun = options.dryRun || false;
  }

  // Connect to source SQLite database
  public async connectSQLite(): Promise<void> {
    const sqlitePath = path.resolve(__dirname, "../storage/dev.db");
    if (!fs.existsSync(sqlitePath)) {
      throw new Error(`SQLite database not found at ${sqlitePath}`);
    }
    this.sqlite = new DatabaseDriver(sqlitePath);
    console.log("Successfully connected to SQLite database.");
  }

  // Connect to target PostgreSQL database
  public async connectPostgreSQL(): Promise<void> {
    const config = {
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432", 10),
      database: process.env.DB_NAME || "ideon",
      user: process.env.DB_USER || "ideon",
      password: process.env.DB_PASS || "ideon",
    };

    this.postgres = new pg.Pool(config);

    // Perform initial health check
    try {
      await this.postgres.query("SELECT 1");
      console.log("Successfully connected to PostgreSQL database.");
    } catch (error) {
      throw new Error(
        `Failed to connect to PostgreSQL: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Wipe existing tables in PostgreSQL
  public async wipePostgresTables(): Promise<void> {
    if (!this.postgres) throw new Error("PostgreSQL not connected");

    console.log("Dropping and recreating public schema in PostgreSQL...");

    if (this.dryRun) {
      console.log("[Dry Run] Would drop and recreate schema 'public'");
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(
        "WARNING: This will drop schema 'public' and wipe all data. Type 'yes' to confirm: ",
        resolve,
      );
    });

    rl.close();

    if (answer.trim() !== "yes") {
      console.log("Migration aborted by user.");
      process.exit(0);
    }

    const client = await this.postgres.connect();
    try {
      await client.query("DROP SCHEMA public CASCADE");
      await client.query("CREATE SCHEMA public");
      await client.query("GRANT ALL ON SCHEMA public TO public");
      console.log("Public schema dropped and recreated.");
    } finally {
      client.release();
    }
  }

  // Get columns for a table in PostgreSQL
  private async getPostgresColumns(tableName: string): Promise<string[]> {
    if (!this.postgres) throw new Error("PostgreSQL not connected");

    const result = await this.postgres.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = $1
    `,
      [tableName],
    );

    return result.rows.map((row) => row.column_name);
  }

  // Get columns for a table in SQLite
  private getSQLiteColumns(tableName: string): string[] {
    if (!this.sqlite) throw new Error("SQLite not connected");

    const columns = this.sqlite
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as { name: string }[];

    return columns.map((col) => col.name);
  }

  // Extract schema and rows from SQLite
  public async extractSQLiteData(): Promise<TableData[]> {
    if (!this.sqlite) throw new Error("SQLite not connected");

    console.log("Extracting data from SQLite...");

    // Get list of user tables
    const tables = this.sqlite
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='table'
      AND name NOT LIKE 'sqlite%'
      AND name NOT LIKE 'kysely%'
    `,
      )
      .all() as { name: string }[];

    const allData: TableData[] = [];

    for (const table of tables) {
      // Get columns from both databases
      const pgColumns = await this.getPostgresColumns(table.name);
      const sqliteColumns = this.getSQLiteColumns(table.name);

      // Find intersection of columns
      const commonColumns = sqliteColumns.filter((col) =>
        pgColumns.includes(col),
      );

      if (commonColumns.length === 0) {
        console.warn(
          `No common columns found for table "${table.name}". Skipping data extraction.`,
        );
        continue;
      }

      // Identify ignored columns for logging
      const ignoredColumns = sqliteColumns.filter(
        (col) => !pgColumns.includes(col),
      );
      if (ignoredColumns.length > 0) {
        console.log(
          `Ignoring columns in SQLite table "${
            table.name
          }" (not in Postgres): ${ignoredColumns.join(", ")}`,
        );
      }

      const columnsSql = commonColumns.map((c) => `"${c}"`).join(", ");
      const rows = this.sqlite
        .prepare(`SELECT ${columnsSql} FROM "${table.name}"`)
        .all() as Record<string, unknown>[];

      allData.push({
        name: table.name,
        columns: commonColumns,
        rows,
      });

      console.log(`Extracted ${rows.length} rows from table "${table.name}"`);
    }

    return allData;
  }

  // Run Kysely migrations to set up schema
  public async runKyselyMigrations(): Promise<void> {
    if (!this.postgres) throw new Error("PostgreSQL not connected");

    console.log("Running Kysely migrations...");

    if (this.dryRun) {
      console.log("[Dry Run] Would run Kysely migrations");
      return;
    }

    const db = new Kysely<database>({
      dialect: new PostgresDialect({
        pool: this.postgres,
      }),
    });

    const migrator = new Migrator({
      db,
      provider: new StaticMigrationProvider(),
      migrationTableName: "kyselyMigration",
      migrationLockTableName: "kyselyMigrationLock",
    });

    const { error } = await migrator.migrateToLatest();

    if (error) {
      console.error("Failed to run Kysely migrations");
      throw error;
    }

    console.log("Kysely migrations executed successfully.");
  }

  // Batch insert data into PostgreSQL within a transaction
  public async transformAndInsert(data: TableData[]): Promise<void> {
    if (!this.postgres) throw new Error("PostgreSQL not connected");

    console.log("Starting data insertion into PostgreSQL...");

    if (this.dryRun) {
      console.log("[Dry Run] Skipping actual insertion.");
      return;
    }

    const client = await this.postgres.connect();

    try {
      // Begin atomic transaction
      await client.query("BEGIN");

      for (const table of data) {
        if (table.rows.length === 0) continue;

        console.log(`Inserting data into "${table.name}"...`);

        const columnsList = table.columns;
        const columnsSql = columnsList.map((c) => `"${c}"`).join(", ");

        for (const row of table.rows) {
          // Explicitly map values to ensure order matches columnsList
          const values = columnsList.map((col) => row[col]);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");

          const insertQuery = `INSERT INTO "${table.name}" (${columnsSql}) VALUES (${placeholders})`;
          await client.query(insertQuery, values);
        }

        console.log(
          `Successfully inserted ${table.rows.length} rows into "${table.name}"`,
        );
      }

      // Commit changes if all inserts succeed
      await client.query("COMMIT");
      console.log("Migration completed successfully and committed.");
    } catch (error) {
      // Rollback on any failure
      await client.query("ROLLBACK");
      console.log("An error occurred. Transaction rolled back.");
      throw error;
    } finally {
      client.release();
    }
  }

  // Verify row counts between source and target
  public async validateMigration(originalData: TableData[]): Promise<void> {
    if (!this.postgres) throw new Error("PostgreSQL not connected");

    console.log("Validating migration results...");

    let success = true;

    for (const table of originalData) {
      const result = await this.postgres.query(
        `SELECT COUNT(*) FROM "${table.name}"`,
      );
      const pgCount = parseInt(result.rows[0].count, 10);
      const sqliteCount = table.rows.length;

      if (pgCount === sqliteCount) {
        console.log(`OK: Table "${table.name}" row count matches (${pgCount})`);
      } else {
        console.error(
          `ERROR: Table "${table.name}" row count mismatch! SQLite: ${sqliteCount}, Postgres: ${pgCount}`,
        );
        success = false;
      }
    }

    if (success) {
      console.log("Data validation passed successfully.");
    } else {
      throw new Error("Data validation failed.");
    }
  }

  // Core execution flow
  public async run(): Promise<void> {
    const startTime = Date.now();

    try {
      console.log(
        `--- Migration Started ${this.dryRun ? "(DRY RUN)" : ""} ---`,
      );

      await this.connectSQLite();
      await this.connectPostgreSQL();
      await this.wipePostgresTables();
      await this.runKyselyMigrations();

      const data = await this.extractSQLiteData();
      await this.transformAndInsert(data);

      if (!this.dryRun) {
        await this.validateMigration(data);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`--- Migration Finished Successfully in ${duration}s ---`);
    } catch (error) {
      console.error("Migration failed!");
      console.error(error);
      process.exit(1);
    } finally {
      if (this.sqlite) this.sqlite.close();
      if (this.postgres) await this.postgres.end();
    }
  }
}

// Execution entry point
const isDryRun = process.argv.includes("--dry-run");
const handler = new MigrationHandler({ dryRun: isDryRun });
handler.run();
