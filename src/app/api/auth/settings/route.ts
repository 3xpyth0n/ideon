import { NextResponse } from "next/server";
import { getDb, getEnvAuthProviders, mergeAuthProviders } from "@lib/db";

export const dynamic = "force-dynamic";

interface AuthProvider {
  enabled: boolean;
  clientId?: string;
  issuer?: string;
  [key: string]: unknown;
}

// Only return enabled providers and their basic info (no secrets)
function toPublicProviders(
  providers: Record<string, unknown>,
): Record<string, { enabled: boolean; clientId?: string; issuer?: string }> {
  return Object.entries(providers).reduce(
    (
      acc: Record<
        string,
        { enabled: boolean; clientId?: string; issuer?: string }
      >,
      [key, value]: [string, unknown],
    ) => {
      const provider = value as AuthProvider;
      const isVercel = key === "vercel";
      const isEnabled = isVercel ? !!provider.oauthEnabled : provider.enabled;

      if (isEnabled) {
        acc[key] = {
          enabled: true,
          clientId: provider.clientId,
          issuer: provider.issuer,
        };
      }
      return acc;
    },
    {},
  );
}

export async function GET() {
  const db = getDb();
  const settings = await db
    .selectFrom("systemSettings")
    .select([
      "publicRegistrationEnabled",
      "passwordLoginEnabled",
      "authProvidersJson",
    ])
    .limit(1)
    .executeTakeFirst();

  // Environment-configured OIDC wins over the database config,
  // matching the Auth.js setup in src/auth.ts ([#146])
  const envConfig = getEnvAuthProviders();

  // If no settings found, return default values
  if (!settings) {
    return NextResponse.json({
      publicRegistrationEnabled: true,
      passwordLoginEnabled: true,
      authProviders: envConfig
        ? toPublicProviders(mergeAuthProviders({}, envConfig))
        : {},
    });
  }

  const providers = mergeAuthProviders(
    JSON.parse(settings?.authProvidersJson || "{}"),
    envConfig,
  );
  const publicProviders = toPublicProviders(providers);

  return NextResponse.json({
    publicRegistrationEnabled: !!settings?.publicRegistrationEnabled,
    passwordLoginEnabled: !!settings?.passwordLoginEnabled,
    authProviders: publicProviders,
  });
}
