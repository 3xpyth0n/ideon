import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@lib/db";
import { hashToken } from "@lib/crypto";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const db = getDb();
  const invitation = await db
    .selectFrom("invitations")
    .select(["email", "role", "expiresAt", "acceptedAt"])
    .where("token", "=", hashToken(token))
    .executeTakeFirst();

  if (!invitation) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  if (invitation.acceptedAt) {
    return NextResponse.json(
      { error: "Invitation already accepted" },
      { status: 400 },
    );
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Invitation expired" }, { status: 400 });
  }

  return NextResponse.json({
    email: invitation.email,
    role: invitation.role,
  });
}
