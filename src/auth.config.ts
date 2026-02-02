import type { NextAuthConfig } from "next-auth";

const secret =
  process.env.AUTH_SECRET ||
  process.env.SECRET_KEY ||
  (process.env.NODE_ENV === "development"
    ? "dev-secret-key-1234567890"
    : undefined);

if (!secret && process.env.NODE_ENV !== "production") {
  console.warn(
    "⚠️ [Auth] No secret found in environment (AUTH_SECRET or SECRET_KEY). Session decryption will fail.",
  );
}

export const authConfig = {
  session: {
    strategy: "jwt",
  },
  cookies: {
    sessionToken: {
      name: `authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure:
          process.env.NODE_ENV === "production" &&
          process.env.APP_URL?.startsWith("https"),
      },
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret,
  providers: [],
} satisfies NextAuthConfig;
