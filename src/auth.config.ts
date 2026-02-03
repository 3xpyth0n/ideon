import type { NextAuthConfig } from "next-auth";

const secret = process.env.SECRET_KEY || process.env.AUTH_SECRET;

// During build time (Next.js static generation), it's acceptable to not have the secret.
const isBuild = process.env.IS_NEXT_BUILD === "1";

if (!secret && !isBuild) {
  throw new Error(
    "CRITICAL: SECRET_KEY or AUTH_SECRET environment variable must be set. Application cannot start without a valid secret.",
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
