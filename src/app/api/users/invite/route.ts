import { getDb } from "@lib/db";
import { sendEmail, getInvitationEmailTemplate } from "@lib/email";
import { authenticatedAction } from "@lib/server-utils";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";
import { hashToken } from "@lib/crypto";
import { checkRateLimit } from "@lib/rate-limit";

export const POST = authenticatedAction(
  async (req, { user: auth, body }) => {
    // Rate limit: 10 invites per hour per user (using auth.id)
    await checkRateLimit("invite-user", 10, 3600, auth?.id);

    if (!auth) throw { status: 401, message: "Unauthorized" };
    const db = getDb();

    // Check role in DB to avoid stale JWT issues
    const userRole = await db
      .selectFrom("users")
      .select("role")
      .where("id", "=", auth.id)
      .executeTakeFirst();

    if (
      !userRole ||
      (userRole.role !== "superadmin" && userRole.role !== "admin")
    ) {
      throw { status: 401, message: "Unauthorized" };
    }

    const { email, role } = body as {
      email: string;
      role: "admin" | "member";
    };

    if (!email || !role) {
      throw { status: 400, message: "Missing fields" };
    }

    if (!["admin", "member"].includes(role)) {
      throw { status: 400, message: "Invalid role" };
    }

    // Only superadmins can invite other admins
    if (role === "admin" && userRole.role !== "superadmin") {
      throw { status: 403, message: "Forbidden" };
    }

    // Check if user already exists
    const existingUser = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", email)
      .executeTakeFirst();

    if (existingUser) {
      // Clean up any stale invitations for this user
      await db.deleteFrom("invitations").where("email", "=", email).execute();

      throw { status: 400, message: "User already exists" };
    }

    const token = crypto.randomUUID();
    const id = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await db
      .insertInto("invitations")
      .values({
        id,
        email,
        token: hashToken(token),
        role,
        invitedBy: auth.id,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      })
      .execute();

    const inviteUrl = `${
      process.env.APP_URL ||
      `http://localhost:${process.env.APP_PORT || "3000"}`
    }/register?token=${token}`;
    const { subject, html } = await getInvitationEmailTemplate(inviteUrl);

    // Try to send email
    const emailSent = await sendEmail({
      to: email,
      subject,
      html,
    });

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    await logSecurityEvent("userInvite", "success", {
      userId: auth.id,
      ip,
    });

    return { success: true, inviteUrl, emailSent };
  },
  { requireUser: true },
);

export const GET = authenticatedAction(
  async (_req, { user: auth }) => {
    if (!auth) throw { status: 401, message: "Unauthorized" };
    const db = getDb();

    // Check role in DB to avoid stale JWT issues
    const userRole = await db
      .selectFrom("users")
      .select("role")
      .where("id", "=", auth.id)
      .executeTakeFirst();

    if (
      !userRole ||
      (userRole.role !== "superadmin" && userRole.role !== "admin")
    ) {
      throw { status: 401, message: "Unauthorized" };
    }

    const items = await db
      .selectFrom("invitations")
      .leftJoin("users", "users.id", "invitations.invitedBy")
      .select([
        "invitations.id",
        "invitations.email",
        "invitations.role",
        "invitations.createdAt",
        "invitations.expiresAt",
        "invitations.acceptedAt",
        "users.username as invitedByName",
      ])
      .orderBy("invitations.createdAt", "desc")
      .execute();

    return items;
  },
  { requireUser: true },
);
