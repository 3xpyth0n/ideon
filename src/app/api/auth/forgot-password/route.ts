import { NextResponse } from "next/server";
import { withAuthenticatedSession, getGlobalDb } from "@lib/db";
import { sendPasswordResetEmail } from "@lib/email";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";
import crypto from "crypto";
import { hashToken } from "@lib/crypto";
import { checkRateLimit } from "@lib/rate-limit";
import { getClientIp } from "@lib/security-utils";

// System user ID used for unauthenticated operations that still require an
// RLS session context (e.g. password reset lookups).
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export async function POST(req: Request) {
  try {
    const { identifier } = await req.json();

    // Rate limit: 5 attempts per 10 minutes
    // Use identifier if available to prevent botnets from spamming a specific user
    await checkRateLimit("forgot-password", 5, 600, identifier);

    const headersList = await headers();
    const ip = getClientIp(headersList);

    if (!identifier) {
      // Return success to avoid leaking validation details
      return NextResponse.json({ success: true });
    }

    // Use a system session so that the RLS policy on `users` is satisfied.
    // The policy is non-forced so this is a correctness fix (the query would
    // otherwise silently bypass row-level policies on the global pool connection).
    await withAuthenticatedSession(
      SYSTEM_USER_ID,
      async (db) => {
        const user = await db
          .selectFrom("users")
          .select(["id", "email"])
          .where((eb) =>
            eb.or([
              eb("email", "=", identifier),
              eb("username", "=", identifier),
            ]),
          )
          .executeTakeFirst();

        if (user) {
          const token = crypto.randomUUID();
          const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

          await db
            .insertInto("passwordResets")
            .values({
              id: crypto.randomUUID(),
              userId: user.id,
              token: hashToken(token),
              expiresAt,
            })
            .execute();

          const appUrl =
            process.env.APP_URL ||
            `http://localhost:${process.env.APP_PORT || "3000"}`;
          const resetLink = `${appUrl}/reset-password?token=${token}`;

          await sendPasswordResetEmail(user.email, resetLink);

          await logSecurityEvent("passwordResetRequest", "success", {
            userId: user.id,
            ip,
          });
        }
      },
      getGlobalDb(),
    );

    // Always return success to prevent account enumeration
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ success: true });
  }
}

