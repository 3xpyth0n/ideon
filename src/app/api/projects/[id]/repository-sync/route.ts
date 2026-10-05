import { getDb } from "@lib/db";
import { projectAction } from "@lib/server-utils";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyRepositorySyncPlan,
  RepositorySyncApplyError,
} from "../../../../../lib/repository-sync/apply";
import { prepareRepositorySyncImport } from "../../../../../lib/repository-sync/deserialize";
import {
  mergeRepositorySyncBundles,
  RepositorySyncMergeError,
  type RepositorySyncConflictMode,
} from "../../../../../lib/repository-sync/merge";
import {
  parseRepositorySyncBundle,
  parseRepositorySyncManifest,
  RepositorySyncFormatError,
  repositorySyncLimits,
} from "../../../../../lib/repository-sync/manifest";
import { createProjectRepositoryBundle } from "../../../../../lib/repository-sync/project";
import {
  RepositoryRemoteSettingsError,
  validateRepositoryRemoteSettings,
} from "../../../../../lib/repository-sync/remote-settings";
import { unzipRepositorySyncBundle } from "../../../../../lib/repository-sync/zip";

const conflictModes: readonly RepositorySyncConflictMode[] = [
  "git-wins",
  "ideon-wins",
  "manual",
];

const configBodySchema = z
  .object({
    repositoryUrl: z.string().trim().min(1).max(2048),
    repositoryUsername: z.string().trim().min(1).max(255).nullable().optional(),
    branch: z.string().min(1).max(255),
    repositoryPath: z.string().max(512).default(""),
  })
  .strict();

export const GET = projectAction(
  async (_request, { project }) => {
    const state = await getDb()
      .selectFrom("projectRepositorySyncs")
      .select([
        "repositoryUrl",
        "repositoryUsername",
        "branch",
        "repositoryPath",
        "lastSyncedCommit",
        "updatedAt",
      ])
      .where("projectId", "=", project.id)
      .executeTakeFirst();

    return {
      configured: Boolean(state?.repositoryUrl),
      repositoryUrl: state?.repositoryUrl ?? null,
      repositoryUsername: state?.repositoryUsername ?? null,
      branch: state?.branch ?? null,
      repositoryPath: state?.repositoryPath ?? "",
      lastSyncedCommit: state?.lastSyncedCommit ?? null,
      updatedAt: state?.updatedAt ?? null,
    };
  },
  { minRole: "owner" },
);

export const PATCH = projectAction<unknown, z.infer<typeof configBodySchema>>(
  async (_request, { project, body }) => {
    let settings;
    try {
      settings = await validateRepositoryRemoteSettings(body);
    } catch (error) {
      if (error instanceof RepositoryRemoteSettingsError) {
        return NextResponse.json(
          { error: "Invalid repository settings", code: error.code },
          { status: 400 },
        );
      }
      throw error;
    }

    const db = getDb();
    const current = await db
      .selectFrom("projectRepositorySyncs")
      .selectAll()
      .where("projectId", "=", project.id)
      .executeTakeFirst();
    const unchanged =
      current?.repositoryUrl === settings.repositoryUrl &&
      current.repositoryUsername === settings.repositoryUsername &&
      current.branch === settings.branch &&
      current.repositoryPath === settings.repositoryPath;
    const now = new Date().toISOString();

    await db
      .insertInto("projectRepositorySyncs")
      .values({
        projectId: project.id,
        remoteProjectId: current?.remoteProjectId ?? project.id,
        repositoryUrl: settings.repositoryUrl,
        repositoryUsername: settings.repositoryUsername,
        branch: settings.branch,
        repositoryPath: settings.repositoryPath,
        lastSyncedCommit: unchanged ? current?.lastSyncedCommit ?? null : null,
        baseManifest: unchanged ? current?.baseManifest ?? null : null,
        blockIdMap: unchanged ? current?.blockIdMap ?? "{}" : "{}",
        linkIdMap: unchanged ? current?.linkIdMap ?? "{}" : "{}",
        updatedAt: now,
      })
      .onConflict((conflict) =>
        conflict.column("projectId").doUpdateSet({
          repositoryUrl: settings.repositoryUrl,
          repositoryUsername: settings.repositoryUsername,
          branch: settings.branch,
          repositoryPath: settings.repositoryPath,
          lastSyncedCommit: unchanged
            ? current?.lastSyncedCommit ?? null
            : null,
          baseManifest: unchanged ? current?.baseManifest ?? null : null,
          blockIdMap: unchanged ? current?.blockIdMap ?? "{}" : "{}",
          linkIdMap: unchanged ? current?.linkIdMap ?? "{}" : "{}",
          updatedAt: now,
        }),
      )
      .execute();

    return {
      configured: true,
      repositoryUrl: settings.repositoryUrl,
      repositoryUsername: settings.repositoryUsername,
      branch: settings.branch,
      repositoryPath: settings.repositoryPath,
      lastSyncedCommit: unchanged ? current?.lastSyncedCommit ?? null : null,
    };
  },
  { schema: configBodySchema, minRole: "owner" },
);

export const DELETE = projectAction(
  async (_request, { project }) => {
    await getDb()
      .deleteFrom("projectRepositorySyncs")
      .where("projectId", "=", project.id)
      .execute();
    return { success: true };
  },
  { minRole: "owner" },
);

async function readLimitedBody(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw { status: 400, message: "Repository archive is missing" };

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > repositorySyncLimits.bundleBytes) {
        await reader.cancel();
        throw { status: 413, message: "Repository archive is too large" };
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export const POST = projectAction<unknown>(
  async (request, { project }) => {
    const contentType = request.headers.get("content-type")?.split(";")[0];
    if (
      contentType !== "application/zip" &&
      contentType !== "application/octet-stream"
    ) {
      throw { status: 415, message: "Expected a repository ZIP archive" };
    }

    const declaredLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > repositorySyncLimits.bundleBytes
    ) {
      throw { status: 413, message: "Repository archive is too large" };
    }

    const url = new URL(request.url);
    const requestedMode = url.searchParams.get("mode") ?? "manual";
    if (!conflictModes.includes(requestedMode as RepositorySyncConflictMode)) {
      throw { status: 400, message: "Invalid repository conflict mode" };
    }
    const mode = requestedMode as RepositorySyncConflictMode;

    try {
      const archive = await readLimitedBody(request);
      const incomingBundle = await unzipRepositorySyncBundle(archive);
      const incomingManifest = parseRepositorySyncBundle(incomingBundle);
      const db = getDb();
      const syncState = await db
        .selectFrom("projectRepositorySyncs")
        .selectAll()
        .where("projectId", "=", project.id)
        .executeTakeFirst();
      const remoteProjectId = syncState?.baseManifest
        ? syncState.remoteProjectId
        : incomingManifest.project.id;
      const current = await createProjectRepositoryBundle(
        project,
        remoteProjectId,
      );
      const currentManifest = parseRepositorySyncBundle(current.bundle);

      if (incomingManifest.project.id !== currentManifest.project.id) {
        throw new RepositorySyncMergeError("different_project");
      }

      const baseManifest = syncState?.baseManifest
        ? parseRepositorySyncManifest(JSON.parse(syncState.baseManifest))
        : currentManifest;
      const merge = mergeRepositorySyncBundles(
        baseManifest,
        current.bundle,
        incomingBundle,
        mode,
      );
      if (mode === "manual" && merge.conflicts.length > 0) {
        return NextResponse.json(
          {
            error: "Repository changes contain conflicts",
            conflicts: merge.conflicts,
          },
          { status: 409 },
        );
      }
      const mergedManifest = parseRepositorySyncBundle(merge.bundle);
      const plan = prepareRepositorySyncImport(
        merge.bundle,
        project.ownerId,
        current.blockIdMap,
        current.linkIdMap,
      );

      await applyRepositorySyncPlan(
        project,
        syncState,
        mergedManifest,
        merge.bundle,
        plan,
      );

      return NextResponse.json({
        success: true,
        projectId: project.id,
        conflicts: merge.conflicts,
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
      if (error instanceof RepositorySyncApplyError) {
        return NextResponse.json(
          { error: "Repository sync was not applied", code: error.code },
          { status: error.code === "persistence_unavailable" ? 503 : 409 },
        );
      }
      throw error;
    }
  },
  { minRole: "owner" },
);
