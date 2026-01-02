import { Node, Edge } from "@xyflow/react";
import { getDb, TemporalState, runTransaction } from "@lib/db";
import { projectAction } from "@lib/server-utils";
import {
  applyGraphMutation,
  prepareBlockForDb,
  prepareLinkForDb,
  GraphState,
} from "@lib/graph";
import { uniqueById } from "@lib/utils";
import { getGithubStats } from "@lib/github";
import { z } from "zod";
import * as crypto from "crypto";

export const dynamic = "force-dynamic";

export const GET = projectAction(async (req, { project }) => {
  const db = getDb();
  const searchParams = req.nextUrl.searchParams;
  const action = searchParams.get("action") || "history";

  if (action === "history") {
    const states = await db
      .selectFrom("temporalStates")
      .innerJoin("users", "users.id", "temporalStates.authorId")
      .select([
        "temporalStates.id",
        "temporalStates.parentId",
        "temporalStates.intent",
        "temporalStates.timestamp",
        "users.username as authorName",
        "users.color as authorColor",
      ])
      .where("projectId", "=", project.id)
      .orderBy("timestamp", "desc")
      .execute();

    return { history: states };
  }

  if (action === "reconstruct") {
    const stateId = searchParams.get("stateId");
    if (!stateId) throw { status: 400, message: "stateId required" };

    // Fetch all states for this project in one query (N+1 fix)
    const allStates = await db
      .selectFrom("temporalStates")
      .select(["id", "parentId", "diff", "timestamp"])
      .where("projectId", "=", project.id)
      .execute();

    const stateMap = new Map(allStates.map((s) => [s.id, s]));
    const history: TemporalState[] = [];
    let currentId: string | null = stateId;

    // Max depth to prevent infinite loops in case of circular references (though unlikely)
    let depth = 0;
    const MAX_DEPTH = 1000;

    while (currentId && depth < MAX_DEPTH) {
      const state = stateMap.get(currentId);
      if (!state) break;

      history.unshift(state as TemporalState);
      currentId = state.parentId;
      depth++;
    }

    let graph: GraphState = { blocks: [], links: [] };
    for (const step of history) {
      const mutations = JSON.parse(step.diff);
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
  blocks: z.array(z.any()).optional(),
  links: z.array(z.any()).optional(),
  intent: z.string().optional(),
});

export const POST = projectAction(
  async (_req, { user: auth, project, body }) => {
    const projectId = project.id;
    const db = getDb();
    const { action, blocks: inputBlocks, links: inputLinks, intent } = body;

    if (action === "create") {
      const snapshotId = crypto.randomUUID();
      const uniqueBlocks = uniqueById(inputBlocks || []);
      const uniqueLinks = uniqueById(inputLinks || []);

      // Update GitHub stats for all github blocks to ensure history is accurate
      await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        uniqueBlocks.map(async (block: any) => {
          const blockType = block.data?.blockType || block.type;
          if (blockType === "github") {
            const url = block.data?.content;
            if (url) {
              const { stats } = await getGithubStats(url);
              if (stats) {
                // Metadata might be a JSON string or an object depending on where it comes from
                let metadata = block.data.metadata;
                if (typeof metadata === "string") {
                  try {
                    metadata = JSON.parse(metadata);
                  } catch (_e) {
                    metadata = {};
                  }
                }
                if (!metadata || typeof metadata !== "object") metadata = {};

                // Initialize github property if missing
                if (!metadata.github) metadata.github = {};

                // Update stats
                metadata.github.lastStats = stats;
                metadata.github.lastFetched = new Date().toISOString();
                metadata.github.url = url;

                // Re-assign to block.data
                block.data.metadata = metadata;
              }
            }
          }
        }),
      );

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
          payload: { blocks: uniqueBlocks, links: uniqueLinks },
        },
      ]);

      // Check for duplicate snapshot (same diff as the current state)
      const lastState = await db
        .selectFrom("temporalStates")
        .select("diff")
        .where("id", "=", project.currentStateId)
        .executeTakeFirst();

      if (lastState && lastState.diff === diff) {
        return {
          success: true,
          stateId: project.currentStateId,
          unchanged: true,
        };
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

      return { success: true, stateId: snapshotId };
    }

    if (action === "apply") {
      if (project.ownerId !== auth.id) {
        throw {
          status: 403,
          message: "Forbidden: Only project owner can apply past states",
        };
      }

      const { stateId } = body;
      if (!stateId) throw { status: 400, message: "stateId required" };

      const history: TemporalState[] = [];
      let currentId: string | null = stateId;
      let targetTimestamp: string | Date | null = null;

      while (currentId) {
        const state = await db
          .selectFrom("temporalStates")
          .selectAll()
          .where("id", "=", currentId)
          .executeTakeFirst();

        if (!state) break;

        if (state.id === stateId) {
          targetTimestamp = state.timestamp;
        }

        history.unshift(state);
        currentId = state.parentId;
      }

      let graph: GraphState = { blocks: [], links: [] };
      for (const step of history) {
        const mutations = JSON.parse(step.diff);
        for (const mutation of mutations) {
          graph = applyGraphMutation(graph, mutation);
        }
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

      const snapshotId = crypto.randomUUID();
      const uniqueBlocks = uniqueById(graph.blocks);
      const uniqueLinks = uniqueById(graph.links);

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
                payload: { blocks: uniqueBlocks, links: uniqueLinks },
              },
            ]),
            isSnapshot: 1,
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

      return { success: true, stateId: snapshotId };
    }

    if (action === "update") {
      if (project.ownerId !== auth.id) {
        throw {
          status: 403,
          message: "Forbidden: Only project owner can rename states",
        };
      }

      const { stateId, intent } = body;
      if (!stateId) throw { status: 400, message: "stateId required" };
      if (typeof intent !== "string")
        throw { status: 400, message: "intent required" };

      await db
        .updateTable("temporalStates")
        .set({ intent })
        .where("id", "=", stateId)
        .where("projectId", "=", projectId)
        .execute();

      return { success: true };
    }

    if (action === "delete") {
      if (project.ownerId !== auth.id) {
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

      await db
        .deleteFrom("temporalStates")
        .where("id", "=", stateId)
        .where("projectId", "=", projectId)
        .execute();

      return { success: true };
    }

    throw { status: 400, message: "Invalid action" };
  },
  { schema: postSchema },
);
