import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/3xpyth0n/ideon/main/CHANGELOG.md",
      {
        headers: {
          "User-Agent": "Ideon-System-Check",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        return NextResponse.json({ content: null });
      }
      throw new Error(`Changelog fetch error: ${response.statusText}`);
    }

    const content = await response.text();
    return NextResponse.json({ content });
  } catch (error) {
    console.error("Failed to fetch changelog:", error);
    return NextResponse.json(
      { error: "Failed to fetch changelog" },
      { status: 500 },
    );
  }
}
