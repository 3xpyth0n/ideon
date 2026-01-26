import { getToken } from "next-auth/jwt";
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
    const token = await getToken({
      req: {
        headers: req.headers as unknown as Record<string, string>,
      },
      secret: getAuthSecret(),
      cookieName: "authjs.session-token",
      salt: "authjs.session-token",
    });

    if (!token || !token.sub) {
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

    if (project) return true;

    // Check if user is collaborator
    const collaborator = await db
      .selectFrom("projectCollaborators")
      .select("userId")
      .where("projectId", "=", projectId)
      .where("userId", "=", userId)
      .executeTakeFirst();

    return !!collaborator;
  } catch (err) {
    // Log error but fail safe (deny access)
    console.error("[WS Auth] Error validating request:", err);
    return false;
  }
}
