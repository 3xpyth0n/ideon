import { NextResponse } from "next/server";
import { getDb } from "@lib/db";
import * as argon2 from "argon2";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();
    const db = getDb();
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";

    if (!token || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const resetRecord = await db
      .selectFrom("passwordResets")
      .selectAll()
      .where("token", "=", token)
      .where("expiresAt", ">", Date.now())
      .executeTakeFirst();

    if (!resetRecord) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 400 },
      );
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
