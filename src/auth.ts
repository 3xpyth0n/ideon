import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Nodemailer from "next-auth/providers/nodemailer";
import Discord from "next-auth/providers/discord";
import Google from "next-auth/providers/google";
import Slack from "next-auth/providers/slack";
import GitLab from "next-auth/providers/gitlab";
import AzureAD from "next-auth/providers/azure-ad";
import { getDb, getAuthProviders, getPool } from "@lib/db";
import { getAuthSecret } from "@lib/crypto";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";
import * as argon2 from "argon2";
import { z } from "zod";
import { KyselyAdapter } from "@lib/authAdapter";
import { render } from "@react-email/components";
import MagicLinkEmail from "@emails/MagicLinkEmail";
import { sendEmail } from "@lib/email";
import { RateLimiterPostgres, RateLimiterMemory } from "rate-limiter-flexible";

// Ensure Auth.js uses the correct public URL for callbacks behind reverse proxy
if (process.env.APP_URL && !process.env.AUTH_URL) {
  process.env.AUTH_URL = process.env.APP_URL;
}

// Rate limiter setup
const getRateLimiter = () => {
  if (process.env.NODE_ENV === "production") {
    const pool = getPool();
    if (pool) {
      return new RateLimiterPostgres({
        storeClient: pool,
        tableName: "rateLimits",
        keyPrefix: "loginLimit",
        points: 5,
        duration: 60 * 15,
        tableCreated: true, // Table is created by Kysely migrations
      });
    }
  }
  return new RateLimiterMemory({
    keyPrefix: "loginLimit",
    points: 5,
    duration: 60 * 15,
  });
};

// Auth configuration
export const { handlers, signIn, signOut, auth } = NextAuth(async () => {
  const freshConfig = await getAuthProviders();
  const db = getDb();

  return {
    trustHost: true,
    secret: getAuthSecret(),
    adapter: KyselyAdapter(),
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
          secure: process.env.NODE_ENV === "production",
        },
      },
    },
    providers: [
      Nodemailer({
        server: {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: Number(process.env.SMTP_PORT) === 465,
          // Force STARTTLS if not using implicit TLS but TLS is requested
          requireTLS:
            Number(process.env.SMTP_PORT) !== 465 &&
            process.env.SMTP_USE_TLS === "true",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
          },
        },
        from: process.env.SMTP_FROM_EMAIL,
        id: "email",
        async sendVerificationRequest({ identifier: email, url }) {
          const user = await db
            .selectFrom("users")
            .select("id")
            .where("email", "=", email)
            .executeTakeFirst();

          if (!user) {
            // User does not exist. Check if registration is allowed.
            const settings = await db
              .selectFrom("systemSettings")
              .select("publicRegistrationEnabled")
              .executeTakeFirst();
            const isPublicEnabled = settings?.publicRegistrationEnabled === 1;

            const invitation = await db
              .selectFrom("invitations")
              .select("id")
              .where("email", "=", email)
              .where("acceptedAt", "is", null)
              .where(
                "expiresAt",
                ">",
                new Date().toISOString() as unknown as Date,
              )
              .executeTakeFirst();

            if (!invitation && !isPublicEnabled) {
              // Registration disabled and no invite -> block
              return;
            }
          }

          const emailHtml = await render(MagicLinkEmail({ loginUrl: url }));
          await sendEmail({
            to: email,
            subject: "Your Ideon Login Link",
            html: emailHtml,
          });
        },
      }),
      Credentials({
        credentials: {
          identifier: { label: "Email or Username", type: "text" },
          password: { label: "Password", type: "password" },
        },
        authorize: async (credentials) => {
          const headersList = await headers();
          const ip = headersList.get("x-forwarded-for") || "127.0.0.1";

          const rateLimiter = getRateLimiter();
          try {
            await rateLimiter.consume(ip);
          } catch (err) {
            // Check if it's a rate limiter rejection (not enough points)
            if (err instanceof Error) {
              console.error("RateLimiter Error:", err);
            } else {
              // It's a rate limit rejection
              await logSecurityEvent("loginRatelimit", "failure", { ip });
              throw new Error(
                "Too many login attempts. Please try again later.",
              );
            }
          }

          const parsed = z
            .object({
              identifier: z.string().nullable().optional(),
              password: z.string().nullable().optional(),
            })
            .safeParse(credentials);

          if (!parsed.success) {
            return null;
          }

          const { identifier, password } = parsed.data;

          if (!identifier || !password) return null;

          const user = await db
            .selectFrom("users")
            .selectAll()
            .where((eb) =>
              eb.or([
                eb("email", "=", identifier),
                eb("username", "=", identifier),
              ]),
            )
            .executeTakeFirst();

          if (!user || !user.passwordHash) {
            await logSecurityEvent("loginPassword", "failure", { ip });
            throw new CredentialsSignin();
          }

          const isValid = await argon2.verify(user.passwordHash, password);

          if (!isValid) {
            await logSecurityEvent("loginPassword", "failure", {
              userId: user.id,
              ip,
            });
            throw new CredentialsSignin();
          }

          await logSecurityEvent("loginPassword", "success", {
            userId: user.id,
            ip,
          });

          return {
            id: user.id,
            email: user.email,
            name: user.displayName || user.username,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
          };
        },
      }),
      Google({
        clientId: freshConfig.google?.clientId,
        clientSecret: freshConfig.google?.clientSecret,
        allowDangerousEmailAccountLinking: true,
      }),
      Discord({
        clientId: freshConfig.discord?.clientId,
        clientSecret: freshConfig.discord?.clientSecret,
        allowDangerousEmailAccountLinking: true,
      }),
      Slack({
        clientId: freshConfig.slack?.clientId,
        clientSecret: freshConfig.slack?.clientSecret,
        allowDangerousEmailAccountLinking: true,
      }),
      GitLab({
        clientId: freshConfig.gitlab?.clientId,
        clientSecret: freshConfig.gitlab?.clientSecret,
        allowDangerousEmailAccountLinking: true,
      }),
      AzureAD({
        clientId: freshConfig.entra?.clientId,
        clientSecret: freshConfig.entra?.clientSecret,
        issuer: `https://login.microsoftonline.com/${freshConfig.entra?.tenantId}/v2.0`,
        allowDangerousEmailAccountLinking: true,
      }),
      ...(freshConfig.saml?.enabled
        ? [
            {
              id: "saml",
              name: "SAML SSO",
              type: "oidc" as const,
              issuer: process.env.APP_URL
                ? `${process.env.APP_URL}/api/oauth`
                : "http://localhost:3000/api/oauth",
              clientId: "tenant=default&product=ideon",
              clientSecret: "dummy",
              authorization: { params: { scope: "openid email profile" } },
              checks: ["pkce", "state"] as ("pkce" | "state")[],
              allowDangerousEmailAccountLinking: true,
            },
          ]
        : []),
      ...(freshConfig.oidc?.issuer
        ? [
            {
              id: "oidc",
              name: "OIDC",
              type: "oidc" as const,
              clientId: freshConfig.oidc?.clientId,
              clientSecret: freshConfig.oidc?.clientSecret,
              issuer: freshConfig.oidc?.issuer,
              allowDangerousEmailAccountLinking: true,
              authorization: { params: { scope: "openid email profile" } },
              profile(profile: {
                sub: string;
                name?: string;
                preferred_username?: string;
                nickname?: string;
                email?: string;
                picture?: string;
                avatar?: string;
                avatar_url?: string;
                [key: string]: unknown;
              }) {
                return {
                  id: profile.sub,
                  name:
                    profile.name ||
                    profile.preferred_username ||
                    profile.nickname,
                  email: profile.email,
                  image:
                    profile.picture || profile.avatar || profile.avatar_url,
                };
              },
            },
          ]
        : []),
    ],
    callbacks: {
      async signIn({ user, account }) {
        try {
          const headersList = await headers();
          const ip = headersList.get("x-forwarded-for") || "127.0.0.1";

          if (account?.provider === "credentials") return true;
          if (!user.email) {
            await logSecurityEvent("loginSSO:unknown", "failure", { ip });
            return false;
          }

          const email = user.email.toLowerCase();

          const existingUser = await db
            .selectFrom("users")
            .selectAll()
            .where("email", "=", email)
            .executeTakeFirst();

          if (existingUser) {
            // User exists, clean up any pending invitations
            await db
              .deleteFrom("invitations")
              .where("email", "=", email)
              .execute();

            await logSecurityEvent(`loginSSO:${account?.provider}`, "success", {
              userId: existingUser.id,
              ip,
            });
            return true;
          }

          // User does not exist, check registration conditions
          const settings = await db
            .selectFrom("systemSettings")
            .select(["publicRegistrationEnabled", "ssoRegistrationEnabled"])
            .executeTakeFirst();

          const isPublicEnabled = settings?.publicRegistrationEnabled === 1;
          const isSsoEnabled = settings?.ssoRegistrationEnabled === 1;

          const invitation = await db
            .selectFrom("invitations")
            .selectAll()
            .where("email", "=", email)
            .where("acceptedAt", "is", null)
            .where(
              "expiresAt",
              ">",
              new Date().toISOString() as unknown as Date,
            )
            .orderBy("createdAt", "desc")
            .executeTakeFirst();

          if (!invitation && !isPublicEnabled && !isSsoEnabled) {
            await logSecurityEvent(`loginSSO:${account?.provider}`, "failure", {
              ip,
            });
            return "/login?error=registrationDisabled";
          }

          // Return true to allow NextAuth to proceed with Adapter's createUser
          return true;
        } catch (error) {
          console.error("[Auth] SignIn error:", error);
          return false;
        }
      },
      async jwt({ token, user, account }) {
        if (user && account) {
          const email = user.email?.toLowerCase();
          // For OAuth providers, user.id is the provider's ID.
          // We need to find our internal user by email.
          const dbUser = await db
            .selectFrom("users")
            .select([
              "id",
              "role",
              "avatarUrl",
              "color",
              "username",
              "displayName",
            ])
            .where("email", "=", email!)
            .executeTakeFirst();

          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.avatarUrl = dbUser.avatarUrl;
            token.color = dbUser.color;
            token.username = dbUser.username;
            token.displayName = dbUser.displayName;
          }
        }
        return token;
      },
      async session({ session, token }) {
        if (token && session.user) {
          const user = session.user as unknown as AuthUser;
          user.id = token.id as string;
          user.role = token.role as "superadmin" | "admin" | "member";
          user.avatarUrl = token.avatarUrl as string | null;
          user.color = token.color as string | null;
          user.username = token.username as string;
          user.displayName = token.displayName as string | null;
        }
        return session;
      },
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },
    logger: {
      error(error) {
        // Suppress CredentialsSignin stack trace but keep the 401 status in logs
        if (
          error.name === "CredentialsSignin" ||
          error.message?.includes("CredentialsSignin")
        ) {
          return;
        }
        console.error(error);
      },
    },
  };
});

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  name?: string | null;
  displayName?: string | null;
  role: "superadmin" | "admin" | "member";
  avatarUrl?: string | null;
  color?: string | null;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await auth();
  const user = session?.user as unknown as AuthUser | undefined;
  if (!user) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Auth] No session found");
    }
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? "",
    username: user.username ?? user.name ?? "",
    displayName: user.displayName,
    role: user.role ?? "member",
    avatarUrl: user.avatarUrl,
    color: user.color,
  };
}
