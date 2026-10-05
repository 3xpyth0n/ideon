import { getDb } from "@lib/db";
import type { Project } from "@lib/types/db";
import { applyRepositorySyncPlan } from "./apply";
import { prepareRepositorySyncImport } from "./deserialize";
import { RepositoryGitError, withRemoteRepository } from "./git";
import {
  mergeRepositorySyncBundles,
  RepositorySyncMergeError,
  type RepositorySyncConflict,
  type RepositorySyncConflictMode,
} from "./merge";
import {
  parseRepositorySyncBundle,
  parseRepositorySyncManifest,
} from "./manifest";
import { createProjectRepositoryBundle } from "./project";

export class RepositorySyncConflictError extends Error {
  constructor(readonly conflicts: RepositorySyncConflict[]) {
    super("Repository changes contain conflicts");
    this.name = "RepositorySyncConflictError";
  }
}

export interface RepositorySyncResult {
  commit: string | null;
  conflicts: RepositorySyncConflict[];
}

export async function syncProjectRepository(
  project: Pick<Project, "id" | "ownerId" | "name" | "description">,
  userId: string,
  mode: RepositorySyncConflictMode,
): Promise<RepositorySyncResult> {
  const syncState = await getDb()
    .selectFrom("projectRepositorySyncs")
    .selectAll()
    .where("projectId", "=", project.id)
    .executeTakeFirst();
  if (!syncState?.repositoryUrl || !syncState.branch) {
    throw new RepositoryGitError("remote_unavailable");
  }

  return withRemoteRepository(
    {
      repositoryUrl: syncState.repositoryUrl,
      repositoryUsername: syncState.repositoryUsername,
      branch: syncState.branch,
      repositoryPath: syncState.repositoryPath,
    },
    userId,
    {
      id: syncState.remoteProjectId,
      name: project.name,
      description: project.description,
    },
    async (remote) => {
      const remoteManifest = parseRepositorySyncBundle(remote.bundle);
      const remoteProjectId = syncState.baseManifest
        ? syncState.remoteProjectId
        : remoteManifest.project.id;
      if (remoteManifest.project.id !== remoteProjectId) {
        throw new RepositorySyncMergeError("different_project");
      }

      const current = await createProjectRepositoryBundle(
        project,
        remoteProjectId,
      );
      const currentManifest = parseRepositorySyncBundle(current.bundle);
      const baseManifest = syncState.baseManifest
        ? parseRepositorySyncManifest(JSON.parse(syncState.baseManifest))
        : currentManifest;
      const merge = mergeRepositorySyncBundles(
        baseManifest,
        current.bundle,
        remote.bundle,
        mode,
      );

      if (mode === "manual" && merge.conflicts.length > 0) {
        throw new RepositorySyncConflictError(merge.conflicts);
      }

      const manifest = parseRepositorySyncBundle(merge.bundle);
      const plan = prepareRepositorySyncImport(
        merge.bundle,
        project.ownerId,
        current.blockIdMap,
        current.linkIdMap,
      );
      const commit = await remote.commitBundle(merge.bundle);
      await applyRepositorySyncPlan(
        project,
        syncState,
        manifest,
        merge.bundle,
        plan,
        commit,
      );

      return { commit, conflicts: merge.conflicts };
    },
  );
}
