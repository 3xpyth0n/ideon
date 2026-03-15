import { getDb } from "./db";
import { decryptApiKey } from "./crypto";

export { isRedeploy } from "./vercel-shared";

export async function getVercelCredentials(userId: string): Promise<{
  accessToken: string;
  teamId: string | null;
} | null> {
  const db = getDb();
  const row = await db
    .selectFrom("userVercelTokens")
    .select(["accessToken", "teamId"])
    .where("userId", "=", userId)
    .executeTakeFirst();

  if (!row) return null;

  return {
    accessToken: decryptApiKey(row.accessToken, userId),
    teamId: row.teamId,
  };
}

export function getVercelParams(credentials: { teamId: string | null }) {
  const params = new URLSearchParams();
  if (credentials.teamId) params.set("teamId", credentials.teamId);
  return params;
}
