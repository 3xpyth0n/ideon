import { NextResponse } from "next/server";
import { getRepoStats } from "@lib/git-providers";

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    const { stats, error, status } = await getRepoStats(url);

    if (error) {
      return NextResponse.json({ error }, { status: status || 500 });
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Git API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Git stats" },
      { status: 500 },
    );
  }
}
