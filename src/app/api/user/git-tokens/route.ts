import { authenticatedAction } from "@lib/server-utils";
import { getDb } from "@lib/db";
import { z } from "zod";
import * as crypto from "crypto";
import { encryptApiKey } from "@lib/crypto";

const createTokenSchema = z.object({
  provider: z.string().min(1),
  host: z.string().min(1),
  token: z.string().min(1),
});

const updateTokenSchema = z.object({
  id: z.string().uuid(),
  enabled: z.number().int().min(0).max(1),
});

const deleteTokenSchema = z.object({
  id: z.string().uuid(),
});

export const GET = authenticatedAction(async (req, { user }) => {
  if (!user) throw new Error("Unauthorized");

  const db = getDb();
  const tokens = await db
    .selectFrom("userGitTokens")
    .select(["id", "provider", "host", "enabled", "createdAt", "token"])
    .where("userId", "=", user.id)
    .orderBy("createdAt", "desc")
    .execute();

  // Mask tokens before returning
  const maskedTokens = tokens.map((t) => ({
    ...t,
    token: "•".repeat(8) + (t.token.length > 4 ? t.token.slice(-4) : ""),
  }));

  return maskedTokens;
});

export const POST = authenticatedAction(async (req, { user, body }) => {
  if (!user) throw new Error("Unauthorized");

  const { provider, host, token } = createTokenSchema.parse(body);

  // Normalize host and token
  const normalizedHost = host
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .toLowerCase();

  const cleanToken = token.trim();

  const db = getDb();

  // Check for existing token for this host
  const existing = await db
    .selectFrom("userGitTokens")
    .select("id")
    .where("userId", "=", user.id)
    .where("host", "=", normalizedHost)
    .executeTakeFirst();

  if (existing) {
    throw new Error("TOKEN_EXISTS_FOR_HOST");
  }

  const encryptedToken = encryptApiKey(cleanToken, user.id);
  const newToken = {
    id: crypto.randomUUID(),
    userId: user.id,
    provider,
    host: normalizedHost,
    token: encryptedToken,
    enabled: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.insertInto("userGitTokens").values(newToken).execute();

  return { success: true, id: newToken.id };
});

export const PATCH = authenticatedAction(async (req, { user, body }) => {
  if (!user) throw new Error("Unauthorized");

  const { id, enabled } = updateTokenSchema.parse(body);

  const db = getDb();
  await db
    .updateTable("userGitTokens")
    .set({
      enabled,
      updatedAt: new Date().toISOString(),
    })
    .where("id", "=", id)
    .where("userId", "=", user.id)
    .execute();

  return { success: true };
});

export const DELETE = authenticatedAction(async (req, { user }) => {
  if (!user) throw new Error("Unauthorized");

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) throw new Error("Missing ID");
  deleteTokenSchema.parse({ id });

  const db = getDb();
  await db
    .deleteFrom("userGitTokens")
    .where("id", "=", id)
    .where("userId", "=", user.id)
    .execute();

  return { success: true };
});
