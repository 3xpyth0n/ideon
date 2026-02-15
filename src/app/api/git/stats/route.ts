import { NextRequest, NextResponse } from "next/server";
import { getRepoStats } from "@lib/client/git-providers";
import { getDb } from "@lib/db";
import { auth } from "@auth";
import { decryptApiKey } from "@lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    let host = "";
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      host = u.host;
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // Check for user session to find relevant tokens
    const session = await auth();
    let token: string | undefined;

    if (session?.user?.id) {
      const db = getDb();

      // Fetch all enabled tokens for the user to do flexible matching in JS
      const userTokens = await db
        .selectFrom("userGitTokens")
        .select(["host", "token", "provider"])
        .where("userId", "=", session.user.id)
        .where("enabled", "=", 1)
        .execute();

      // Normalize current host (remove www., protocol, lowercase)
      const targetHost = host.replace(/^www\./, "").toLowerCase();

      // Find matching token
      const matchedToken = userTokens.find((t) => {
        const tHost = t.host
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .replace(/\/$/, "")
          .toLowerCase();
        return tHost === targetHost;
      });

      if (matchedToken) {
        try {
          token = decryptApiKey(matchedToken.token, session.user.id).trim();
        } catch (e) {
          console.error("[GitStats] Failed to decrypt token:", e);
        }
      }
    } else {
      return NextResponse.json(
        { error: "Authentication required to access repository stats" },
        { status: 401 },
      );
    }

    const result = await getRepoStats(url, token);

    if (result.error) {
      return NextResponse.json(result, { status: result.status || 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Git proxy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch git stats" },
      { status: 500 },
    );
  }
}
