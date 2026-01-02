import { getDb } from "@lib/db";
import { stringToColor } from "@lib/utils";
import { authenticatedAction } from "@lib/server-utils";

export const GET = authenticatedAction(
  async (_req, { user: auth }) => {
    const db = getDb();
    let user = await db
      .selectFrom("users")
      .select(["id", "email", "username", "avatarUrl", "role", "color"])
      .where("id", "=", auth!.id)
      .executeTakeFirst();

    if (!user) {
      throw { status: 401, message: "User not found" };
    }

    // Assign color if missing
    if (!user.color) {
      const newColor = stringToColor(user.username || user.email);
      await db
        .updateTable("users")
        .set({ color: newColor })
        .where("id", "=", user.id)
        .execute();

      user = { ...user, color: newColor };
    }

    return { user };
  },
  { requireUser: true },
);
