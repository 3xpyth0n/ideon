import { authenticatedAction } from "@lib/server-utils";
import { getDb } from "@lib/db";
import * as argon2 from "argon2";
import { stringToColor } from "@lib/utils";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";
import { z } from "zod";

const updateAccountSchema = z.object({
  username: z
    .string()
    .optional()
    .refine((val) => !val || /^[a-z0-9._-]+$/.test(val), {
      message:
        "Username can only contain letters, numbers, dots, underscores, and hyphens, and no spaces",
    }),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().optional(),
  password: z.string().min(8).optional(),
});

export const GET = authenticatedAction(
  async (_req, { user: auth }) => {
    if (!auth) throw new Error("Unauthorized");
    const db = getDb();
    let user = await db
      .selectFrom("users")
      .select([
        "id as id",
        "email as email",
        "username as username",
        "displayName as displayName",
        "avatarUrl as avatarUrl",
        "color as color",
        "role as role",
      ])
      .where("id", "=", auth.id)
      .executeTakeFirst();

    if (user && !user.color) {
      const newColor = stringToColor(user.username || user.email);
      await db
        .updateTable("users")
        .set({ color: newColor })
        .where("id", "=", auth.id)
        .execute();
      user = { ...user, color: newColor };
    }

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  },
  { requireUser: true },
);

export const PATCH = authenticatedAction(
  async (_req, { user: auth, body }) => {
    if (!auth) throw new Error("Unauthorized");
    const db = getDb();
    const updateData: {
      username?: string;
      displayName?: string;
      email?: string;
      avatarUrl?: string;
      passwordHash?: string;
    } = {};

    if (body.username !== undefined) {
      if (!/^[a-z0-9._-]+$/.test(body.username)) {
        throw {
          status: 400,
          message:
            "Username can only contain letters, numbers, dots, underscores, and hyphens, and no spaces",
        };
      }

      const normalizedUsername = body.username
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "");

      if (!normalizedUsername) {
        throw { status: 400, message: "Invalid username" };
      }

      const existingUser = await db
        .selectFrom("users")
        .select("id")
        .where("username", "=", normalizedUsername)
        .where("id", "!=", auth.id)
        .executeTakeFirst();

      if (existingUser) {
        throw { status: 400, message: "Username already taken" };
      }

      updateData.username = normalizedUsername;
    }
    if (body.displayName !== undefined)
      updateData.displayName = body.displayName;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.avatarUrl !== undefined) updateData.avatarUrl = body.avatarUrl;
    if (body.password) {
      updateData.passwordHash = await argon2.hash(body.password);
    }

    if (Object.keys(updateData).length > 0) {
      await db
        .updateTable("users")
        .set(updateData)
        .where("id", "=", auth.id)
        .execute();

      const headersList = await headers();
      const ip = headersList.get("x-forwarded-for") || "127.0.0.1";

      if (updateData.passwordHash) {
        await logSecurityEvent("passwordChange", "success", {
          userId: auth.id,
          ip,
        });
      }

      if (
        updateData.username ||
        updateData.displayName ||
        updateData.email ||
        updateData.avatarUrl
      ) {
        await logSecurityEvent("profileUpdate", "success", {
          userId: auth.id,
          ip,
        });
      }
    }

    return { success: true };
  },
  { schema: updateAccountSchema, requireUser: true },
);
