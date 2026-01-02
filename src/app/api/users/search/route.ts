import { getDb } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";

export const GET = authenticatedAction(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");

    if (!query || query.length < 2) {
      return [];
    }

    const db = getDb();

    const users = await db
      .selectFrom("users")
      .select([
        "id as id",
        "email as email",
        "username as username",
        "displayName as displayName",
        "avatarUrl as avatarUrl",
        "color as color",
      ])
      .where((eb) =>
        eb.or([
          eb("email", "like", `%${query}%`),
          eb("username", "like", `%${query}%`),
          eb("displayName", "like", `%${query}%`),
        ]),
      )
      .limit(10)
      .execute();

    return users;
  },
  { requireUser: true },
);
