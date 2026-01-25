import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { getSecurityHeaders } from "@lib/utils";
import { auth } from "./auth";
import { getInternalSecret } from "./app/lib/crypto";

export async function proxy(req: NextRequest) {
  // Use a stable nonce for CSP
  let nonce;
  try {
    nonce = crypto.randomUUID();
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

  // Authentication Check
  const publicPaths = [
    "/login",
    "/setup",
    "/register",
    "/reset-password",
    "/api/auth",
    "/api/config",
    "/api/system/installed",
    "/api/health",
    "/auth/",
    "/favicon.ico",
  ];

  // Fetch session directly instead of using the wrapper
  const session = await auth();
  const isLoggedIn = !!session;

  // Check for internal secret bypass (used by server-side fetch and temporal snapshots)
  const incomingSecret = req.headers.get("x-internal-secret");
  const internalSecret = getInternalSecret();
  let isInternal = false;

  // Security: Only allow internal secret from localhost
  // If request comes from outside, strip the header effect
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ip = (req as any).ip || "127.0.0.1";
  const isLocalhost = ip === "127.0.0.1" || ip === "::1";

  if (incomingSecret === internalSecret && isLocalhost) {
    isInternal = true;
  }

  const isValidToken = isLoggedIn || isInternal;

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

  // 1. If authenticated, prevent access to Guest-Only routes (login, register, setup)
  const guestOnlyPaths = ["/login", "/register", "/setup"];
  if (isValidToken && guestOnlyPaths.some((p) => pathname.startsWith(p))) {
    // We only redirect away from /setup if setup is actually complete
    if (!pathname.startsWith("/setup")) {
      return applySecurityHeaders(
        NextResponse.redirect(getRedirectUrl("/home")),
      );
    }
  }

  // 2. If authenticated and at root, go to /home
  if (pathname === "/" && isValidToken) {
    return applySecurityHeaders(NextResponse.redirect(getRedirectUrl("/home")));
  }

  // 3. If not authenticated and at a protected route, go to /login
  if (isProtected && !isValidToken) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    } else {
      return applySecurityHeaders(
        NextResponse.redirect(getRedirectUrl("/login")),
      );
    }
  }

  // Prevent infinite recursion by not calling /api/config from within the proxy if the request IS for /api/config
  if (pathname.startsWith("/api/config")) {
    return res;
  }

  const port = process.env.APP_PORT || url.port || "3000";
  const internalOrigin = `http://127.0.0.1:${port}`;

  try {
    // Optimization: Only check setup status for main pages
    if (
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      isStaticAsset
    ) {
      return res;
    }

    const cfgRes = await fetch(`${internalOrigin}/api/config`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!cfgRes.ok) {
      return res;
    }

    const data = await cfgRes.json();
    const isSetupComplete = data.isSetupComplete;

    if (!isSetupComplete && !pathname.startsWith("/setup")) {
      return applySecurityHeaders(
        NextResponse.redirect(getRedirectUrl("/setup")),
      );
    }
    if (isSetupComplete && pathname.startsWith("/setup")) {
      const target = isValidToken ? "/home" : "/login";
      return applySecurityHeaders(
        NextResponse.redirect(getRedirectUrl(target)),
      );
    }
    return res;
  } catch {
    return res;
  }
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
