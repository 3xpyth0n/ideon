import { projectAction } from "@lib/server-utils";
import { NextResponse } from "next/server";
import { RepositoryGitError } from "../../../../../../lib/repository-sync/git";
import {
  RepositorySyncMergeError,
  type RepositorySyncConflictMode,
} from "../../../../../../lib/repository-sync/merge";
import { RepositorySyncFormatError } from "../../../../../../lib/repository-sync/manifest";
import { RepositoryRemoteSettingsError } from "../../../../../../lib/repository-sync/remote-settings";
import {
  RepositorySyncConflictError,
  syncProjectRepository,
} from "../../../../../../lib/repository-sync/sync";

export const POST = projectAction<unknown>(
  async (request, { project, user }) => {
    const modeValue = new URL(request.url).searchParams.get("mode") ?? "manual";
    if (
      modeValue !== "git-wins" &&
      modeValue !== "ideon-wins" &&
      modeValue !== "manual"
    ) {
      throw { status: 400, message: "Invalid repository conflict mode" };
    }

    try {
      const result = await syncProjectRepository(
        project,
        user.id,
        modeValue as RepositorySyncConflictMode,
      );
      return NextResponse.json({
        success: true,
        projectId: project.id,
        ...result,
      });
    } catch (error) {
      if (error instanceof RepositorySyncFormatError) {
        return NextResponse.json(
          { error: "Invalid repository sync bundle", code: error.code },
          { status: 400 },
        );
      }
      if (error instanceof RepositorySyncMergeError) {
        return NextResponse.json(
          { error: "Repository changes could not be merged", code: error.code },
          { status: 409 },
        );
      }
      if (error instanceof RepositorySyncConflictError) {
        return NextResponse.json(
          { error: error.message, conflicts: error.conflicts },
          { status: 409 },
        );
      }
      if (error instanceof RepositoryRemoteSettingsError) {
        return NextResponse.json(
          { error: "Repository remote is not allowed", code: error.code },
          { status: 400 },
        );
      }
      if (error instanceof RepositoryGitError) {
        const status =
          error.code === "branch_update_rejected"
            ? 409
            : error.code === "credentials_unavailable"
              ? 401
              : 502;
        return NextResponse.json(
          { error: "Repository sync failed", code: error.code },
          { status },
        );
      }
      throw error;
    }
  },
  { minRole: "owner" },
);
