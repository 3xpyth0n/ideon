import { NextRequest, NextResponse } from "next/server";
import { getSecurityHeaders } from "@lib/utils";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth({
  ...authConfig,
});

export async function proxy(req: NextRequest) {
  // Use a stable nonce for CSP
  let nonce: string;
  try {
    nonce = globalThis.crypto.randomUUID();
  } catch {
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
    } catch {
      return new URL(path, url);
    }
  };

  const requestHeaders = new Headers(req.headers);
  Object.entries(securityHeaders).forEach(([key, value]) => {
    requestHeaders.set(key, value);
  });

  // Pass pathname to server components
  requestHeaders.set("x-pathname", pathname);

  // Authentication Check
  const publicPaths = [
    "/share",
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
  const guestOnlyPaths = ["/login", "/register"];
  if (isLoggedIn && guestOnlyPaths.some((p) => pathname.startsWith(p))) {
    return applySecurityHeaders(NextResponse.redirect(getRedirectUrl("/home")));
  }

  // 2. Redirect root to /home
  if (pathname === "/") {
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
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (images, etc)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

export default proxy;
