import { authenticatedAction } from "@lib/server-utils";
import { getDb } from "@lib/db";
import { sendEmail, getInvitationEmailTemplate } from "@lib/email";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";
import { hashToken } from "@lib/crypto";

export const PUT = authenticatedAction(
  async (_req, { params, user: auth }) => {
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

    const { id } = await params;

    // Get invitation details
    const invitation = await db
      .selectFrom("invitations")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!invitation) {
      throw { status: 404, message: "Invitation not found" };
    }

    const newToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await db
      .updateTable("invitations")
      .set({
        token: hashToken(newToken),
        expiresAt: expiresAt.toISOString(),
        createdAt: new Date().toISOString(), // Reset creation date to reflect last resend
      })
      .where("id", "=", id)
      .execute();

    const inviteUrl = `${
      process.env.APP_URL ||
      `http://localhost:${process.env.APP_PORT || "3000"}`
    }/register?token=${newToken}`;
    const { subject, html } = await getInvitationEmailTemplate(inviteUrl);

    const emailSent = await sendEmail({
      to: invitation.email,
      subject,
      html,
    });

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    await logSecurityEvent("userInviteResend", "success", {
      userId: auth.id,
      ip,
    });

    return { success: true, inviteUrl, emailSent };
  },
  { requireUser: true },
);

export const DELETE = authenticatedAction(
  async (_req, { params, user: auth }) => {
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

    const { id } = await params;

    await db.deleteFrom("invitations").where("id", "=", id).execute();

    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
    await logSecurityEvent("userInviteDelete", "success", {
      userId: auth.id,
      ip,
    });

    return { success: true };
  },
  { requireUser: true },
);
