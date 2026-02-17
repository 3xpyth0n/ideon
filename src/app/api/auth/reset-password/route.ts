import { NextResponse } from "next/server";
import { getDb } from "@lib/db";
import * as argon2 from "argon2";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";
import { hashToken } from "@lib/crypto";
import { checkRateLimit } from "@lib/rate-limit";
import { z } from "zod";
import { getClientIp } from "@/lib/security-utils";

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
  identifier: z.string().min(2),
});

export async function POST(req: Request) {
  try {
    const { token, password, identifier } = await req.json();

    // Rate limit: 5 attempts per 10 minutes
    // Use identifier to prevent brute-force attacks against a specific account
    await checkRateLimit("reset-password", 5, 600, identifier);
    const db = getDb();
    const headersList = await headers();
    const ip = getClientIp(headersList);

    // Validate format
    const validation = resetPasswordSchema.safeParse({
      token,
      password,
      identifier,
    });
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid identifier or password format" },
        { status: 400 },
      );
    }

    // Join with users table to verify identifier if provided
    const resetRecord = await db
      .selectFrom("passwordResets")
      .innerJoin("users", "users.id", "passwordResets.userId")
      .select([
        "passwordResets.id",
        "passwordResets.userId",
        "users.email",
        "users.username",
      ])
      .where("passwordResets.token", "=", hashToken(token))
      .where("passwordResets.expiresAt", ">", Date.now())
      .executeTakeFirst();

    if (!resetRecord) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 400 },
      );
    }

    // If identifier is provided, verify it matches the user
    if (identifier) {
      const isEmailMatch = resetRecord.email === identifier;
      const isUsernameMatch = resetRecord.username === identifier;

      if (!isEmailMatch && !isUsernameMatch) {
        return NextResponse.json(
          { error: "Invalid identifier for this token" },
          { status: 400 },
        );
      }
    }

    const passwordHash = await argon2.hash(password);

    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("users")
        .set({ passwordHash })
        .where("id", "=", resetRecord.userId)
        .execute();

      await trx
        .deleteFrom("passwordResets")
        .where("id", "=", resetRecord.id)
        .execute();
    });

    await logSecurityEvent("passwordReset", "success", {
      userId: resetRecord.userId,
      ip,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
