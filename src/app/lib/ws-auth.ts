import { decode } from "next-auth/jwt";
import { parse } from "cookie";
import { getDb } from "./db";
import { IncomingMessage } from "http";
import { getAuthSecret } from "./crypto";

/**
 * Validates WebSocket connection request.
 * Ensures the user is authenticated and has access to the project.
 */
export async function validateWebsocketRequest(
  req: IncomingMessage,
  docName: string,
): Promise<boolean> {
  try {
    const cookies = parse(req.headers.cookie || "");

    // 1. Extract Session Token (Support Secure and Non-Secure)
    // NextAuth v5 uses these cookie names by default
    const secureCookieName = "__Secure-authjs.session-token";
    const insecureCookieName = "authjs.session-token";

    const token = cookies[secureCookieName] || cookies[insecureCookieName];

    if (!token) {
      return false;
    }

    // 2. Decode Token
    // We must provide the salt that matches the cookie name
    const salt = cookies[secureCookieName]
      ? secureCookieName
      : insecureCookieName;

    const decoded = await decode({
      token,
      secret: getAuthSecret(),
      salt,
    });

    if (!decoded || !decoded.sub) {
      return false;
    }

    const userId = decoded.sub;

    // 3. Check Project Access
    const db = getDb();

    // Check if user is owner
    const project = await db
      .selectFrom("projects")
      .select("id")
      .where("id", "=", docName)
      .where("ownerId", "=", userId)
      .executeTakeFirst();

    if (project) return true;

    // Check if user is collaborator
    const collaborator = await db
      .selectFrom("projectCollaborators")
      .select("userId")
      .where("projectId", "=", docName)
      .where("userId", "=", userId)
      .executeTakeFirst();

    return !!collaborator;
  } catch (err) {
    // Log error but fail safe (deny access)
    console.error("[WS Auth] Error validating request:", err);
    return false;
  }
}
