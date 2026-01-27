import jackson, {
  type JacksonOption,
  type SAMLJackson,
} from "@boxyhq/saml-jackson";
import path from "path";
import fs from "fs";

// Singleton instance
let jacksonInstance: SAMLJackson | null = null;

function getStorageDir() {
  const storageDir = path.resolve(process.cwd(), "storage");
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
  return storageDir;
}

function shouldUseSqlite() {
  return process.env.NODE_ENV === "development";
}

export async function initJackson(): Promise<SAMLJackson> {
  if (jacksonInstance) return jacksonInstance;

  const {
    DB_HOST,
    DB_NAME,
    DB_USER,
    DB_PASS,
    DB_PORT,
    DB_SSL,
    APP_URL,
    APP_PORT,
  } = process.env;

  const appUrl = APP_URL || `http://localhost:${APP_PORT || "3000"}`;

  let dbConfig: JacksonOption["db"];

  const hasPostgresConfig = !!(DB_HOST && DB_NAME && DB_USER && DB_PASS);
  const isDev = shouldUseSqlite();

  if (isDev) {
    // SQLite - Priority in Dev
    const storageDir = getStorageDir();
    const dbPath = process.env.SQLITE_PATH
      ? path.resolve(process.cwd(), process.env.SQLITE_PATH)
      : path.resolve(storageDir, "dev.db"); // Same DB as app

    dbConfig = {
      engine: "sql",
      type: "sqlite",
      url: `file://${dbPath}`,
      ttl: 600,
    };
  } else if (hasPostgresConfig) {
    // Postgres
    dbConfig = {
      engine: "sql",
      type: "postgres",
      url: `postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${
        DB_PORT || 5432
      }/${DB_NAME}${DB_SSL === "true" ? "?ssl=true" : ""}`,
      ttl: 600, // 10 mins
    };
  } else {
    // Fallback to SQLite if no Postgres config
    const storageDir = getStorageDir();
    const dbPath = process.env.SQLITE_PATH
      ? path.resolve(process.cwd(), process.env.SQLITE_PATH)
      : path.resolve(storageDir, "dev.db"); // Same DB as app

    dbConfig = {
      engine: "sql",
      type: "sqlite",
      url: `file://${dbPath}`,
      ttl: 600,
    };
  }

  const opts: JacksonOption = {
    externalUrl: appUrl,
    samlPath: "/api/auth/sso/saml",
    oidcPath: "/api/oauth",
    db: dbConfig,
    idpEnabled: true, // Act as OIDC Provider
  };

  jacksonInstance = await jackson(opts);
  return jacksonInstance;
}
