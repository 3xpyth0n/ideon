import { getDb } from "@lib/db";
import { adminAction } from "@lib/server-utils";

export const GET = adminAction(
  async () => {
    const db = getDb();
    const users = await db
      .selectFrom("users as u")
      .leftJoin("users as inviter", "u.invitedByUserId", "inviter.id")
      .select([
        "u.id as id",
        "u.email as email",
        "u.username as username",
        "u.displayName as displayName",
        "u.avatarUrl as avatarUrl",
        "u.color as color",
        "u.role as role",
        "u.createdAt as createdAt",
        "u.lastOnline as lastOnline",
        "u.invitedByUserId as invitedByUserId",
        "inviter.displayName as inviterDisplayName",
        "inviter.email as inviterEmail",
      ])
      .orderBy("u.createdAt", "desc")
      .execute();

    return users;
  },
  { requireUser: true },
);
