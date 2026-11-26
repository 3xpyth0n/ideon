import { authenticatedAction } from "@lib/server-utils";
import { getDb } from "@lib/db";
import * as argon2 from "argon2";
import { stringToColor } from "@lib/utils";
import { logSecurityEvent } from "@lib/audit";
import { assertCredentialChangeAllowed } from "@lib/account-credentials";
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
  password: z.string().min(8).optional(),
  currentPassword: z.string().optional(),
  vimMode: z.boolean().optional(),
});

export const GET = authenticatedAction(
  async (_req, { user: auth }) => {
    if (!auth) throw new Error("Unauthorized");
    const db = getDb();
    const row = await db
      .selectFrom("users")
      .select([
        "id as id",
        "email as email",
        "username as username",
        "displayName as displayName",
        "avatarUrl as avatarUrl",
        "color as color",
        "role as role",
        "vimMode as vimMode",
        "passwordHash as passwordHash",
      ])
      .where("id", "=", auth.id)
      .executeTakeFirst();

    if (!row) {
      throw { status: 401, message: "User not found" };
    }

    const { passwordHash, ...profile } = row;
    let user = { ...profile, hasPassword: passwordHash !== null };

    if (!user.color) {
      const newColor = stringToColor(user.username || user.email);
      await db
        .updateTable("users")
        .set({ color: newColor })
        .where("id", "=", auth.id)
        .execute();
      user = { ...user, color: newColor };
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
      passwordHash?: string;
      vimMode?: number;
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

    const current = await db
      .selectFrom("users")
      .select(["email", "passwordHash"])
      .where("id", "=", auth.id)
      .executeTakeFirst();

    if (!current) {
      throw { status: 401, message: "User not found" };
    }

    const normalizedEmail = body.email?.trim().toLowerCase();
    const emailChanged =
      normalizedEmail !== undefined &&
      normalizedEmail !== current.email.toLowerCase();

    try {
      await assertCredentialChangeAllowed({
        passwordHash: current.passwordHash,
        emailChanged,
        passwordChanged: Boolean(body.password),
        currentPassword: body.currentPassword,
      });
    } catch (err) {
      const reqHeaders = await headers();
      await logSecurityEvent("credentialChange", "failure", {
        userId: auth.id,
        ip: reqHeaders.get("x-forwarded-for") || "127.0.0.1",
      });
      throw err;
    }

    if (emailChanged && normalizedEmail) {
      const emailOwner = await db
        .selectFrom("users")
        .select("id")
        .where("email", "=", normalizedEmail)
        .where("id", "!=", auth.id)
        .executeTakeFirst();

      if (emailOwner) {
        throw { status: 400, message: "Email already in use" };
      }

      updateData.email = normalizedEmail;
    }

    if (body.password) {
      updateData.passwordHash = await argon2.hash(body.password);
    }
    if (body.vimMode !== undefined) {
      updateData.vimMode = body.vimMode ? 1 : 0;
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

      if (updateData.username || updateData.displayName || updateData.email) {
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
