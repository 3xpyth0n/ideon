/**
 * Block tools for MCP — read and write operations on canvas blocks.
 *
 * Read tools: list_blocks, get_block
 * Write tools: create_block, update_block, delete_block, create_blocks_batch
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import * as Y from "yjs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LeveldbPersistence } from "y-leveldb";
import { getMcpContext } from "../context";
import { checkProjectAccess } from "./projects";
import {
  getProjectDoc,
  readBlocks,
  readLinks,
  persistIfNeeded,
} from "../yjs-bridge";
import {
  computePosition,
  computeBatchPositions,
  getDefaultWidth,
  getDefaultHeight,
  type ExistingBlock,
  type PlacementInput,
} from "../placement-engine";
import {
  NotFoundError,
  ValidationError,
  validateContentSize,
  mapError,
} from "../errors";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_LIST_BLOCKS = 200;
const CONTENT_PREVIEW_LENGTH = 200;
const MAX_BATCH_SIZE = 50;

const VALID_BLOCK_TYPES = [
  "text",
  "link",
  "file",
  "core",
  "github",
  "palette",
  "contact",
  "video",
  "snippet",
  "checklist",
  "kanban",
  "sketch",
  "shell",
  "folder",
  "vercel",
  "frame",
  "webhook",
  "cron",
  "latex",
  "calendar",
] as const;

const VALID_DIRECTIONS = ["up", "down", "left", "right"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getContentPreview(content: string | undefined): string {
  if (!content) return "";
  if (content.length <= CONTENT_PREVIEW_LENGTH) return content;
  return content.slice(0, CONTENT_PREVIEW_LENGTH) + "…";
}

function blocksToExisting(
  blocks: ReturnType<typeof readBlocks>,
): ExistingBlock[] {
  return blocks.map((b) => ({
    x: b.position.x,
    y: b.position.y,
    width: b.width ?? getDefaultWidth(b.type),
    height: b.height ?? getDefaultHeight(b.type),
  }));
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerBlockTools(
  server: McpServer,
  ldb: LeveldbPersistence,
): void {
  // ─── list_blocks (Task 8.1) ──────────────────────────────────────────────

  server.tool(
    "list_blocks",
    "List all blocks in a project (max 200). Returns id, type, position, dimensions, and a content preview (200 chars).",
    {
      projectId: z.string().describe("The project ID to list blocks from"),
    },
    async ({ projectId }) => {
      try {
        const { userId } = getMcpContext();
        await checkProjectAccess(userId, projectId);

        const { ydoc } = await getProjectDoc(projectId, ldb);
        const blocks = readBlocks(ydoc);

        const yContents = ydoc.getMap<Y.Text>("contents");
        const result = blocks.slice(0, MAX_LIST_BLOCKS).map((block) => {
          const yText = yContents.get(block.id);
          const content = yText ? yText.toString() : block.data?.content ?? "";
          return {
            id: block.id,
            type: block.type,
            x: block.position.x,
            y: block.position.y,
            width: block.width ?? getDefaultWidth(block.type),
            height: block.height ?? getDefaultHeight(block.type),
            contentPreview: getContentPreview(content),
          };
        });

        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ blocks: result }) },
          ],
        };
      } catch (err) {
        const mapped = mapError(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(mapped) }],
          isError: true,
        };
      }
    },
  );

  // ─── get_block (Task 8.2, 8.3) ────────────────────────────────────────────

  server.tool(
    "get_block",
    "Get full details of a specific block including content, data, and metadata.",
    {
      projectId: z.string().describe("The project ID containing the block"),
      blockId: z.string().describe("The block ID to retrieve"),
    },
    async ({ projectId, blockId }) => {
      try {
        const { userId } = getMcpContext();
        await checkProjectAccess(userId, projectId);

        const { ydoc } = await getProjectDoc(projectId, ldb);
        const blocks = readBlocks(ydoc);
        const block = blocks.find((b) => b.id === blockId);

        if (!block) {
          throw new NotFoundError(`Block not found: ${blockId}`);
        }

        const yContents = ydoc.getMap<Y.Text>("contents");
        const yText = yContents.get(blockId);
        const content = yText ? yText.toString() : block.data?.content ?? "";

        const result = {
          id: block.id,
          type: block.type,
          x: block.position.x,
          y: block.position.y,
          width: block.width ?? getDefaultWidth(block.type),
          height: block.height ?? getDefaultHeight(block.type),
          content,
          data: block.data ?? {},
          metadata: block.data?.metadata ?? null,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        const mapped = mapError(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(mapped) }],
          isError: true,
        };
      }
    },
  );

  // ─── create_block (Task 9.1, 9.2) ─────────────────────────────────────────

  server.tool(
    "create_block",
    "Create a new block on the canvas. Use anchorBlockId + direction for relative placement, or provide explicit position. Content max 100k chars.",
    {
      projectId: z.string().describe("The project ID to create the block in"),
      blockType: z
        .enum(VALID_BLOCK_TYPES)
        .describe("The type of block to create"),
      content: z
        .string()
        .max(100_000)
        .optional()
        .describe("Text content for the block (max 100k characters)"),
      data: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Additional data object for the block"),
      position: z
        .object({ x: z.number(), y: z.number() })
        .optional()
        .describe("Explicit position override (bypasses placement engine)"),
      anchorBlockId: z
        .string()
        .optional()
        .describe("ID of an existing block to place near"),
      direction: z
        .enum(VALID_DIRECTIONS)
        .optional()
        .describe("Direction relative to anchor block (default: right)"),
      width: z
        .number()
        .min(100)
        .max(2000)
        .optional()
        .describe("Block width in pixels (100–2000)"),
      height: z
        .number()
        .min(50)
        .max(2000)
        .optional()
        .describe("Block height in pixels (50–2000)"),
    },
    async ({
      projectId,
      blockType,
      content,
      data,
      position,
      anchorBlockId,
      direction,
      width,
      height,
    }) => {
      try {
        const { userId } = getMcpContext();
        await checkProjectAccess(userId, projectId, "editor");

        validateContentSize(content);

        const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
        const blocks = readBlocks(ydoc);
        const existingBlocks = blocksToExisting(blocks);

        // Resolve anchor block if provided
        let anchorBlock: ExistingBlock | undefined;
        if (anchorBlockId) {
          const anchor = blocks.find((b) => b.id === anchorBlockId);
          if (!anchor) {
            throw new NotFoundError(`Anchor block not found: ${anchorBlockId}`);
          }
          anchorBlock = {
            x: anchor.position.x,
            y: anchor.position.y,
            width: anchor.width ?? getDefaultWidth(anchor.type),
            height: anchor.height ?? getDefaultHeight(anchor.type),
          };
        }

        const placementInput: PlacementInput = {
          blockType,
          width,
          height,
          position,
          anchorBlockId,
          direction,
        };

        const pos = computePosition(
          placementInput,
          existingBlocks,
          anchorBlock,
        );
        const blockId = randomUUID();

        const yBlocks = ydoc.getMap("blocks");
        const yContents = ydoc.getMap<Y.Text>("contents");

        ydoc.transact(() => {
          yBlocks.set(blockId, {
            id: blockId,
            type: blockType,
            position: { x: pos.x, y: pos.y },
            width: width ?? undefined,
            height: height ?? undefined,
            selected: false,
            draggable: blockType !== "core",
            deletable: blockType !== "core",
            zIndex: blockType === "frame" ? 0 : 1,
            data: {
              ...(data ?? {}),
              blockType,
              content: content ?? "",
              ownerId: userId,
              metadata: undefined,
            },
          });

          const yText = new Y.Text();
          if (content) {
            yText.insert(0, content);
          }
          yContents.set(blockId, yText);
        });

        await persistIfNeeded(projectId, ydoc, isLive, ldb);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                id: blockId,
                position: { x: pos.x, y: pos.y },
              }),
            },
          ],
        };
      } catch (err) {
        const mapped = mapError(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(mapped) }],
          isError: true,
        };
      }
    },
  );

  // ─── update_block (Task 9.3) ───────────────────────────────────────────────

  server.tool(
    "update_block",
    "Update an existing block's content, data, metadata, position, or dimensions. Position/width/height changes are rejected for core blocks.",
    {
      projectId: z.string().describe("The project ID containing the block"),
      blockId: z.string().describe("The block ID to update"),
      content: z
        .string()
        .max(100_000)
        .optional()
        .describe("New text content (max 100k characters)"),
      data: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Additional data to merge into block data"),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Metadata object to set on the block"),
      position: z
        .object({ x: z.number(), y: z.number() })
        .optional()
        .describe("New position (rejected for core blocks)"),
      width: z
        .number()
        .min(100)
        .max(2000)
        .optional()
        .describe("New width (rejected for core blocks)"),
      height: z
        .number()
        .min(50)
        .max(2000)
        .optional()
        .describe("New height (rejected for core blocks)"),
    },
    async ({
      projectId,
      blockId,
      content,
      data,
      metadata,
      position,
      width,
      height,
    }) => {
      try {
        const { userId } = getMcpContext();
        await checkProjectAccess(userId, projectId, "editor");

        validateContentSize(content);

        const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
        const blocks = readBlocks(ydoc);
        const block = blocks.find((b) => b.id === blockId);

        if (!block) {
          throw new NotFoundError(`Block not found: ${blockId}`);
        }

        // Reject position/dimension changes on core blocks
        if (block.type === "core") {
          if (position || width !== undefined || height !== undefined) {
            throw new ValidationError(
              "Cannot modify position or dimensions of core blocks",
            );
          }
        }

        const yBlocks = ydoc.getMap("blocks");
        const yContents = ydoc.getMap<Y.Text>("contents");

        ydoc.transact(() => {
          // Build updated block entry
          const existing = yBlocks.get(blockId) as
            | Record<string, unknown>
            | undefined;
          if (!existing) return;

          const updatedData = {
            ...((existing.data as Record<string, unknown>) ?? {}),
            ...(data ?? {}),
          };

          if (content !== undefined) {
            updatedData.content = content;
          }
          if (metadata !== undefined) {
            updatedData.metadata = metadata;
          }

          const updated: Record<string, unknown> = {
            ...existing,
            data: updatedData,
          };

          if (position) {
            updated.position = position;
          }
          if (width !== undefined) {
            updated.width = width;
          }
          if (height !== undefined) {
            updated.height = height;
          }

          yBlocks.set(blockId, updated);

          // Update Y.Text content if provided
          if (content !== undefined) {
            let yText = yContents.get(blockId);
            if (!yText) {
              yText = new Y.Text();
              yContents.set(blockId, yText);
            } else {
              yText.delete(0, yText.length);
            }
            if (content) {
              yText.insert(0, content);
            }
          }
        });

        await persistIfNeeded(projectId, ydoc, isLive, ldb);

        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ success: true }) },
          ],
        };
      } catch (err) {
        const mapped = mapError(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(mapped) }],
          isError: true,
        };
      }
    },
  );

  // ─── delete_block (Task 9.4) ───────────────────────────────────────────────

  server.tool(
    "delete_block",
    "Delete a block and cascade-delete all links connected to it. Cannot delete core blocks.",
    {
      projectId: z.string().describe("The project ID containing the block"),
      blockId: z.string().describe("The block ID to delete"),
    },
    async ({ projectId, blockId }) => {
      try {
        const { userId } = getMcpContext();
        await checkProjectAccess(userId, projectId, "editor");

        const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
        const blocks = readBlocks(ydoc);
        const block = blocks.find((b) => b.id === blockId);

        if (!block) {
          throw new NotFoundError(`Block not found: ${blockId}`);
        }

        if (block.type === "core") {
          throw new ValidationError("Cannot delete core blocks");
        }

        // Find links to cascade delete
        const links = readLinks(ydoc);
        const linkedIds = links
          .filter((l) => l.source === blockId || l.target === blockId)
          .map((l) => l.id);

        const yBlocks = ydoc.getMap("blocks");
        const yLinks = ydoc.getMap("links");
        const yContents = ydoc.getMap<Y.Text>("contents");

        ydoc.transact(() => {
          yBlocks.delete(blockId);
          yContents.delete(blockId);
          for (const linkId of linkedIds) {
            yLinks.delete(linkId);
          }
        });

        await persistIfNeeded(projectId, ydoc, isLive, ldb);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                deletedLinks: linkedIds.length,
              }),
            },
          ],
        };
      } catch (err) {
        const mapped = mapError(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(mapped) }],
          isError: true,
        };
      }
    },
  );

  // ─── create_blocks_batch (Task 9.5, 9.6) ──────────────────────────────────

  server.tool(
    "create_blocks_batch",
    "Create multiple blocks at once (1–50). Blocks are placed in an auto grid layout. All blocks are created atomically in a single transaction.",
    {
      projectId: z.string().describe("The project ID to create blocks in"),
      blocks: z
        .array(
          z.object({
            blockType: z.enum(VALID_BLOCK_TYPES),
            content: z.string().max(100_000).optional(),
            data: z.record(z.string(), z.unknown()).optional(),
            position: z.object({ x: z.number(), y: z.number() }).optional(),
            anchorBlockId: z.string().optional(),
            direction: z.enum(VALID_DIRECTIONS).optional(),
            width: z.number().min(100).max(2000).optional(),
            height: z.number().min(50).max(2000).optional(),
          }),
        )
        .min(1)
        .max(MAX_BATCH_SIZE)
        .describe("Array of blocks to create (1–50)"),
    },
    async ({ projectId, blocks: blockInputs }) => {
      try {
        const { userId } = getMcpContext();
        await checkProjectAccess(userId, projectId, "editor");

        // Validate all content sizes
        for (const input of blockInputs) {
          validateContentSize(input.content);
        }

        const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
        const existingBlockEntries = readBlocks(ydoc);
        const existingBlocks = blocksToExisting(existingBlockEntries);

        // Resolve anchor for batch (use first block's anchorBlockId if provided)
        let anchorBlock: ExistingBlock | undefined;
        const firstAnchorId = blockInputs[0]?.anchorBlockId;
        if (firstAnchorId) {
          const anchor = existingBlockEntries.find(
            (b) => b.id === firstAnchorId,
          );
          if (anchor) {
            anchorBlock = {
              x: anchor.position.x,
              y: anchor.position.y,
              width: anchor.width ?? getDefaultWidth(anchor.type),
              height: anchor.height ?? getDefaultHeight(anchor.type),
            };
          }
        }

        const placementInputs: PlacementInput[] = blockInputs.map((input) => ({
          blockType: input.blockType,
          width: input.width,
          height: input.height,
          position: input.position,
          anchorBlockId: input.anchorBlockId,
          direction: input.direction,
        }));

        const positions = computeBatchPositions(
          placementInputs,
          existingBlocks,
          anchorBlock,
        );

        const yBlocks = ydoc.getMap("blocks");
        const yContents = ydoc.getMap<Y.Text>("contents");

        const results: { id: string; position: { x: number; y: number } }[] =
          [];

        ydoc.transact(() => {
          for (let i = 0; i < blockInputs.length; i++) {
            const input = blockInputs[i];
            const pos = positions[i];
            const blockId = randomUUID();

            yBlocks.set(blockId, {
              id: blockId,
              type: input.blockType,
              position: { x: pos.x, y: pos.y },
              width: input.width ?? undefined,
              height: input.height ?? undefined,
              selected: false,
              draggable: input.blockType !== "core",
              deletable: input.blockType !== "core",
              zIndex: input.blockType === "frame" ? 0 : 1,
              data: {
                ...(input.data ?? {}),
                blockType: input.blockType,
                content: input.content ?? "",
                ownerId: userId,
                metadata: undefined,
              },
            });

            const yText = new Y.Text();
            if (input.content) {
              yText.insert(0, input.content);
            }
            yContents.set(blockId, yText);

            results.push({ id: blockId, position: { x: pos.x, y: pos.y } });
          }
        });

        await persistIfNeeded(projectId, ydoc, isLive, ldb);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ blocks: results }),
            },
          ],
        };
      } catch (err) {
        const mapped = mapError(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(mapped) }],
          isError: true,
        };
      }
    },
  );
}
