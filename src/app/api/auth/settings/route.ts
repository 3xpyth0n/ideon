import { NextResponse } from "next/server";
import { getDb } from "@lib/db";

export const dynamic = "force-dynamic";

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

  // If no settings found, return default values
  if (!settings) {
    return NextResponse.json({
      publicRegistrationEnabled: true,
      passwordLoginEnabled: true,
      authProviders: {},
    });
  }

  interface AuthProvider {
    enabled: boolean;
    clientId?: string;
    issuer?: string;
    [key: string]: unknown;
  }

  const providers = JSON.parse(settings?.authProvidersJson || "{}");
  // Only return enabled providers and their basic info (no secrets)
  const publicProviders = Object.entries(providers).reduce(
    (
      acc: Record<
        string,
        { enabled: boolean; clientId?: string; issuer?: string }
      >,
      [key, value]: [string, unknown],
    ) => {
      const provider = value as AuthProvider;
      if (provider.enabled) {
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

  return NextResponse.json({
    publicRegistrationEnabled: !!settings?.publicRegistrationEnabled,
    passwordLoginEnabled: !!settings?.passwordLoginEnabled,
    authProviders: publicProviders,
  });
}
