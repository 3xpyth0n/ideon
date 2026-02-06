import { NextResponse } from "next/server";

export const revalidate = 600; // Cache for 10 minutes

export async function GET() {
  try {
    const response = await fetch(
      "https://api.github.com/repos/3xpyth0n/ideon/releases/latest",
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "Ideon-System-Check",
        },
        next: { revalidate: 600 },
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
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json({ latest: data.tag_name });
  } catch (error) {
    console.error("Failed to check for updates:", error);
    return NextResponse.json(
      { error: "Failed to check for updates" },
      { status: 500 },
    );
  }
}
