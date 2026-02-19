import { initJackson } from "@lib/jackson";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auth: string[] }> },
) {
  const { auth } = await params;
  const jackson = await initJackson();
  const operation = auth.join("/");

  if (operation === "authorize") {
    const query = Object.fromEntries(req.nextUrl.searchParams.entries());

    // @ts-expect-error - Jackson types might not perfectly align with NextRequest query parsing but this is the standard object
    const { redirect_url, error } = await jackson.oauthController.authorize({
      ...query,
      client_id: query.client_id as string,
      redirect_uri: query.redirect_uri as string,
      response_type: query.response_type as "code",
      state: query.state as string,
    });

    if (redirect_url) {
      return NextResponse.redirect(redirect_url);
    }
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
    return NextResponse.json({ error: "No redirect URL" }, { status: 500 });
  }

  if (operation === "userinfo") {
    const authHeader = req.headers.get("authorization");
    if (!authHeader)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = authHeader.split(" ")[1];

    try {
      const profile = await jackson.oauthController.userInfo(token);
      return NextResponse.json(profile);
    } catch (err) {
      const error = err as Error;
      return NextResponse.json(
        { error: error.message || "Unauthorized" },
        { status: 401 },
      );
    }
  }

  if (operation === ".well-known/openid-configuration") {
    const response = jackson.oidcDiscoveryController.openidConfig();
    return NextResponse.json(response);
  }

  if (operation === ".well-known/jwks.json") {
    const response = await jackson.oidcDiscoveryController.jwks();
    return NextResponse.json(response);
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ auth: string[] }> },
) {
  const { auth } = await params;
  const jackson = await initJackson();
  const operation = auth.join("/");

  if (operation === "token") {
    const text = await req.text();
    const body = Object.fromEntries(new URLSearchParams(text).entries());

    try {
      // @ts-expect-error - Jackson types
      const response = await jackson.oauthController.token(body);
      return NextResponse.json(response);
    } catch (err) {
      const error = err as Error;
      return NextResponse.json(
        { error: error.message || "Bad Request" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
