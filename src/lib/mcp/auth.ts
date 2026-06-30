/**
 * API key authentication for MCP requests.
 *
 * Extracts the Bearer token from the Authorization header, validates the
 * `sk-ideon-` prefix, hashes with SHA-256, and looks up the key in the
 * `apiKeys` table. Returns the associated userId/keyId on success.
 */

import { createHash } from "crypto";
import { getGlobalDb } from "../../app/lib/db";

export interface AuthResult {
  userId: string;
  keyId: string;
}

export async function authenticateApiKey(
  authHeader: string | undefined,
): Promise<AuthResult | null> {
  if (!authHeader?.startsWith("Bearer sk-ideon-")) return null;

  const rawKey = authHeader.slice(7); // Remove "Bearer "
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const db = getGlobalDb();
  const apiKey = await db
    .selectFrom("apiKeys")
    .select(["id", "userId"])
    .where("keyHash", "=", keyHash)
    .executeTakeFirst();

  if (!apiKey) return null;

  // Update lastUsedAt (fire and forget)
  void db
    .updateTable("apiKeys")
    .set({ lastUsedAt: Date.now() })
    .where("id", "=", apiKey.id)
    .execute();

  return { userId: apiKey.userId, keyId: apiKey.id };
}
