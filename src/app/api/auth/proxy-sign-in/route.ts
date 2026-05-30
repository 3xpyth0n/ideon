import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@auth";
import { headers } from "next/headers";
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@lib/db";
import { logSecurityEvent } from "@lib/audit";
import { getProxyTokenSecret } from "@lib/crypto";
import { stringToColor } from "@lib/utils";

function getProxyConfig() {
  return {
    enabled: process.env.AUTH_PROXY_ENABLED === "true",
    secret: process.env.AUTH_PROXY_SECRET ?? "",
    headerUser: process.env.AUTH_PROXY_HEADER_USER ?? "x-remote-user",
    headerEmail: process.env.AUTH_PROXY_HEADER_EMAIL ?? "x-remote-email",
    autoProvision: process.env.AUTH_PROXY_AUTO_PROVISION === "true",
  };
}

export async function GET(req: NextRequest) {
  const config = getProxyConfig();

  if (!config.enabled) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const headersList = await headers();
  const incomingSecret = headersList.get("x-proxy-secret") ?? "";

  if (!config.secret || incomingSecret !== config.secret) {
    await logSecurityEvent("loginProxy", "failure", {
      reason: "invalid_secret",
    });
    return NextResponse.redirect(
      new URL("/login?error=ProxyAuthDenied", req.url),
    );
  }

  const remoteUser = headersList.get(config.headerUser)?.trim() ?? "";
  const remoteEmail =
    headersList.get(config.headerEmail)?.trim().toLowerCase() ?? "";

  if (!remoteEmail) {
    await logSecurityEvent("loginProxy", "failure", {
      reason: "missing_email_header",
    });
    return NextResponse.redirect(
      new URL("/login?error=ProxyAuthNoAccount", req.url),
    );
  }

  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") ?? "/home";
  const db = getDb();

  let user = await db
    .selectFrom("users")
    .selectAll()
    .where("email", "=", remoteEmail)
    .executeTakeFirst();

  if (!user) {
    if (!config.autoProvision) {
      await logSecurityEvent("loginProxy", "failure", {
        email: remoteEmail,
        reason: "no_account",
      });
      return NextResponse.redirect(
        new URL("/login?error=ProxyAuthNoAccount", req.url),
      );
    }

    const emailPrefix = remoteEmail.split("@")[0];
    const userCandidate = remoteUser.includes("@")
      ? remoteUser.split("@")[0]
      : remoteUser || emailPrefix;

    const isAvailable = async (username: string) => {
      if (!username) return false;
      const row = await db
        .selectFrom("users")
        .select("id")
        .where("username", "=", username)
        .executeTakeFirst();
      return !row;
    };

    let chosenUsername: string;
    if (await isAvailable(userCandidate)) chosenUsername = userCandidate;
    else if (await isAvailable(emailPrefix)) chosenUsername = emailPrefix;
    else chosenUsername = `${emailPrefix}_${uuidv4().slice(0, 4)}`;

    const newId = uuidv4();
    await db
      .insertInto("users")
      .values({
        id: newId,
        email: remoteEmail,
        username: chosenUsername,
        displayName: chosenUsername,
        role: "member",
        color: stringToColor(chosenUsername),
        avatarUrl: null,
        passwordHash: null,
        invitedByUserId: null,
        createdAt: new Date().toISOString(),
        lastOnline: new Date().toISOString(),
      })
      .onConflict((oc) => oc.column("email").doNothing())
      .execute();

    user = await db
      .selectFrom("users")
      .selectAll()
      .where("email", "=", remoteEmail)
      .executeTakeFirst();

    if (!user) {
      await logSecurityEvent("loginProxy", "failure", {
        email: remoteEmail,
        reason: "provision_error",
      });
      return NextResponse.redirect(
        new URL("/login?error=ProxyAuthError", req.url),
      );
    }

    await logSecurityEvent("loginProxy", "success", {
      userId: user.id,
      provisioned: true,
    });
  } else {
    await logSecurityEvent("loginProxy", "success", {
      userId: user.id,
      provisioned: false,
    });
  }

  const internalToken = crypto
    .createHmac("sha256", getProxyTokenSecret())
    .update(user.id)
    .digest("hex");

  // signIn throws NEXT_REDIRECT — return its result directly (same pattern as sso/[provider]/route.ts)
  return await signIn("proxy", {
    userId: user.id,
    internalToken,
    redirectTo: callbackUrl,
  });
}
