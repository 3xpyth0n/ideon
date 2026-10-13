import { Node, Edge } from "@xyflow/react";
import { getDb, runTransaction } from "@lib/db";
import { projectAction } from "@lib/server-utils";
import {
  applyGraphMutation,
  prepareBlockForDb,
  prepareLinkForDb,
  GraphState,
  Mutation,
} from "@lib/graph";
import { uniqueById } from "@lib/utils";
import { validateFolderLinkRules } from "@lib/folder-link-rules";
import { appendAuditEvent } from "@lib/audit-trail";
import { logger } from "@lib/logger";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import {
  canvasStateSnapshotsSchema,
  restoreCanvasStateSnapshots,
} from "../../../../../lib/yjs-canvas-state";
import { docs } from "../../../../../lib/y-websocket/utils";

export const dynamic = "force-dynamic";

const mutationSchema = z.object({
  type: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

function parseTemporalDiff(diff: string): Mutation[] {
  const parsed = JSON.parse(diff);
  const result = z.array(mutationSchema).safeParse(parsed);
  if (!result.success) {
    throw { status: 500, message: "Invalid temporal state payload" };
  }

  return result.data as Mutation[];
}

async function auditTemporalRejection(
  projectId: string,
  userId: string,
  action: string,
  error: string,
) {
  await appendAuditEvent({
    projectId,
    userId,
    action: `temporal.${action}`,
    summary: `Temporal ${action} rejected: ${error}`,
    metadata: { error, status: "failure" },
  });
}

export const GET = projectAction(async (req, { project }) => {
  const db = getDb();
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action") || "history";

  if (action === "history") {
    const rawLimit = Number.parseInt(searchParams.get("limit") || "", 10);
    const limit = Math.min(
      Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50,
      200,
    );
    const beforeTimestamp = searchParams.get("before");
    const beforeId = searchParams.get("beforeId");

    let statesQuery = db
      .selectFrom("temporalStates")
      .innerJoin("users", "users.id", "temporalStates.authorId")
      .select([
        "temporalStates.id",
        "temporalStates.intent",
        "temporalStates.isSnapshot",
        "temporalStates.isAuto",
        "temporalStates.timestamp",
        "users.username as authorName",
        "users.color as authorColor",
      ])
      .where("projectId", "=", project.id);

    if (beforeTimestamp && beforeId) {
      // Timestamps are stored as ISO strings (see the create action), so the
      // cursor stays a raw string even though the column is typed as Date.
      const beforeCursorTs = beforeTimestamp as unknown as Date;
      statesQuery = statesQuery.where((eb) =>
        eb.or([
          eb("temporalStates.timestamp", "<", beforeCursorTs),
          eb.and([
            eb("temporalStates.timestamp", "=", beforeCursorTs),
            eb("temporalStates.id", "<", beforeId),
          ]),
        ]),
      );
    }

    const states = await statesQuery
      .orderBy("timestamp", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1)
      .execute();

    const hasMore = states.length > limit;
    const history = hasMore ? states.slice(0, limit) : states;

    return { history, hasMore };
  }

  if (action === "reconstruct") {
    const stateId = searchParams.get("stateId");
    if (!stateId) throw { status: 400, message: "stateId required" };

    const state = await db
      .selectFrom("temporalStates")
      .select(["id", "diff", "timestamp"])
      .where("id", "=", stateId)
      .where("projectId", "=", project.id)
      .executeTakeFirst();

    let graph: GraphState = { blocks: [], links: [] };
    if (state) {
      const mutations = parseTemporalDiff(state.diff);
      for (const mutation of mutations) {
        graph = applyGraphMutation(graph, mutation);
      }
    }

    return graph;
  }

  throw { status: 400, message: "Invalid action" };
});

const postSchema = z.object({
  stateId: z.string().optional(),
  action: z.string(),
  canvasId: z.string().optional(),
  blocks: z.array(z.any()).optional(),
  links: z.array(z.any()).optional(),
  canvasStates: canvasStateSnapshotsSchema.optional(),
  intent: z.string().optional(),
  isAuto: z.boolean().optional(),
});

export const POST = projectAction(
  async (_req, { user: auth, project, role, body }) => {
    const projectId = project.id;
    const db = getDb();
    const {
      action,
      canvasId: requestedCanvasId,
      blocks: inputBlocks,
      links: inputLinks,
      canvasStates: inputCanvasStates,
      intent,
      isAuto,
    } = body;

    // Dev-only logging to help reproduce Save requests and payloads
    if (process.env.NODE_ENV !== "production") {
      try {
        console.info(
          `[temporal] POST received - project=${projectId} user=${auth.id} action=${action}`,
        );
        console.info(
          `[temporal] payload sizes: blocks=${
            (inputBlocks || []).length
          } links=${
            (inputLinks || []).length
          } intent=${intent} isAuto=${isAuto}`,
        );
      } catch (err) {
        console.info("[temporal] debug log error", err);
      }
    }

    if (action === "create") {
      const snapshotId = uuidv4();
      const uniqueBlocks = uniqueById(inputBlocks || []);
      const uniqueLinks = uniqueById(inputLinks || []);
      const canvasStates = inputCanvasStates;

      const violatedRule = validateFolderLinkRules(
        uniqueBlocks.map((block: Node) => ({
          id: block.id,
          type: block.type,
          data: {
            blockType: (block.data as { blockType?: string } | undefined)
              ?.blockType,
          },
        })),
        uniqueLinks.map((link: Edge) => ({
          source: link.source,
          target: link.target,
        })),
      );

      if (violatedRule) {
        if (violatedRule.code === "folder_to_core") {
          throw {
            status: 400,
            message: "Folder blocks cannot target core blocks.",
          };
        }

        if (violatedRule.code === "folder_reverse_link") {
          throw {
            status: 400,
            message: "Reverse links between two folder blocks are not allowed.",
          };
        }

        throw {
          status: 400,
          message: "A block cannot depend on multiple folders.",
        };
      }

      // Security check: deletions and ownership transfers
      const existingBlocks = await db
        .selectFrom("blocks")
        .select(["id", "ownerId"])
        .where("projectId", "=", projectId)
        .execute();

      const isProjectOwner = project.ownerId === auth.id;

      if (!isProjectOwner) {
        const existingBlocksMap = new Map(existingBlocks.map((b) => [b.id, b]));
        const inputBlocksMap = new Map(
          uniqueBlocks.map((n: Node) => [n.id, n]),
        );

        // Check for deletions
        for (const existing of existingBlocks) {
          if (!inputBlocksMap.has(existing.id)) {
            if (existing.ownerId !== auth.id) {
              await auditTemporalRejection(
                projectId,
                auth.id,
                "create",
                "cannot delete blocks you don't own",
              );
              throw {
                status: 403,
                message: "Forbidden: Cannot delete blocks you don't own",
              };
            }
          }
        }

        // Check for ownership transfers
        for (const inputBlock of uniqueBlocks) {
          const existing = existingBlocksMap.get(inputBlock.id);
          if (existing) {
            const newOwnerId = inputBlock.data?.ownerId || existing.ownerId;
            if (newOwnerId !== existing.ownerId) {
              if (existing.ownerId !== auth.id) {
                await auditTemporalRejection(
                  projectId,
                  auth.id,
                  "create",
                  "cannot transfer ownership of blocks you don't own",
                );
                throw {
                  status: 403,
                  message:
                    "Forbidden: Cannot transfer ownership of blocks you don't own",
                };
              }
            }
          }
        }
      }

      const diff = JSON.stringify([
        {
          type: "graphSnapshot",
          payload: {
            blocks: uniqueBlocks,
            links: uniqueLinks,
            ...(canvasStates && { canvasStates }),
          },
        },
      ]);

      if (process.env.NODE_ENV !== "production") {
        try {
          console.info(
            `[temporal] prepared snapshotId=${snapshotId} diffBytes=${diff.length} blocks=${uniqueBlocks.length} links=${uniqueLinks.length}`,
          );
        } catch (err) {
          console.info("[temporal] debug log error", err);
        }
      }

      // Check for duplicate snapshot (same diff as the current state)
      const lastState = await db
        .selectFrom("temporalStates")
        .select("diff")
        .where("id", "=", project.currentStateId)
        .executeTakeFirst();

      if (lastState && lastState.diff === diff) {
        if (process.env.NODE_ENV !== "production")
          console.info(
            "[temporal] duplicate snapshot detected, skipping insert",
          );

        return {
          success: true,
          stateId: project.currentStateId,
          unchanged: true,
        };
      }

      if (process.env.NODE_ENV !== "production") {
        console.info(`[temporal] about to write snapshot ${snapshotId}`);
      }

      await runTransaction(db, async (trx) => {
        await trx
          .insertInto("temporalStates")
          .values({
            id: snapshotId,
            projectId: projectId,
            authorId: auth.id,
            intent: intent || "manualSnapshot",
            diff: diff,
            isSnapshot: 1,
            isAuto: isAuto ? 1 : 0,
            timestamp: new Date().toISOString(),
          })
          .execute();

        await trx
          .updateTable("projects")
          .set({
            currentStateId: snapshotId,
            updatedAt: new Date().toISOString(),
          })
          .where("id", "=", projectId)
          .execute();

        await trx
          .deleteFrom("blocks")
          .where("projectId", "=", projectId)
          .execute();

        if (uniqueBlocks.length > 0) {
          const blocksToInsert = uniqueBlocks.map((block: Node) =>
            prepareBlockForDb(block, projectId, auth.id),
          );
          for (let i = 0; i < blocksToInsert.length; i += 1000) {
            await trx
              .insertInto("blocks")
              .values(blocksToInsert.slice(i, i + 1000))
              .execute();
          }
        }

        await trx
          .deleteFrom("links")
          .where("projectId", "=", projectId)
          .execute();
        if (uniqueLinks.length > 0) {
          const linksToInsert = uniqueLinks.map((link: Edge) =>
            prepareLinkForDb(link, projectId),
          );
          for (let i = 0; i < linksToInsert.length; i += 1000) {
            await trx
              .insertInto("links")
              .values(linksToInsert.slice(i, i + 1000))
              .execute();
          }
        }
      });

      if (process.env.NODE_ENV !== "production") {
        console.info(`[temporal] snapshot ${snapshotId} written successfully`);
      }

      await appendAuditEvent({
        projectId,
        userId: auth.id,
        action: "temporal.create",
        entityType: "temporalState",
        entityId: snapshotId,
        summary: intent || "Snapshot created",
        metadata: {
          isAuto: Boolean(isAuto),
          blocks: uniqueBlocks.length,
          links: uniqueLinks.length,
        },
      });

      return { success: true, stateId: snapshotId };
    }

    if (action === "apply") {
      if (role !== "owner" && role !== "creator") {
        await auditTemporalRejection(
          projectId,
          auth.id,
          "apply",
          "insufficient role",
        );
        throw {
          status: 403,
          message: "Forbidden: Only project owner can apply past states",
        };
      }

      if (project.ownerId !== auth.id) {
        await auditTemporalRejection(
          projectId,
          auth.id,
          "apply",
          "not project owner",
        );
        throw {
          status: 403,
          message: "Forbidden: Only project owner can apply past states",
        };
      }

      const { stateId } = body;
      if (!stateId) throw { status: 400, message: "stateId required" };

      const state = await db
        .selectFrom("temporalStates")
        .selectAll()
        .where("id", "=", stateId)
        .where("projectId", "=", projectId)
        .executeTakeFirst();

      if (!state) throw { status: 404, message: "State not found" };

      const targetTimestamp = state.timestamp;

      let graph: GraphState = { blocks: [], links: [] };
      const mutations = parseTemporalDiff(state.diff);
      for (const mutation of mutations) {
        graph = applyGraphMutation(graph, mutation);
      }

      let formattedIntent = `Restored state from ${stateId}`;
      if (targetTimestamp) {
        const date = new Date(targetTimestamp);
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        formattedIntent = `Restored state from ${day}/${month}/${year} ${hours}:${minutes}`;
      }

      const snapshotId = uuidv4();
      const uniqueBlocks = uniqueById(graph.blocks);
      const uniqueLinks = uniqueById(graph.links);
      if (
        requestedCanvasId &&
        requestedCanvasId !== "root" &&
        !graph.canvasStates?.some(
          (canvas) => canvas.canvasId === requestedCanvasId,
        )
      ) {
        throw {
          status: 400,
          message: "This historical state does not contain the active canvas",
        };
      }

      await runTransaction(db, async (trx) => {
        await trx
          .insertInto("temporalStates")
          .values({
            id: snapshotId,
            projectId: projectId,
            authorId: auth.id,
            intent: formattedIntent,
            diff: JSON.stringify([
              {
                type: "graphSnapshot",
                payload: {
                  blocks: uniqueBlocks,
                  links: uniqueLinks,
                  ...(graph.canvasStates && {
                    canvasStates: graph.canvasStates,
                  }),
                },
              },
            ]),
            isSnapshot: 1,
            isAuto: 0,
            timestamp: new Date().toISOString(),
          })
          .execute();

        await trx
          .updateTable("projects")
          .set({
            currentStateId: snapshotId,
            updatedAt: new Date().toISOString(),
          })
          .where("id", "=", projectId)
          .execute();

        await trx
          .deleteFrom("blocks")
          .where("projectId", "=", projectId)
          .execute();

        if (uniqueBlocks.length > 0) {
          const blocksToInsert = uniqueBlocks.map((block: Node) =>
            prepareBlockForDb(block, projectId, auth.id),
          );
          for (let i = 0; i < blocksToInsert.length; i += 1000) {
            await trx
              .insertInto("blocks")
              .values(blocksToInsert.slice(i, i + 1000))
              .execute();
          }
        }

        await trx
          .deleteFrom("links")
          .where("projectId", "=", projectId)
          .execute();
        if (uniqueLinks.length > 0) {
          const linksToInsert = uniqueLinks.map((link: Edge) =>
            prepareLinkForDb(link, projectId),
          );
          for (let i = 0; i < linksToInsert.length; i += 1000) {
            await trx
              .insertInto("links")
              .values(linksToInsert.slice(i, i + 1000))
              .execute();
          }
        }
      });

      let legacyRestore = false;
      if (graph.canvasStates) {
        try {
          const liveDoc = docs.get(`project-${projectId}`);
          if (liveDoc) {
            restoreCanvasStateSnapshots(liveDoc, graph.canvasStates);
          }
        } catch (error) {
          legacyRestore = true;
          logger.warn(
            { err: error, projectId },
            "[temporal] Server-side restore failed, relying on client propagation",
          );
        }
      }

      await appendAuditEvent({
        projectId,
        userId: auth.id,
        action: "temporal.apply",
        entityType: "temporalState",
        entityId: snapshotId,
        summary: formattedIntent,
        metadata: {
          restoredFrom: stateId,
          blocks: uniqueBlocks.length,
          links: uniqueLinks.length,
          legacyRestore,
        },
      });

      return {
        success: true,
        stateId: snapshotId,
        canvasStates: graph.canvasStates,
      };
    }

    if (action === "update") {
      if (role !== "owner" && role !== "creator") {
        await auditTemporalRejection(
          projectId,
          auth.id,
          "update",
          "insufficient role",
        );
        throw {
          status: 403,
          message: "Forbidden: Only project owner can rename states",
        };
      }

      if (project.ownerId !== auth.id) {
        await auditTemporalRejection(
          projectId,
          auth.id,
          "update",
          "not project owner",
        );
        throw {
          status: 403,
          message: "Forbidden: Only project owner can rename states",
        };
      }

      const { stateId, intent } = body;
      if (!stateId) throw { status: 400, message: "stateId required" };
      if (typeof intent !== "string")
        throw { status: 400, message: "intent required" };

      const existingState = await db
        .selectFrom("temporalStates")
        .select("intent")
        .where("id", "=", stateId)
        .where("projectId", "=", projectId)
        .executeTakeFirst();

      await db
        .updateTable("temporalStates")
        .set({ intent })
        .where("id", "=", stateId)
        .where("projectId", "=", projectId)
        .execute();

      await appendAuditEvent({
        projectId,
        userId: auth.id,
        action: "temporal.rename",
        entityType: "temporalState",
        entityId: stateId,
        summary: `Snapshot renamed to "${intent}"`,
        metadata: {
          stateId,
          from: existingState?.intent ?? null,
          to: intent,
        },
      });

      return { success: true };
    }

    if (action === "delete") {
      if (role !== "owner" && role !== "creator") {
        await auditTemporalRejection(
          projectId,
          auth.id,
          "delete",
          "insufficient role",
        );
        throw {
          status: 403,
          message: "Forbidden: Only project owner can delete states",
        };
      }

      if (project.ownerId !== auth.id) {
        await auditTemporalRejection(
          projectId,
          auth.id,
          "delete",
          "not project owner",
        );
        throw {
          status: 403,
          message: "Forbidden: Only project owner can delete states",
        };
      }

      const { stateId } = body;
      if (!stateId) throw { status: 400, message: "stateId required" };

      if (project.currentStateId === stateId) {
        throw {
          status: 400,
          message: "Cannot delete the current state of the project",
        };
      }

      const existingState = await db
        .selectFrom("temporalStates")
        .select("intent")
        .where("id", "=", stateId)
        .where("projectId", "=", projectId)
        .executeTakeFirst();

      await db
        .deleteFrom("temporalStates")
        .where("id", "=", stateId)
        .where("projectId", "=", projectId)
        .execute();

      await appendAuditEvent({
        projectId,
        userId: auth.id,
        action: "temporal.delete",
        entityType: "temporalState",
        entityId: stateId,
        summary: `Snapshot deleted: ${existingState?.intent ?? "unknown"}`,
        metadata: { stateId, intent: existingState?.intent ?? null },
      });

      return { success: true };
    }

    throw { status: 400, message: "Invalid action" };
  },
  { schema: postSchema, minRole: "editor" },
);
