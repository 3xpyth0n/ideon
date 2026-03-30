import { getToken } from "next-auth/jwt";
import { getDb, withAuthenticatedSession } from "./db";
import { logger } from "./logger";
import { IncomingMessage } from "http";

/**
 * Validates WebSocket connection request.
 * Ensures the user is authenticated and has access to the project.
 */
export async function validateWebsocketRequest(
  req: IncomingMessage,
  docName: string,
): Promise<string | null> {
  try {
    const headers = req.headers as unknown as Record<string, string>;
    const secret = process.env.SECRET_KEY || process.env.AUTH_SECRET;

    if (!secret) {
      logger.error(
        "[WS Auth] CRITICAL: No SECRET_KEY or AUTH_SECRET found in environment.",
      );
      return null;
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
      logger.warn("[WS Auth] No valid session token found.");
      return null;
    }

    const userId = token.sub;

    // docName comes in as "project-<uuid>" or "project-<uuid>-access"
    // We need to handle the suffix
    const isAccessChannel = docName.endsWith("-access");
    const projectId = docName.replace(/^project-/, "").replace(/-access$/, "");

    return withAuthenticatedSession(userId, async () => {
      const db = getDb();

      // Check if user is owner
      const project = await db
        .selectFrom("projects")
        .select("id")
        .where("id", "=", projectId)
        .where("ownerId", "=", userId)
        .executeTakeFirst();

      if (project) {
        return userId;
      }

      // Check if user is collaborator
      const collaborator = await db
        .selectFrom("projectCollaborators")
        .select("userId")
        .where("projectId", "=", projectId)
        .where("userId", "=", userId)
        .executeTakeFirst();

      if (collaborator) {
        return userId;
      }

      // If accessing the access channel, check for pending requests
      if (isAccessChannel) {
        const pendingRequest = await db
          .selectFrom("projectRequests")
          .select("id")
          .where("projectId", "=", projectId)
          .where("userId", "=", userId)
          .where("status", "=", "pending")
          .executeTakeFirst();

        if (pendingRequest) {
          return userId;
        }
      }

      // Check folder inheritance
      const projectInFolder = await db
        .selectFrom("projects")
        .select("folderId")
        .where("id", "=", projectId)
        .executeTakeFirst();

      if (projectInFolder?.folderId) {
        const folderAccess = await db
          .selectFrom("folders")
          .select("id")
          .where("id", "=", projectInFolder.folderId)
          .where((eb) =>
            eb.or([
              eb("ownerId", "=", userId),
              eb(
                "id",
                "in",
                eb
                  .selectFrom("folderCollaborators")
                  .select("folderId")
                  .where("userId", "=", userId),
              ),
            ]),
          )
          .executeTakeFirst();

        if (folderAccess) return userId;
      }

      logger.warn(
        { userId, projectId },
        "[WS Auth] Access denied for user to project",
      );
      return null;
    });
  } catch (err) {
    logger.error({ error: err }, "[WS Auth] Error validating request");
    return null;
  }
}

export async function getUserProjectRole(
  userId: string,
  docName: string,
): Promise<string | null> {
  try {
    const isAccessChannel = docName.endsWith("-access");
    const projectId = docName.replace(/^project-/, "").replace(/-access$/, "");

    return withAuthenticatedSession(userId, async () => {
      const db = getDb();

      const project = await db
        .selectFrom("projects")
        .select(["id", "ownerId"])
        .where("id", "=", projectId)
        .executeTakeFirst();

      if (project) {
        if (project.ownerId === userId) return "owner";
      }

      const collaborator = await db
        .selectFrom("projectCollaborators")
        .select("role")
        .where("projectId", "=", projectId)
        .where("userId", "=", userId)
        .executeTakeFirst();

      if ((collaborator as { role?: string })?.role) {
        return (collaborator as { role?: string }).role as string;
      }

      if (isAccessChannel) {
        const pendingRequest = await db
          .selectFrom("projectRequests")
          .select("id")
          .where("projectId", "=", projectId)
          .where("userId", "=", userId)
          .where("status", "=", "pending")
          .executeTakeFirst();

        if (pendingRequest) return "pending";
      }

      const projectInFolder = await db
        .selectFrom("projects")
        .select("folderId")
        .where("id", "=", projectId)
        .executeTakeFirst();

      if (projectInFolder?.folderId) {
        const folderAccess = await db
          .selectFrom("folders")
          .select("id")
          .where("id", "=", projectInFolder.folderId)
          .where((eb) =>
            eb.or([
              eb("ownerId", "=", userId),
              eb(
                "id",
                "in",
                eb
                  .selectFrom("folderCollaborators")
                  .select("folderId")
                  .where("userId", "=", userId),
              ),
            ]),
          )
          .executeTakeFirst();

        if (folderAccess) return "viewer";
      }

      return null;
    });
  } catch (err) {
    logger.error({ error: err }, "[WS Auth] Error fetching user role");
    return null;
  }
}
