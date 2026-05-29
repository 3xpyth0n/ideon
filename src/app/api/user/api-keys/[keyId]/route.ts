import { authenticatedAction } from "@lib/server-utils";
import { getDb } from "@lib/db";

export const DELETE = authenticatedAction(async (_req, { user, params }) => {
  if (!user) throw { status: 401, message: "Unauthorized" };

  const db = getDb();
  const result = await db
    .deleteFrom("apiKeys")
    .where("id", "=", params.keyId)
    .where("userId", "=", user.id)
    .executeTakeFirst();

  if (!result.numDeletedRows) {
    throw { status: 404, message: "API key not found" };
  }

  return { success: true };
});
