import {
  Kysely,
  SqliteDialect,
  PostgresDialect,
  Selectable,
  Transaction,
  sql,
} from "kysely";
import DatabaseDriver from "better-sqlite3";
import pg from "pg";
import type { database, temporalStatesTable } from "./types/db";
import fs from "fs";
import path from "path";
import { logger } from "./logger";
import { AsyncLocalStorage } from "node:async_hooks";

export type TemporalState = Selectable<temporalStatesTable>;

pg.types.setTypeParser(20, (val) => parseInt(val, 10));
pg.types.setTypeParser(1700, (val) => parseFloat(val));

interface DbState {
  dbInstance: Kysely<database> | null;
  poolInstance: pg.Pool | null;
  sqliteInstance: DatabaseDriver.Database | null;
  activeType: "postgres" | "sqlite";
  isInitialized: boolean;
}

const globalWithDb = globalThis as unknown as {
  _dbState: DbState | undefined;
};

if (!globalWithDb._dbState) {
  globalWithDb._dbState = {
    dbInstance: null,
    poolInstance: null,
    sqliteInstance: null,
    activeType: "sqlite",
    isInitialized: false,
  };
}

const state = globalWithDb._dbState!;

// AsyncLocalStorage to share transaction context for RLS
const dbStore = new AsyncLocalStorage<Kysely<database>>();

function getStorageDir() {
  const storageDir = path.resolve(process.cwd(), "storage");
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
  return storageDir;
}

export function getPostgresConfig() {
  const { DB_HOST, DB_NAME, DB_USER, DB_PASS, DB_PORT, DB_SSL } = process.env;
  return {
    host: DB_HOST,
    port: DB_PORT ? parseInt(DB_PORT, 10) : 5432,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASS,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  };
}

export function getSqlitePath() {
  const storageDir = getStorageDir();
  return process.env.SQLITE_PATH
    ? path.resolve(process.cwd(), process.env.SQLITE_PATH)
    : path.resolve(storageDir, "dev.db");
}

export function shouldUseSqlite() {
  const { NODE_ENV } = process.env;
  return NODE_ENV === "development";
}

function initializeSqlite(reason: string) {
  if (state.isInitialized && state.activeType === "sqlite") return;
  logger.info(`Development mode detected (or no NODE_ENV). ${reason}`);
  state.activeType = "sqlite";
  state.isInitialized = true;
}

export async function initDb() {
  if (state.isInitialized) return;

  const { DB_HOST, DB_NAME, DB_USER, DB_PASS } = process.env;

  if (shouldUseSqlite()) {
    initializeSqlite("Using SQLite.");
    return;
  }

  const hasPostgresConfig = DB_HOST && DB_NAME && DB_USER && DB_PASS;

  if (hasPostgresConfig) {
    const config = getPostgresConfig();

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const pool = new pg.Pool(config);
        const client = await pool.connect();
        await client.query("SELECT 1");
        client.release();

        state.poolInstance = pool;
        state.activeType = "postgres";
        logger.info({ host: DB_HOST }, "Connected to PostgreSQL successfully");
        state.isInitialized = true;
        return;
      } catch (err) {
        logger.warn(
          {
            attempt: attempts,
            error: err instanceof Error ? err.message : String(err),
          },
          "Failed to connect to PostgreSQL",
        );
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    logger.error("PostgreSQL connection failed after multiple attempts.");
    throw new Error("PostgreSQL connection failed");
  } else {
    logger.info("No PostgreSQL configuration found. Using SQLite.");
    state.activeType = "sqlite";
    state.isInitialized = true;
  }
}

export function getPool(): pg.Pool | null {
  return state.poolInstance;
}

function getSqlite(): DatabaseDriver.Database {
  if (state.sqliteInstance) return state.sqliteInstance;

  const dbPath = getSqlitePath();
  logger.info(`Using SQLite database at: ${dbPath}`);

  state.sqliteInstance = new DatabaseDriver(dbPath);
  state.sqliteInstance.pragma("journal_mode = WAL");
  state.sqliteInstance.pragma("synchronous = NORMAL");
  return state.sqliteInstance;
}

function ensureInitialized() {
  if (state.dbInstance) return;

  if (!state.isInitialized) {
    const { DB_HOST, DB_NAME, DB_USER, DB_PASS } = process.env;

    if (shouldUseSqlite()) {
      initializeSqlite("Auto-initializing SQLite connection");
    } else if (DB_HOST && DB_NAME && DB_USER && DB_PASS) {
      logger.info("Auto-initializing PostgreSQL connection in getDb");
      state.poolInstance = new pg.Pool(getPostgresConfig());
      state.activeType = "postgres";
      state.isInitialized = true;
    } else {
      logger.info("Auto-initializing SQLite connection in getDb");
      state.activeType = "sqlite";
      state.isInitialized = true;
    }
  }

  if (state.activeType === "postgres" && state.poolInstance) {
    state.dbInstance = new Kysely<database>({
      dialect: new PostgresDialect({
        pool: state.poolInstance,
      }),
    });
  } else if (state.activeType === "sqlite") {
    state.dbInstance = new Kysely<database>({
      dialect: new SqliteDialect({
        database: getSqlite(),
      }),
    });
  }
}

export async function withAuthenticatedSession<T>(
  userId: string,
  callback: (tx: Kysely<database>) => Promise<T>,
  dbOverride?: Kysely<database>,
): Promise<T> {
  const db = dbOverride || getDb();

  // If we are using SQLite, we don't need to set the session variable (no RLS)
  if (state.activeType === "sqlite") {
    return callback(db);
  }

  // For Postgres, we start a transaction and set the session variable
  return db.transaction().execute(async (tx) => {
    // Set the session variable for RLS
    await sql`SELECT set_config('app.current_user_id', ${userId}, true)`.execute(
      tx,
    );
    // Use AsyncLocalStorage to share the transaction context with getDb() calls
    return dbStore.run(tx, () => callback(tx));
  });
}

export function getGlobalDb(): Kysely<database> {
  return getDb();
}

export function getDb(): Kysely<database> {
  // Check if we are inside a transaction context (RLS)
  const storeDb = dbStore.getStore();
  if (storeDb) return storeDb;

  if (state.dbInstance) return state.dbInstance;

  // Fallback if getDb is called before initDb (e.g. in Next.js worker)
  ensureInitialized();

  if (state.dbInstance) return state.dbInstance;
  throw new Error("Database failed to initialize");
}

export interface AuthProviderConfig {
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  tenantId?: string;
  redirectUri?: string;
  enabled?: boolean;
  magicLink?: {
    expiresInMinutes?: number;
  };
}

/**
 * Asynchronously fetches OAuth provider configuration.
 */
export async function getAuthProviders(): Promise<
  Record<string, AuthProviderConfig>
> {
  try {
    const db = getDb();
    const row = await db
      .selectFrom("systemSettings")
      .select("authProvidersJson")
      .executeTakeFirst();

    if (row?.authProvidersJson) {
      return JSON.parse(row.authProvidersJson);
    }
    return {};
  } catch (error) {
    logger.error({ error }, "Failed to fetch auth providers");
    return {};
  }
}

/**
 * Checks if the system is installed by verifying if a superadmin exists.
 */
export async function isSystemInstalled(): Promise<boolean> {
  try {
    const db = getDb();
    const row = await db
      .selectFrom("users")
      .select(({ fn }) => fn.count<number>("id").as("c"))
      .where("role", "=", "superadmin")
      .executeTakeFirst();
    return Number(row?.c || 0) > 0;
  } catch (error) {
    logger.error({ error }, "Failed to check system installation status");
    return false;
  }
}

/**
 * Executes a callback within a transaction.
 * If the provided db instance is already a transaction, it reuses it.
 * Otherwise, it creates a new transaction.
 */
export async function runTransaction<T>(
  db: Kysely<database>,
  callback: (trx: Transaction<database>) => Promise<T>,
): Promise<T> {
  if (db.isTransaction) {
    return callback(db as unknown as Transaction<database>);
  }
  return db.transaction().execute(callback);
}
