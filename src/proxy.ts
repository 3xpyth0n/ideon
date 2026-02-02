import { NextRequest, NextResponse } from "next/server";
import { getSecurityHeaders } from "@lib/utils";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET || process.env.SECRET_KEY,
});

export async function proxy(req: NextRequest) {
  // Use a stable nonce for CSP
  let nonce: string;
  try {
    nonce = globalThis.crypto.randomUUID();
  } catch (_e) {
    nonce = Math.random().toString(36).substring(2);
  }

  const url = req.nextUrl;
  const pathname = url.pathname;
  const baseUrl =
    process.env.APP_URL || `http://localhost:${process.env.APP_PORT || "3000"}`;

  const securityHeaders = getSecurityHeaders(nonce);

  const applySecurityHeaders = (res: NextResponse) => {
    Object.entries(securityHeaders).forEach(([key, value]) => {
      res.headers.set(key, value);
    });
    res.headers.set("x-nonce", nonce);
    return res;
  };

  const getRedirectUrl = (path: string) => {
    try {
      return new URL(path, baseUrl);
    } catch (_e) {
      return new URL(path, url);
    }
  };

  // Skip redirection for API routes, Next.js internals, and static assets in public/
  const isStaticAsset =
    /\.(png|jpg|jpeg|gif|svg|ico|webp|webmanifest|xml|txt|json|woff2?|ttf|otf|js|css|js\.map)$/.test(
      pathname,
    );

  if (pathname.startsWith("/_next") || isStaticAsset) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(req.headers);
  Object.entries(securityHeaders).forEach(([key, value]) => {
    requestHeaders.set(key, value);
  });

  // Pass pathname to server components
  requestHeaders.set("x-pathname", pathname);

  // Authentication Check
  const publicPaths = [
    "/login",
    "/setup",
    "/register",
    "/reset-password",
    "/api/auth",
    "/api/config",
    "/api/health",
    "/auth/",
    "/favicon.ico",
  ];

  // Fetch session directly
  const session = await auth();
  const isLoggedIn = !!session;

  const origin = req.headers.get("origin") || "";
  const allowed = (process.env.DEV_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  if (allowed.length && origin && allowed.includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }

  applySecurityHeaders(res);

  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  const isProtected = !isPublic;

  // 1. If authenticated, prevent access to Guest-Only routes (login, register)
  // Note: /setup is handled by Layout now
  const guestOnlyPaths = ["/login", "/register"];
  if (isLoggedIn && guestOnlyPaths.some((p) => pathname.startsWith(p))) {
    return applySecurityHeaders(NextResponse.redirect(getRedirectUrl("/home")));
  }

  // 2. If authenticated and at root, go to /home
  if (pathname === "/" && isLoggedIn) {
    return applySecurityHeaders(NextResponse.redirect(getRedirectUrl("/home")));
  }

  // 3. If not authenticated and at a protected route, go to /login
  if (isProtected && !isLoggedIn) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    } else {
      return applySecurityHeaders(
        NextResponse.redirect(getRedirectUrl("/login")),
      );
    }
  }

  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

export default proxy;
