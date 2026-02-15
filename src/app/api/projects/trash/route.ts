import { getDb, runTransaction } from "@lib/db";
import { authenticatedAction } from "@lib/server-utils";
import { logSecurityEvent } from "@lib/audit";
import { headers } from "next/headers";

export const DELETE = authenticatedAction(
  async (_req, { user }) => {
    if (!user) throw new Error("Unauthorized");
    const db = getDb();
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for") || "127.0.0.1";

    try {
      await runTransaction(db, async (trx) => {
        const foldersInTrash = await trx
          .selectFrom("folders")
          .select("id")
          .where("deletedAt", "is not", null)
          .where("ownerId", "=", user.id)
          .execute();

        const folderIds = foldersInTrash.map((f) => f.id);

        const projectsToDelete = await trx
          .selectFrom("projects")
          .select("id")
          .where((eb) =>
            eb.or([
              eb("deletedAt", "is not", null),
              folderIds.length > 0
                ? eb("folderId", "in", folderIds)
                : eb.val(false),
            ]),
          )
          .where("ownerId", "=", user.id)
          .execute();

        const projectIds = projectsToDelete.map((p) => p.id);

        if (projectIds.length > 0) {
          await trx
            .deleteFrom("projectCollaborators")
            .where("projectId", "in", projectIds)
            .execute();
          await trx
            .deleteFrom("projectStars")
            .where("projectId", "in", projectIds)
            .execute();
          await trx
            .deleteFrom("blockSnapshots")
            .where(
              "blockId",
              "in",
              trx
                .selectFrom("blocks")
                .select("id")
                .where("projectId", "in", projectIds),
            )
            .execute();
          await trx
            .deleteFrom("linkPreviews")
            .where(
              "blockId",
              "in",
              trx
                .selectFrom("blocks")
                .select("id")
                .where("projectId", "in", projectIds),
            )
            .execute();
          await trx
            .deleteFrom("blocks")
            .where("projectId", "in", projectIds)
            .execute();
          await trx
            .deleteFrom("links")
            .where("projectId", "in", projectIds)
            .execute();
          await trx
            .deleteFrom("temporalStates")
            .where("projectId", "in", projectIds)
            .execute();
          await trx
            .deleteFrom("projects")
            .where("id", "in", projectIds)
            .execute();
        }

        if (folderIds.length > 0) {
          await trx
            .deleteFrom("folderCollaborators")
            .where("folderId", "in", folderIds)
            .execute();
          await trx
            .deleteFrom("folders")
            .where("id", "in", folderIds)
            .execute();
        }
      });

      await logSecurityEvent("emptyTrash", "success", {
        userId: user.id,
        ip,
      });

      return { success: true };
    } catch (error) {
      console.error("Empty trash failed:", error);
      await logSecurityEvent("emptyTrash", "failure", {
        userId: user.id,
        ip,
      });

      throw { status: 500, message: "Failed to empty trash" };
    }
  },
  { requireUser: true },
);
