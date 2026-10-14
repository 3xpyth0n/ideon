import { getDb, runTransaction } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { logSecurityEvent } from "@lib/audit";
import { appendAuditEvent } from "@lib/audit-trail";
import { logger } from "@lib/logger";
import { headers } from "next/headers";

export const DELETE = authenticatedAction(
  async (_req, { user }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";

    try {
      const trashedProjects = await db
        .selectFrom("projects")
        .select(["id", "name"])
        .where("deletedAt", "is not", null)
        .where("ownerId", "=", user.id)
        .execute();

      await runTransaction(db, async (trx) => {
        // Delete Folders (cascades to projects inside, and folderCollaborators)
        await trx
          .deleteFrom("folders")
          .where("deletedAt", "is not", null)
          .where("ownerId", "=", user.id)
          .execute();

        // Delete Projects (cascades to blocks, links, collaborators, etc.)
        await trx
          .deleteFrom("projects")
          .where("deletedAt", "is not", null)
          .where("ownerId", "=", user.id)
          .execute();
      });

      await logSecurityEvent("emptyTrash", "success", {
        userId: user.id,
        ip,
      });

      for (const project of trashedProjects) {
        await appendAuditEvent({
          projectId: project.id,
          userId: user.id,
          action: "project.delete",
          entityType: "project",
          entityId: project.id,
          summary: `Project permanently deleted: ${project.name}`,
          metadata: { scope: "trash" },
        });
      }

      return { success: true };
    } catch (error) {
      logger.error({ error, userId: user.id }, "Empty trash failed");
      await logSecurityEvent("emptyTrash", "failure", {
        userId: user.id,
        ip,
      });

      throw { status: 500, message: "Failed to empty trash" };
    }
  },
  { requireUser: true },
);
