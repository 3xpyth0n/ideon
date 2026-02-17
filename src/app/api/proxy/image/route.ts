import { NextRequest, NextResponse } from "next/server";
import { isSafeUrl } from "@lib/security-utils";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  try {
    const decodedUrl = decodeURIComponent(url);

    // SSRF Protection: Validate URL before fetching
    if (!isSafeUrl(decodedUrl)) {
      console.warn(`[SSRF Block] Blocked unsafe URL: ${decodedUrl}`);
      return new NextResponse("Forbidden: Unsafe URL", { status: 403 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(decodedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; IdeonBot/1.0; +https://theideon.com)",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return new NextResponse(`Failed to fetch image: ${response.statusText}`, {
        status: response.status,
      });
    }

    const contentType = response.headers.get("content-type");

    // Enforce content type
    if (!contentType || !contentType.startsWith("image/")) {
      return new NextResponse("Invalid content type", { status: 400 });
    }

    const blob = await response.blob();

    // Size limit check (10MB)
    if (blob.size > 10 * 1024 * 1024) {
      return new NextResponse("Image too large", { status: 413 });
    }

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new NextResponse(blob, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
