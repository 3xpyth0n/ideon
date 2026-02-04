import { getToken } from "next-auth/jwt";
import { getDb } from "./db";
import { IncomingMessage } from "http";

/**
 * Validates WebSocket connection request.
 * Ensures the user is authenticated and has access to the project.
 */
export async function validateWebsocketRequest(
  req: IncomingMessage,
  docName: string,
): Promise<boolean> {
  try {
    const headers = req.headers as unknown as Record<string, string>;
    const secret = process.env.SECRET_KEY || process.env.AUTH_SECRET;

    if (!secret) {
      console.error(
        "[WS Auth] CRITICAL: No SECRET_KEY or AUTH_SECRET found in environment.",
      );
      return false;
    }

    // 1. Try with the forced name from auth.config.ts
    let token = await getToken({
      req: { headers },
      secret,
      cookieName: "authjs.session-token",
      salt: "authjs.session-token",
    });

    // 2. Fallback: Try with the standard secure prefix if in production/secure env
    if (!token) {
      token = await getToken({
        req: { headers },
        secret,
        cookieName: "__Secure-authjs.session-token",
        salt: "__Secure-authjs.session-token",
      });
    }

    if (!token || !token.sub) {
      console.warn("[WS Auth] No valid session token found.");
      return false;
    }

    const userId = token.sub;

    // docName comes in as "project-<uuid>" but DB stores just "<uuid>"
    const projectId = docName.replace(/^project-/, "");

    const db = getDb();

    // Check if user is owner
    const project = await db
      .selectFrom("projects")
      .select("id")
      .where("id", "=", projectId)
      .where("ownerId", "=", userId)
      .executeTakeFirst();

    if (project) {
      return true;
    }

    // Check if user is collaborator
    const collaborator = await db
      .selectFrom("projectCollaborators")
      .select("userId")
      .where("projectId", "=", projectId)
      .where("userId", "=", userId)
      .executeTakeFirst();

    if (collaborator) {
      return true;
    }

    console.warn(
      `[WS Auth] Access denied for user ${userId} to project ${projectId}`,
    );
    return false;
  } catch (err) {
    // Log error but fail safe (deny access)
    console.error("[WS Auth] Error validating request:", err);
    return false;
  }
}
