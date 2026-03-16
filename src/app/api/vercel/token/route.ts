import { authenticatedAction } from "@lib/server-utils";
import { getDb } from "@lib/db";
import { encryptApiKey, decryptApiKey } from "@lib/crypto";
import { v4 as uuidv4 } from "uuid";

export const GET = authenticatedAction(
  async (_req, { user }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const db = getDb();
    const token = await db
      .selectFrom("userVercelTokens")
      .select("id")
      .where("userId", "=", user.id)
      .executeTakeFirst();

    let scopeSlug = null;
    if (token) {
      const credentials = await db
        .selectFrom("userVercelTokens")
        .select(["accessToken", "teamId"])
        .where("userId", "=", user.id)
        .executeTakeFirst();

      if (credentials) {
        const accessToken = decryptApiKey(credentials.accessToken, user.id);
        const searchParams = new URLSearchParams();
        if (credentials.teamId) searchParams.set("teamId", credentials.teamId);

        const url = credentials.teamId
          ? `https://api.vercel.com/v2/teams/${
              credentials.teamId
            }?${searchParams.toString()}`
          : "https://api.vercel.com/v2/user";

        const scopeRes = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (scopeRes.ok) {
          const scopeData = await scopeRes.json();
          scopeSlug = credentials.teamId
            ? scopeData.slug
            : scopeData.user.username;
        }
      }
    }

    const settings = await db
      .selectFrom("systemSettings")
      .select("authProvidersJson")
      .executeTakeFirst();
    const providers = JSON.parse(settings?.authProvidersJson || "{}");
    const vercelConfig = providers.vercel;

    return {
      connected: !!token,
      scopeSlug,
      config: {
        oauthEnabled: vercelConfig?.oauthEnabled ?? false,
        patEnabled: true,
      },
    };
  },
  { requireUser: true },
);

export const DELETE = authenticatedAction(
  async (_req, { user }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const db = getDb();

    await db
      .deleteFrom("userVercelProjects")
      .where("userId", "=", user.id)
      .execute();

    await db
      .deleteFrom("userVercelTokens")
      .where("userId", "=", user.id)
      .execute();

    return { success: true };
  },
  { requireUser: true },
);
export const POST = authenticatedAction(
  async (_req, { user, body }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const { token, authMethod } = body as {
      token?: string;
      authMethod?: "oauth" | "pat";
    };

    const db = getDb();
    const accessToken = token;

    if (!accessToken) throw { status: 400, message: "Token is required" };

    // Validate token with Vercel API
    const validateRes = await fetch("https://api.vercel.com/v2/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!validateRes.ok) {
      throw { status: 401, message: "Invalid Vercel token" };
    }

    // Encrypt token
    const encryptedToken = encryptApiKey(accessToken, user.id);
    const now = new Date().toISOString();

    await db
      .insertInto("userVercelTokens")
      .values({
        id: uuidv4(),
        userId: user.id,
        accessToken: encryptedToken,
        authMethod: authMethod || "pat",
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((oc) =>
        oc.column("userId").doUpdateSet({
          accessToken: encryptedToken,
          authMethod: authMethod || "pat",
          updatedAt: now,
        }),
      )
      .execute();

    return { success: true };
  },
  { requireUser: true },
);
