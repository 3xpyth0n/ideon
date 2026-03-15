import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@lib/db";
import { getAuthUser } from "@auth";
import { encryptApiKey } from "@lib/crypto";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const configurationId = searchParams.get("configurationId");

  const storedState = req.cookies.get("vercel_oauth_state")?.value;
  const codeVerifier = req.cookies.get("vercel_code_verifier")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(
      new URL("/integrations?vercel=error&reason=invalid_state", req.url),
    );
  }

  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL("/integrations?vercel=error&reason=missing_verifier", req.url),
    );
  }

  const db = getDb();
  const settings = await db
    .selectFrom("systemSettings")
    .select("authProvidersJson")
    .executeTakeFirst();

  const providers = JSON.parse(settings?.authProvidersJson || "{}");
  const vercelConfig = providers.vercel;

  if (!vercelConfig?.clientId || !vercelConfig?.clientSecret) {
    return NextResponse.redirect(
      new URL("/integrations?vercel=error&reason=not_configured", req.url),
    );
  }

  const appUrl =
    process.env.APP_URL || `http://localhost:${process.env.APP_PORT || "3000"}`;
  const redirectUri = `${appUrl}/api/vercel/callback`;

  const tokenResponse = await fetch(
    "https://api.vercel.com/v2/oauth/access_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: vercelConfig.clientId,
        client_secret: vercelConfig.clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    },
  );

  if (!tokenResponse.ok) {
    return NextResponse.redirect(
      new URL("/integrations?vercel=error&reason=token_exchange", req.url),
    );
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  const teamId = tokenData.team_id || configurationId || null;

  if (!accessToken) {
    return NextResponse.redirect(
      new URL("/integrations?vercel=error&reason=no_token", req.url),
    );
  }

  const encryptedToken = encryptApiKey(accessToken, user.id);
  const now = new Date().toISOString();

  const existing = await db
    .selectFrom("userVercelTokens")
    .select("id")
    .where("userId", "=", user.id)
    .executeTakeFirst();

  if (existing) {
    await db
      .updateTable("userVercelTokens")
      .set({
        accessToken: encryptedToken,
        teamId,
        authMethod: "oauth",
        updatedAt: now,
      })
      .where("id", "=", existing.id)
      .execute();
  } else {
    await db
      .insertInto("userVercelTokens")
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        accessToken: encryptedToken,
        authMethod: "oauth",
        teamId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  const response = NextResponse.redirect(
    new URL("/integrations?vercel=connected", req.url),
  );
  response.cookies.delete("vercel_oauth_state");
  response.cookies.delete("vercel_code_verifier");

  return response;
}
