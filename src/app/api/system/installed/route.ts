import { NextResponse } from "next/server";
import { getDb } from "@lib/db";

export async function GET() {
  try {
    const db = getDb();
    const row = await db
      .selectFrom("systemSettings")
      .select("installed")
      .limit(1)
      .execute();
    const installed = row.length > 0 && !!row[0].installed;
    return NextResponse.json({ installed });
  } catch {
    return NextResponse.json({ installed: false });
  }
}
