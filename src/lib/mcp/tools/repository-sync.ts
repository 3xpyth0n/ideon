import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getGlobalDb, withAuthenticatedSession } from "../../../app/lib/db";
import { getMcpContext } from "../context";
import { checkProjectAccess } from "./projects";
import { syncProjectRepository } from "../../repository-sync/sync";
import type { RepositorySyncConflictMode } from "../../repository-sync/merge";
import { RepositoryGitError } from "../../repository-sync/git";
import { RepositorySyncFormatError } from "../../repository-sync/manifest";
import { RepositorySyncMergeError } from "../../repository-sync/merge";
import { RepositorySyncApplyError } from "../../repository-sync/apply";
import { RepositoryRemoteSettingsError } from "../../repository-sync/remote-settings";

const conflictModes = ["manual", "git-wins", "ideon-wins"] as const;

export function registerRepositorySyncTools(server: McpServer): void {
  server.tool(
    "get_project_repository_sync",
    "Get the configured Git repository and last sync revision for a project. Credentials are never returned.",
    { projectId: z.string().uuid() },
    async ({ projectId }) => {
      const { userId } = getMcpContext();
      await checkProjectAccess(userId, projectId, "owner");
      const state = await getGlobalDb()
        .selectFrom("projectRepositorySyncs")
        .select([
          "repositoryUrl",
          "repositoryUsername",
          "branch",
          "repositoryPath",
          "lastSyncedCommit",
          "updatedAt",
        ])
        .where("projectId", "=", projectId)
        .executeTakeFirst();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                configured: Boolean(state?.repositoryUrl),
                repositoryUrl: state?.repositoryUrl ?? null,
                repositoryUsername: state?.repositoryUsername ?? null,
                branch: state?.branch ?? null,
                repositoryPath: state?.repositoryPath ?? "",
                lastSyncedCommit: state?.lastSyncedCommit ?? null,
                updatedAt: state?.updatedAt ?? null,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "sync_project_repository",
    "Synchronize a project with its configured Git repository. Manual mode reports conflicts without changing either side; Git-wins and Ideon-wins resolve only conflicting items.",
    {
      projectId: z.string().uuid(),
      mode: z.enum(conflictModes).default("manual"),
    },
    async ({ projectId, mode }) => {
      const { userId } = getMcpContext();
      await checkProjectAccess(userId, projectId, "owner");
      const project = await getGlobalDb()
        .selectFrom("projects")
        .select(["id", "ownerId", "name", "description"])
        .where("id", "=", projectId)
        .where("deletedAt", "is", null)
        .executeTakeFirst();
      if (!project) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "Project not found" }],
        };
      }

      try {
        const result = await withAuthenticatedSession(userId, () =>
          syncProjectRepository(
            project,
            userId,
            mode as RepositorySyncConflictMode,
          ),
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ projectId, ...result }, null, 2),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof RepositoryGitError ||
          error instanceof RepositorySyncFormatError ||
          error instanceof RepositorySyncMergeError ||
          error instanceof RepositorySyncApplyError ||
          error instanceof RepositoryRemoteSettingsError
            ? error.code
            : "Repository synchronization failed";
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );
}
