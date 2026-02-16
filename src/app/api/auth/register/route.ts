import { getDb, runTransaction } from "@lib/db";
import * as argon2 from "argon2";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";
import { z } from "zod";
import { stringToColor } from "@lib/utils";
import { authenticatedAction } from "@lib/server-utils";
import { hashToken } from "@lib/crypto";
import { checkRateLimit } from "@lib/rate-limit";

const registerSchema = z.object({
  token: z.string().nullable().optional(),
  username: z.string().min(2),
  password: z.string().min(8),
  email: z.string().email().nullable().optional(),
});

export const POST = authenticatedAction(
  async (_req, { body }) => {
    // Rate limit: 5 attempts per 10 minutes
    await checkRateLimit("register", 5, 600);

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";

    const { token, username, password, email } = body;

    const db = getDb();

    // 0. Check settings
    const settings = await db
      .selectFrom("systemSettings")
      .select(["publicRegistrationEnabled"])
      .executeTakeFirst();

    const isPublicEnabled = !!settings?.publicRegistrationEnabled;

    if (!token && !isPublicEnabled) {
      throw { status: 403, message: "Public registration is disabled" };
    }

    let userEmail = email;
    let userRole = "member";
    let invitationId: string | null = null;
    let invitedByUserId: string | null = null;

    if (token) {
      // 1. Validate token
      const invitation = await db
        .selectFrom("invitations")
        .selectAll()
        .where("token", "=", hashToken(token))
        .executeTakeFirst();

      if (!invitation) {
        throw { status: 404, message: "Invalid token" };
      }

      if (invitation.acceptedAt) {
        throw { status: 400, message: "Invitation already accepted" };
      }

      if (new Date(invitation.expiresAt) < new Date()) {
        throw { status: 400, message: "Invitation expired" };
      }
      userEmail = invitation.email;
      userRole = invitation.role;
      invitationId = invitation.id;
      invitedByUserId = invitation.invitedBy;
    } else {
      if (!userEmail) {
        throw { status: 400, message: "Email is required" };
      }
    }

    // 2. Check if username or email already exists
    const existingUser = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", userEmail!)
      .executeTakeFirst();

    if (existingUser) {
      throw { status: 400, message: "Email already registered" };
    }

    // 3. Hash password and create user
    const passwordHash = await argon2.hash(password);
    const userId = crypto.randomUUID();

    await runTransaction(db, async (trx) => {
      await trx
        .insertInto("users")
        .values({
          id: userId,
          email: userEmail!,
          username,
          passwordHash,
          role: userRole as "superadmin" | "admin" | "member",
          createdAt: new Date().toISOString(),
          lastOnline: new Date().toISOString(),
          invitedByUserId,
          color: stringToColor(username),
        })
        .execute();

      // 4. Mark invitation as accepted if it exists
      if (invitationId) {
        await trx
          .updateTable("invitations")
          .set({ acceptedAt: new Date().toISOString() })
          .where("id", "=", invitationId)
          .execute();
      }
    });

    await logSecurityEvent("userRegister", "success", {
      userId,
      ip,
    });

    return { success: true };
  },
  { schema: registerSchema, requireUser: false },
);
