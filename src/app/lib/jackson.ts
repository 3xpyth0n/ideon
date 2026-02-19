import jackson, {
  type JacksonOption,
  type SAMLJackson,
} from "@boxyhq/saml-jackson";
import { getDatabaseUrl } from "./db";

// Singleton instance
let jacksonInstance: SAMLJackson | null = null;

export async function initJackson(): Promise<SAMLJackson> {
  if (jacksonInstance) return jacksonInstance;

  const { APP_URL, APP_PORT } = process.env;

  const appUrl = APP_URL || `http://localhost:${APP_PORT || "3000"}`;

  const dbInfo = getDatabaseUrl();

  const dbConfig: JacksonOption["db"] = {
    engine: "sql",
    type: dbInfo.type,
    url: dbInfo.url,
  };

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
