import { NextResponse } from "next/server";
import { authenticatedAction } from "@lib/server-utils";
import { getDb } from "@lib/db";
import crypto from "node:crypto";

export const GET = authenticatedAction(
  async (req, { user }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const db = getDb();
    const settings = await db
      .selectFrom("systemSettings")
      .select("authProvidersJson")
      .executeTakeFirst();

    const providers = JSON.parse(settings?.authProvidersJson || "{}");
    const vercelConfig = providers.vercel;

    if (!vercelConfig?.clientId || !vercelConfig?.integrationSlug) {
      throw { status: 400, message: "Vercel integration not configured" };
    }

    const state = crypto.randomBytes(32).toString("hex");
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    const appUrl =
      process.env.APP_URL ||
      `http://localhost:${process.env.APP_PORT || "3000"}`;
    const redirectUri = `${appUrl}/api/vercel/callback`;

    const params = new URLSearchParams({
      client_id: vercelConfig.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const authorizeUrl = `https://vercel.com/integrations/${
      vercelConfig.integrationSlug
    }/new?${params.toString()}`;

    const response = NextResponse.redirect(authorizeUrl);

    response.cookies.set("vercel_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    response.cookies.set("vercel_code_verifier", codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  },
  { requireUser: true },
);
