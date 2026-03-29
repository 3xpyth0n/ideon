import { NextRequest, NextResponse } from "next/server";
import NextAuth from "next-auth";

const secret = process.env.SECRET_KEY || process.env.AUTH_SECRET;

const { auth } = NextAuth({
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      name: `authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure:
          process.env.NODE_ENV === "production" &&
          (process.env.APP_URL?.startsWith("https") ?? false),
      },
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret,
  providers: [],
});

function getSecurityHeaders(nonce: string): Record<string, string> {
  const appUrl = process.env.APP_URL || "";
  const isSecure = appUrl.startsWith("https://");

  const cspHeader = [
    "default-src 'self';",
    `script-src 'self' 'nonce-${nonce}' ${
      process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""
    };`,
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com;",
    "img-src 'self' data: blob: https:;",
    "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com https://esm.sh;",
    "connect-src 'self' ws: wss: https:;",
    "frame-src 'self' https:;",
    "frame-ancestors 'none';",
    "base-uri 'self';",
    "form-action 'self';",
    "object-src 'none';",
    isSecure ? "upgrade-insecure-requests;" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const headers: Record<string, string> = {
    "Content-Security-Policy": cspHeader,
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-XSS-Protection": "1; mode=block",
  };

  if (isSecure) {
    headers["Strict-Transport-Security"] =
      "max-age=31536000; includeSubDomains; preload";
  }

  return headers;
}

export async function proxy(req: NextRequest) {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const nonce = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );

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
    "/fonts/",
    "/images/",
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
     * - public folder files (images, fonts, etc)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot)$).*)",
  ],
};

export default proxy;
