import { NextResponse } from "next/server";
import { logger } from "@lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(
      "https://api.github.com/repos/3xpyth0n/ideon/releases/latest",
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Ideon-System-Check",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ latest: null }, { status: 404 });
      }
      // Silently handle rate limiting
      if (response.status === 403 || response.status === 429) {
        return NextResponse.json({ latest: null });
      }
      throw new Error(`Update check error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json({ latest: data.tag_name });
  } catch (error) {
    logger.error({ error }, "Failed to check for updates");
    return NextResponse.json(
      { error: "Failed to check for updates" },
      { status: 500 },
    );
  }
}
