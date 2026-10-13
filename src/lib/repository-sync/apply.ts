import { lstat } from "node:fs/promises";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  NewBlock,
  NewLink,
  Project,
  ProjectRepositorySync,
} from "@lib/types/db";
import { getDb, runTransaction } from "@lib/db";
import { appendAuditEvent } from "@lib/audit-trail";
import { getProjectYjsDoc } from "../projectYjsDoc";
import {
  captureCanvasStateSnapshots,
  restoreCanvasStateSnapshots,
} from "../yjs-canvas-state";
import type { RepositorySyncImportPlan } from "./deserialize";
import type { RepositorySyncManifest } from "./manifest";

interface AssetSwap {
  target: string;
  stage: string;
  backup: string;
  hadTarget: boolean;
  committed: boolean;
}

export class RepositorySyncApplyError extends Error {
  constructor(readonly code: "sync_state_changed" | "persistence_unavailable") {
    super(code);
    this.name = "RepositorySyncApplyError";
  }
}

async function stageAssets(
  projectId: string,
  manifest: RepositorySyncManifest,
  bundle: Readonly<Record<string, Uint8Array>>,
): Promise<AssetSwap> {
  const target = join(
    process.cwd(),
    "storage",
    "uploads",
    `project-${projectId}`,
  );
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, ".repository-sync-stage-"));
  const backup = join(parent, `.repository-sync-backup-${randomUUID()}`);

  try {
    for (const file of manifest.files) {
      if (file.kind !== "asset") continue;
      const assetName = file.path.slice("assets/".length);
      if (!file.path.startsWith("assets/") || assetName.includes("/")) {
        throw new Error("Invalid repository asset path");
      }
      const bytes = bundle[`.ideon/${file.path}`];
      if (!bytes) throw new Error("Missing repository asset");
      await writeFile(join(stage, assetName), bytes, { flag: "wx" });
    }
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }

  let hadTarget = false;
  try {
    const targetInfo = await lstat(target);
    if (targetInfo.isSymbolicLink() || !targetInfo.isDirectory()) {
      throw new Error("Invalid project asset directory");
    }
    hadTarget = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      await rm(stage, { recursive: true, force: true });
      throw error;
    }
  }

  return {
    target,
    stage,
    backup,
    hadTarget,
    committed: false,
  };
}

async function commitAssets(swap: AssetSwap): Promise<void> {
  if (swap.hadTarget) await rename(swap.target, swap.backup);
  try {
    await rename(swap.stage, swap.target);
    swap.committed = true;
  } catch (error) {
    if (swap.hadTarget) await rename(swap.backup, swap.target);
    throw error;
  }
}

async function rollbackAssets(swap: AssetSwap): Promise<void> {
  if (swap.committed) {
    await rm(swap.target, { recursive: true, force: true });
    if (swap.hadTarget) await rename(swap.backup, swap.target);
    swap.committed = false;
  }
  await rm(swap.stage, { recursive: true, force: true });
}

async function cleanupAssets(swap: AssetSwap): Promise<void> {
  await rm(swap.stage, { recursive: true, force: true });
  if (swap.committed && swap.hadTarget) {
    await rm(swap.backup, { recursive: true, force: true });
  }
}

function toTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function batches<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function applyRepositorySyncPlan(
  project: Pick<Project, "id" | "ownerId">,
  currentState: ProjectRepositorySync | undefined,
  manifest: RepositorySyncManifest,
  bundle: Readonly<Record<string, Uint8Array>>,
  plan: RepositorySyncImportPlan,
  triggeredBy: string,
  lastSyncedCommit?: string | null,
): Promise<void> {
  if (
    currentState?.baseManifest &&
    manifest.project.id !== currentState.remoteProjectId
  ) {
    throw new RepositorySyncApplyError("sync_state_changed");
  }

  const db = getDb();
  const projectYjsDoc = await getProjectYjsDoc(project.id);
  if (!projectYjsDoc) {
    throw new RepositorySyncApplyError("persistence_unavailable");
  }
  const previousSnapshots = captureCanvasStateSnapshots(projectYjsDoc.doc);
  const now = new Date().toISOString();
  const manifestBytes = bundle[".ideon/manifest.json"];
  if (!manifestBytes) throw new Error("Repository manifest is missing");
  const baseManifest = new TextDecoder().decode(manifestBytes);
  const assetSwap = await stageAssets(project.id, manifest, bundle);
  let yjsUpdated = false;
  let applied = false;

  try {
    const syncCounts = await runTransaction(db, async (trx) => {
      if (currentState) {
        const updatedState = await trx
          .updateTable("projectRepositorySyncs")
          .set({
            remoteProjectId: currentState.baseManifest
              ? currentState.remoteProjectId
              : manifest.project.id,
            baseManifest,
            lastSyncedCommit: lastSyncedCommit ?? currentState.lastSyncedCommit,
            blockIdMap: JSON.stringify(plan.blockIdMap),
            linkIdMap: JSON.stringify(plan.linkIdMap),
            updatedAt: now,
          })
          .where("projectId", "=", project.id)
          .where("updatedAt", "=", currentState.updatedAt)
          .executeTakeFirst();
        if (Number(updatedState.numUpdatedRows) !== 1) {
          throw new RepositorySyncApplyError("sync_state_changed");
        }
      } else {
        await trx
          .insertInto("projectRepositorySyncs")
          .values({
            projectId: project.id,
            remoteProjectId: manifest.project.id,
            repositoryUrl: null,
            branch: null,
            repositoryPath: "",
            lastSyncedCommit: lastSyncedCommit ?? null,
            baseManifest,
            blockIdMap: JSON.stringify(plan.blockIdMap),
            linkIdMap: JSON.stringify(plan.linkIdMap),
            updatedAt: now,
          })
          .execute();
      }

      const currentBlocks = await trx
        .selectFrom("blocks")
        .select(["id", "projectId", "createdAt"])
        .where("projectId", "=", project.id)
        .execute();
      const currentLinks = await trx
        .selectFrom("links")
        .select(["id", "projectId", "createdAt"])
        .where("projectId", "=", project.id)
        .execute();
      const blockIds = new Set(plan.blocks.map((block) => block.id));
      const linkIds = new Set(plan.links.map((link) => link.id));

      const collidingBlock = plan.blocks.length
        ? await trx
            .selectFrom("blocks")
            .select("id")
            .where(
              "id",
              "in",
              plan.blocks.map((block) => block.id),
            )
            .where("projectId", "!=", project.id)
            .executeTakeFirst()
        : undefined;
      const collidingLink = plan.links.length
        ? await trx
            .selectFrom("links")
            .select("id")
            .where(
              "id",
              "in",
              plan.links.map((link) => link.id),
            )
            .where("projectId", "!=", project.id)
            .executeTakeFirst()
        : undefined;
      if (collidingBlock || collidingLink) {
        throw new RepositorySyncApplyError("sync_state_changed");
      }

      const removedLinkIds = currentLinks
        .filter((link) => !linkIds.has(link.id))
        .map((link) => link.id);
      for (const removedIds of batches(removedLinkIds, 500)) {
        await trx
          .deleteFrom("links")
          .where("projectId", "=", project.id)
          .where("id", "in", removedIds)
          .execute();
      }

      const removedBlockIds = currentBlocks
        .filter((block) => !blockIds.has(block.id))
        .map((block) => block.id);

      const currentBlockIds = new Set(currentBlocks.map((block) => block.id));
      const currentLinkIds = new Set(currentLinks.map((link) => link.id));
      const syncCountsResult = {
        added:
          plan.blocks.filter((block) => !currentBlockIds.has(block.id)).length +
          plan.links.filter((link) => !currentLinkIds.has(link.id)).length,
        updated:
          plan.blocks.filter((block) => currentBlockIds.has(block.id)).length +
          plan.links.filter((link) => currentLinkIds.has(link.id)).length,
        deleted: removedLinkIds.length + removedBlockIds.length,
      };

      for (const removedIds of batches(removedBlockIds, 500)) {
        await trx
          .deleteFrom("blocks")
          .where("projectId", "=", project.id)
          .where("id", "in", removedIds)
          .execute();
      }

      const createdAtById = new Map(
        currentBlocks.map((block) => [block.id, toTimestamp(block.createdAt)]),
      );
      const blockValues: NewBlock[] = plan.blocks.map((block) => ({
        ...block,
        projectId: project.id,
        selected: 0,
        createdAt: createdAtById.get(block.id) ?? now,
        updatedAt: now,
      }));
      for (const blockBatch of batches(blockValues, 500)) {
        await trx
          .insertInto("blocks")
          .values(blockBatch)
          .onConflict((conflict) =>
            conflict.column("id").doUpdateSet((expressionBuilder) => ({
              blockType: expressionBuilder.ref("excluded.blockType"),
              metadata: expressionBuilder.ref("excluded.metadata"),
              parentBlockId: expressionBuilder.ref("excluded.parentBlockId"),
              positionX: expressionBuilder.ref("excluded.positionX"),
              positionY: expressionBuilder.ref("excluded.positionY"),
              width: expressionBuilder.ref("excluded.width"),
              height: expressionBuilder.ref("excluded.height"),
              ownerId: expressionBuilder.ref("excluded.ownerId"),
              content: expressionBuilder.ref("excluded.content"),
              data: expressionBuilder.ref("excluded.data"),
              selected: expressionBuilder.ref("excluded.selected"),
              updatedAt: expressionBuilder.ref("excluded.updatedAt"),
            })),
          )
          .execute();
      }

      const createdLinkAtById = new Map(
        currentLinks.map((link) => [link.id, toTimestamp(link.createdAt)]),
      );
      const linkValues: NewLink[] = plan.links.map((link) => ({
        ...link,
        projectId: project.id,
        createdAt: createdLinkAtById.get(link.id) ?? now,
        updatedAt: now,
      }));
      for (const linkBatch of batches(linkValues, 500)) {
        await trx
          .insertInto("links")
          .values(linkBatch)
          .onConflict((conflict) =>
            conflict.column("id").doUpdateSet((expressionBuilder) => ({
              source: expressionBuilder.ref("excluded.source"),
              target: expressionBuilder.ref("excluded.target"),
              sourceHandle: expressionBuilder.ref("excluded.sourceHandle"),
              targetHandle: expressionBuilder.ref("excluded.targetHandle"),
              type: expressionBuilder.ref("excluded.type"),
              animated: expressionBuilder.ref("excluded.animated"),
              sourceX: expressionBuilder.ref("excluded.sourceX"),
              sourceY: expressionBuilder.ref("excluded.sourceY"),
              targetX: expressionBuilder.ref("excluded.targetX"),
              targetY: expressionBuilder.ref("excluded.targetY"),
              sourceOrientation: expressionBuilder.ref(
                "excluded.sourceOrientation",
              ),
              targetOrientation: expressionBuilder.ref(
                "excluded.targetOrientation",
              ),
              data: expressionBuilder.ref("excluded.data"),
              label: expressionBuilder.ref("excluded.label"),
              updatedAt: expressionBuilder.ref("excluded.updatedAt"),
            })),
          )
          .execute();
      }

      await trx
        .updateTable("projects")
        .set({
          name: plan.project.name,
          description: plan.project.description,
          updatedAt: now,
        })
        .where("id", "=", project.id)
        .execute();

      await commitAssets(assetSwap);
      yjsUpdated = true;
      restoreCanvasStateSnapshots(projectYjsDoc.doc, plan.snapshots);
      await projectYjsDoc.persist();
      return syncCountsResult;
    });
    applied = true;

    await appendAuditEvent({
      projectId: project.id,
      userId: triggeredBy,
      action: "repository_sync.apply",
      entityType: "project",
      entityId: project.id,
      summary: `Repository sync applied: ${syncCounts.added} added, ${syncCounts.updated} updated, ${syncCounts.deleted} deleted`,
      metadata: {
        remoteProjectId: manifest.project.id,
        added: syncCounts.added,
        updated: syncCounts.updated,
        deleted: syncCounts.deleted,
      },
    });
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    if (yjsUpdated) {
      try {
        restoreCanvasStateSnapshots(projectYjsDoc.doc, previousSnapshots);
        await projectYjsDoc.persist();
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    try {
      await rollbackAssets(assetSwap);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        "Repository sync rollback failed",
        { cause: error },
      );
    }
    throw error;
  } finally {
    if (applied) await cleanupAssets(assetSwap);
    else
      await rm(assetSwap.stage, { recursive: true, force: true }).catch(
        () => {},
      );
    if (!projectYjsDoc.isLive) projectYjsDoc.doc.destroy();
  }
}
