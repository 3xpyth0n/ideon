import type { NextAuthConfig } from "next-auth";

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
  providers: [],
} satisfies NextAuthConfig;
