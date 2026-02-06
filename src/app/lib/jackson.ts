import jackson, {
  type JacksonOption,
  type SAMLJackson,
} from "@boxyhq/saml-jackson";
import { getPostgresConfig, getSqlitePath, shouldUseSqlite } from "./db";

// Singleton instance
let jacksonInstance: SAMLJackson | null = null;

export async function initJackson(): Promise<SAMLJackson> {
  if (jacksonInstance) return jacksonInstance;

  const { DB_HOST, DB_NAME, DB_USER, DB_PASS, APP_URL, APP_PORT } = process.env;

  const appUrl = APP_URL || `http://localhost:${APP_PORT || "3000"}`;

  let dbConfig: JacksonOption["db"];

  const hasPostgresConfig = !!(DB_HOST && DB_NAME && DB_USER && DB_PASS);
  const isDev = shouldUseSqlite();

  if (isDev) {
    // SQLite - Priority in Dev
    dbConfig = {
      engine: "sql",
      type: "sqlite",
      url: `file://${getSqlitePath()}`,
      ttl: 600,
    };
  } else if (hasPostgresConfig) {
    // Postgres
    const pgConfig = getPostgresConfig();
    const sslQuery = pgConfig.ssl ? "?ssl=true" : "";

    dbConfig = {
      engine: "sql",
      type: "postgres",
      url: `postgres://${pgConfig.user}:${pgConfig.password}@${pgConfig.host}:${pgConfig.port}/${pgConfig.database}${sslQuery}`,
      ttl: 600, // 10 mins
    };
  } else {
    // Fallback to SQLite if no Postgres config
    dbConfig = {
      engine: "sql",
      type: "sqlite",
      url: `file://${getSqlitePath()}`,
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
