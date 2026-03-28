import { NextResponse } from "next/server";
import { getDb } from "@lib/db";
import { sql } from "kysely";
import { logger } from "@lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();

    // Test database connection
    await sql`SELECT 1`.execute(db);

    return NextResponse.json(
      { status: "ok", timestamp: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    logger.error({ error }, "Health check failed");
    return NextResponse.json(
      { status: "error", message: "Service unhealthy" },
      { status: 500 },
    );
  }
}
