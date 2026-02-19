import { initJackson } from "@lib/jackson";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const jackson = await initJackson();

  const text = await req.text();
  const body = Object.fromEntries(new URLSearchParams(text).entries());

  const { redirect_url, error } =
    await jackson.oauthController.oidcAuthzResponse(
      body as Record<string, string>,
    );

  if (redirect_url) {
    return NextResponse.redirect(redirect_url);
  }

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}
