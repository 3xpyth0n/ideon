import { createHash, randomBytes } from "crypto";
import { authenticatedAction } from "@lib/server-utils";
import { getDb } from "@lib/db";
import { z } from "zod";

const createKeySchema = z.object({
  name: z.string().min(1).max(60),
});

export const GET = authenticatedAction(async (_req, { user }) => {
  if (!user) throw { status: 401, message: "Unauthorized" };

  const db = getDb();
  return db
    .selectFrom("apiKeys")
    .select(["id", "name", "keyHint", "lastUsedAt", "createdAt"])
    .where("userId", "=", user.id)
    .orderBy("createdAt", "desc")
    .execute();
});

export const POST = authenticatedAction(
  async (_req, { user, body }) => {
    if (!user) throw { status: 401, message: "Unauthorized" };

    const { name } = createKeySchema.parse(body);
    const db = getDb();

    const existing = await db
      .selectFrom("apiKeys")
      .select("id")
      .where("userId", "=", user.id)
      .execute();

    if (existing.length >= 20) {
      throw { status: 422, message: "Maximum of 20 API keys reached" };
    }

    const rawKey = "sk-ideon-" + randomBytes(16).toString("hex");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyHint = rawKey.slice(0, 17) + "…";
    const id = randomBytes(16).toString("hex");

    await db
      .insertInto("apiKeys")
      .values({
        id,
        userId: user.id,
        name,
        keyHash,
        keyHint,
        lastUsedAt: null,
        createdAt: Date.now(),
      })
      .execute();

    return { id, name, keyHint, createdAt: Date.now(), key: rawKey };
  },
  { schema: createKeySchema },
);
