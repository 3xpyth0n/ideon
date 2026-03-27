import { Adapter, AdapterUser, AdapterAccount } from "next-auth/adapters";
import { getDb } from "./db";
import { stringToColor } from "./utils";
import { v4 as uuidv4 } from "uuid";
import { hashToken } from "./crypto";
import { headers } from "next/headers";
import { logSecurityEvent } from "./audit";
import { logger } from "./logger";

export function KyselyAdapter(): Adapter {
  const db = getDb();

  return {
    async createUser(user: AdapterUser) {
      let ip = "127.0.0.1";
      try {
        const headersList = await headers();
        ip = headersList.get("x-forwarded-for") || ip;
      } catch {
        // headers() may be unavailable outside of a request context (tests, background jobs)
      }
      const email = user.email.toLowerCase();

      // Check registration conditions and invitations
      const settings = await db
        .selectFrom("systemSettings")
        .select("ssoRegistrationEnabled")
        .executeTakeFirst();

      const isSsoEnabled = settings?.ssoRegistrationEnabled === 1;

      const invitation = await db
        .selectFrom("invitations")
        .selectAll()
        .where("email", "=", email)
        .where("acceptedAt", "is", null)
        .where("expiresAt", ">", new Date().toISOString() as unknown as Date)
        .orderBy("createdAt", "desc")
        .executeTakeFirst();

      if (!invitation && !isSsoEnabled) {
        logger.error(
          { email, ip },
          "Registration blocked: SSO disabled and no invitation found",
        );
        await logSecurityEvent("register:blocked", "failure", { ip });
        throw new Error("Registration disabled");
      }

      // Determine username
      const ssoName = user.name || "";
      const emailPrefix = email.split("@")[0];
      let chosenUsername = "";

      const checkUsername = async (username: string) => {
        if (!username) return false;
        const userWithUsername = await db
          .selectFrom("users")
          .select("id")
          .where("username", "=", username)
          .executeTakeFirst();
        return !userWithUsername;
      };

      if (await checkUsername(ssoName)) {
        chosenUsername = ssoName;
      } else if (await checkUsername(emailPrefix)) {
        chosenUsername = emailPrefix;
      } else {
        // Fallback: append random string
        chosenUsername = `${emailPrefix}_${uuidv4().slice(0, 4)}`;
      }

      // Generate distinct color
      const userColor = stringToColor(chosenUsername);
      const newUserId = uuidv4();

      try {
        // Try an insert that does nothing on email conflict, then select the
        // existing or newly created row inside the same transaction. This
        // avoids a race where two concurrent SSO callbacks try to create the
        // same user.
        const createdOrExisting = await db
          .transaction()
          .execute(async (trx) => {
            await trx
              .insertInto("users")
              .values({
                id: newUserId,
                email: email,
                username: chosenUsername,
                displayName: user.name || chosenUsername,
                avatarUrl: user.image || null,
                role:
                  (invitation?.role as "superadmin" | "admin" | "member") ||
                  "member",
                color: userColor,
                createdAt: new Date().toISOString(),
              })
              .onConflict((oc) => oc.column("email").doNothing())
              .execute();

            // Ensure invitations are marked accepted when present.
            if (invitation) {
              await trx
                .updateTable("invitations")
                .set({ acceptedAt: new Date().toISOString() })
                .where("id", "=", invitation.id)
                .execute();
            }

            const userRow = await trx
              .selectFrom("users")
              .selectAll()
              .where("email", "=", email)
              .executeTakeFirst();

            if (!userRow) {
              throw new Error("Failed to create or locate user after insert");
            }

            return userRow;
          });

        // If the returned row id matches our generated id, it means we
        // successfully created the user; otherwise another concurrent
        // creation won the race and we should treat it as a conflict but
        // return the existing user.
        if (createdOrExisting.id === newUserId) {
          await logSecurityEvent("register:success", "success", {
            userId: newUserId,
            ip,
          });
        } else {
          await logSecurityEvent("register:conflict", "success", {
            existingUserId: createdOrExisting.id,
            ip,
          });
        }

        return {
          id: createdOrExisting.id,
          email: createdOrExisting.email,
          emailVerified: user.emailVerified ?? null,
          name: createdOrExisting.displayName,
          image: createdOrExisting.avatarUrl || null,
        } as AdapterUser;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err, email, ip }, "User creation failed");
        await logSecurityEvent("register:error", "failure", {
          error: errMsg,
          ip,
        });
        throw err;
      }
    },

    async getUser(id) {
      const user = await db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", id)
        .executeTakeFirst();

      if (!user) return null;

      return {
        id: user.id,
        email: user.email,
        emailVerified: null,
        name: user.displayName,
        image: user.avatarUrl,
      } as AdapterUser;
    },

    async getUserByEmail(email) {
      const user = await db
        .selectFrom("users")
        .selectAll()
        .where("email", "=", email)
        .executeTakeFirst();

      if (!user) return null;

      return {
        id: user.id,
        email: user.email,
        emailVerified: null,
        name: user.displayName,
        image: user.avatarUrl,
      } as AdapterUser;
    },

    async getUserByAccount({
      provider,
      providerAccountId,
    }: {
      provider: string;
      providerAccountId: string;
    }) {
      // Look up account by provider+providerAccountId and return linked user
      const accountRow = await db
        .selectFrom("accounts")
        .selectAll()
        .where("provider", "=", provider)
        .where("providerAccountId", "=", providerAccountId)
        .executeTakeFirst();

      if (!accountRow) return null;

      const user = await db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", accountRow.userId)
        .executeTakeFirst();

      if (!user) return null;

      return {
        id: user.id,
        email: user.email,
        emailVerified: null,
        name: user.displayName,
        image: user.avatarUrl,
      } as AdapterUser;
    },

    async updateUser(user) {
      if (!user.id) throw new Error("User ID is required");

      const updateData: Record<string, unknown> = {};
      if (user.name) updateData.displayName = user.name;
      if (user.image) updateData.avatarUrl = user.image;

      if (Object.keys(updateData).length > 0) {
        await db
          .updateTable("users")
          .set(updateData)
          .where("id", "=", user.id)
          .execute();
      }

      return (await this.getUser!(user.id)) as AdapterUser;
    },

    async deleteUser(userId) {
      await db.deleteFrom("users").where("id", "=", userId).execute();
    },

    async linkAccount(account: AdapterAccount) {
      // Persist provider account mapping to avoid relying on email-only linking.
      try {
        await db
          .insertInto("accounts")
          .values({
            id: uuidv4(),
            userId: account.userId,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            accessToken: account.access_token || null,
            refreshToken: account.refresh_token || null,
            expiresAt: account.expires_at || null,
            scope: account.scope || null,
            createdAt: new Date().toISOString(),
          })
          .onConflict((oc) =>
            oc.columns(["provider", "providerAccountId"]).doNothing(),
          )
          .execute();
      } catch (err) {
        // Log but do not fail linking for now
        logger.warn(
          { err, account },
          "linkAccount: failed to persist account mapping",
        );
        await logSecurityEvent("sso:linkAccount:error", "failure", {
          error: String(err),
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        });
      }

      return account;
    },

    async unlinkAccount() {
      // Not implemented
    },

    async createSession({ sessionToken, userId, expires }) {
      const id = uuidv4();
      await db
        .insertInto("sessions")
        .values({
          id,
          userId,
          expiresAt: expires.getTime(),
        })
        .execute();

      return {
        sessionToken,
        userId,
        expires,
      };
    },

    async getSessionAndUser(sessionToken) {
      const session = await db
        .selectFrom("sessions")
        .selectAll()
        .where("id", "=", sessionToken)
        .executeTakeFirst();

      if (!session) return null;

      const user = await db
        .selectFrom("users")
        .selectAll()
        .where("id", "=", session.userId)
        .executeTakeFirst();

      if (!user) return null;

      return {
        session: {
          sessionToken: session.id,
          userId: session.userId,
          expires: new Date(session.expiresAt),
        },
        user: {
          id: user.id,
          email: user.email,
          emailVerified: null,
          name: user.displayName,
          image: user.avatarUrl,
        } as AdapterUser,
      };
    },

    async updateSession() {
      // Minimal implementation
      return null;
    },

    async deleteSession(sessionToken) {
      await db.deleteFrom("sessions").where("id", "=", sessionToken).execute();
    },

    async createVerificationToken(token) {
      // Fetch system settings to get custom expiration
      const settings = await db
        .selectFrom("systemSettings")
        .select("authProvidersJson")
        .executeTakeFirst();

      const authProviders = JSON.parse(settings?.authProvidersJson || "{}");
      const expiresInMinutes = authProviders.magicLink?.expiresInMinutes || 15;

      const expires = new Date(Date.now() + expiresInMinutes * 60000);

      await db
        .insertInto("magicLinks")
        .values({
          id: uuidv4(),
          email: token.identifier,
          token: hashToken(token.token),
          expiresAt: expires.toISOString(),
        })
        .execute();

      return {
        ...token,
        expires,
      };
    },

    async useVerificationToken({ identifier, token }) {
      const hashedToken = hashToken(token);
      const magicLink = await db
        .selectFrom("magicLinks")
        .selectAll()
        .where("email", "=", identifier)
        .where("token", "=", hashedToken)
        .executeTakeFirst();

      if (!magicLink) return null;

      await db
        .deleteFrom("magicLinks")
        .where("id", "=", magicLink.id)
        .execute();

      return {
        identifier: magicLink.email,
        token: magicLink.token,
        expires: new Date(magicLink.expiresAt),
      };
    },
  };
}
