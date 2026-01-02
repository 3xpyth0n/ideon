import { NextResponse } from "next/server";
import { getDb } from "@lib/db";

export async function GET() {
  try {
    const db = getDb();
    const row = await db
      .selectFrom("users")
      .select(({ fn }) => fn.count<number>("id").as("c"))
      .where("role", "=", "superadmin")
      .executeTakeFirst();
    const isSetupComplete = (row?.c || 0) > 0;
    return NextResponse.json({
      isSetupComplete,
    });
  } catch {
    return NextResponse.json({
      isSetupComplete: false,
    });
  }
}
