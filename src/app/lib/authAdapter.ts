import { Adapter, AdapterUser } from "@auth/core/adapters";
import { getDb } from "./db";
import { stringToColor } from "./utils";
import * as crypto from "crypto";
import { headers } from "next/headers";
import { logSecurityEvent } from "./audit";

export function KyselyAdapter(): Adapter {
  const db = getDb();

  return {
    async createUser(user) {
      const headersList = await headers();
      const ip = headersList.get("x-forwarded-for") || "127.0.0.1";
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
        chosenUsername = `${emailPrefix}_${crypto.randomUUID().slice(0, 4)}`;
      }

      // Generate distinct color
      const userColor = stringToColor(chosenUsername);
      const newUserId = crypto.randomUUID();

      // Insert user and update invitation in transaction
      // Note: Kysely transaction returns the result of the callback
      await db.transaction().execute(async (trx) => {
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
          .execute();

        if (invitation) {
          await trx
            .updateTable("invitations")
            .set({ acceptedAt: new Date().toISOString() })
            .where("id", "=", invitation.id)
            .execute();
        }
      });

      await logSecurityEvent("register:success", "success", {
        userId: newUserId,
        ip,
      });

      return {
        id: newUserId,
        email: email,
        emailVerified: null,
        name: user.name || chosenUsername,
        image: user.image || null,
      } as AdapterUser;
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
      provider: _provider,
      providerAccountId: _providerAccountId,
    }) {
      // Not implemented as we don't have accounts table yet
      return null;
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

    async linkAccount(account) {
      // Not implemented
      return account;
    },

    async unlinkAccount({
      provider: _provider,
      providerAccountId: _providerAccountId,
    }) {
      // Not implemented
    },

    async createSession({ sessionToken, userId, expires }) {
      // Not using database sessions (JWT strategy)
      // But implementing this for completeness if switched to database strategy
      const id = crypto.randomUUID();
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

    async updateSession({ sessionToken: _sessionToken }) {
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
          id: crypto.randomUUID(),
          email: token.identifier,
          token: token.token,
          expiresAt: expires.toISOString(),
        })
        .execute();

      return {
        ...token,
        expires,
      };
    },

    async useVerificationToken({ identifier, token }) {
      const magicLink = await db
        .selectFrom("magicLinks")
        .selectAll()
        .where("email", "=", identifier)
        .where("token", "=", token)
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
