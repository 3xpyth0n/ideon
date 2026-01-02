import { NextResponse } from "next/server";
import { getGithubStats } from "@lib/github";

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    const { stats, error, status } = await getGithubStats(url);

    if (error) {
      return NextResponse.json({ error }, { status: status || 500 });
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error("GitHub API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch GitHub stats" },
      { status: 500 },
    );
  }
}
