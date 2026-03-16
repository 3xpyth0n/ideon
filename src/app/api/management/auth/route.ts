import { getDb } from "@lib/db";
import { adminAction } from "@lib/server-utils";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";
import { getClientIp } from "@lib/security-utils";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

export const GET = adminAction(
  async (_req, { user }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();
    const settings = await db
      .selectFrom("systemSettings")
      .select([
        "publicRegistrationEnabled",
        "ssoRegistrationEnabled",
        "passwordLoginEnabled",
        "authProvidersJson",
      ])
      .limit(1)
      .executeTakeFirst();

    if (!settings) {
      return {
        publicRegistrationEnabled: true,
        ssoRegistrationEnabled: true,
        passwordLoginEnabled: true,
        authProviders: {},
      };
    }

    return {
      publicRegistrationEnabled: !!settings.publicRegistrationEnabled,
      ssoRegistrationEnabled: !!settings.ssoRegistrationEnabled,
      passwordLoginEnabled: !!settings.passwordLoginEnabled,
      authProviders: JSON.parse(settings.authProvidersJson || "{}"),
      appUrl:
        process.env.APP_URL ||
        `http://localhost:${process.env.APP_PORT || "3000"}`,
    };
  },
  { requireUser: true },
);

export const POST = adminAction(
  async (_req, { body, user }) => {
    if (!user) throw new Error("Unauthorized");
    const {
      publicRegistrationEnabled,
      ssoRegistrationEnabled,
      passwordLoginEnabled,
      authProviders,
    } = body as {
      publicRegistrationEnabled: boolean;
      ssoRegistrationEnabled: boolean;
      passwordLoginEnabled: boolean;
      authProviders: Record<string, unknown>;
    };

    // Validation
    if (passwordLoginEnabled === false) {
      const activeProviders = Object.values(authProviders || {}).filter(
        (p: unknown): p is { enabled: boolean } =>
          !!p &&
          typeof p === "object" &&
          "enabled" in (p as object) &&
          (p as { enabled: boolean }).enabled === true,
      );
      if (activeProviders.length === 0) {
        throw {
          status: 400,
          message:
            "Cannot disable password login without an active SSO provider.",
        };
      }
    }

    const db = getDb();

    const existing = await db
      .selectFrom("systemSettings")
      .select("id")
      .limit(1)
      .executeTakeFirst();

    if (existing) {
      const ssoConfig = (authProviders as Record<string, unknown>) || {};
      if (ssoConfig.vercel) {
        const vercel = ssoConfig.vercel as Record<string, unknown>;
        vercel.enabled = true;
        vercel.patEnabled = true;
      }

      await db
        .updateTable("systemSettings")
        .set({
          publicRegistrationEnabled: publicRegistrationEnabled ? 1 : 0,
          ssoRegistrationEnabled: ssoRegistrationEnabled ? 1 : 0,
          passwordLoginEnabled: passwordLoginEnabled ? 1 : 0,
          authProvidersJson: JSON.stringify(ssoConfig),
        })
        .where("id", "=", existing.id)
        .execute();
    } else {
      const ssoConfig = (authProviders as Record<string, unknown>) || {};
      if (ssoConfig.vercel) {
        const vercel = ssoConfig.vercel as Record<string, unknown>;
        vercel.enabled = true;
        vercel.patEnabled = true;
      }

      await db
        .insertInto("systemSettings")
        .values({
          id: uuidv4(),
          publicRegistrationEnabled: publicRegistrationEnabled ? 1 : 0,
          ssoRegistrationEnabled: ssoRegistrationEnabled ? 1 : 0,
          passwordLoginEnabled: passwordLoginEnabled ? 1 : 0,
          authProvidersJson: JSON.stringify(ssoConfig),
          installed: 1,
        })
        .execute();
    }

    const headersList = await headers();
    const ip = getClientIp(headersList);
    await logSecurityEvent("updateAuthSettings", "success", {
      userId: user.id,
      ip,
    });

    return { success: true };
  },
  { requireUser: true },
);
