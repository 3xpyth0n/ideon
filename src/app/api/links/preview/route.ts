import { NextResponse } from "next/server";
import ogs from "open-graph-scraper";

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const options = {
      url: url.startsWith("http") ? url : `https://${url}`,
      fetchOptions: {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        },
      },
      timeout: 5000,
    };
    const { result } = await ogs(options);

    return NextResponse.json({
      title: result.ogTitle || result.twitterTitle || "",
      description: result.ogDescription || result.twitterDescription || "",
      image: result.ogImage?.[0]?.url || result.twitterImage?.[0]?.url || "",
    });
  } catch (_error) {
    // Silence 429/403/500 errors to prevent frontend retries and console noise
    // Just return empty metadata so the frontend falls back to displaying the URL
    return NextResponse.json({
      title: "",
      description: "",
      image: "",
    });
  }
}
