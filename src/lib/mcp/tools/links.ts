/**
 * Link tools for the MCP server.
 *
 * Provides tools to list, create, and delete links (edges) between blocks
 * on the Ideon canvas. Links are stored in the Yjs document's "links" map.
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LeveldbPersistence } from "y-leveldb";
import { getMcpContext } from "../context";
import {
  getProjectDoc,
  readBlocks,
  readLinks,
  persistIfNeeded,
} from "../yjs-bridge";
import { NotFoundError, ValidationError, mapError } from "../errors";
import { checkProjectAccess } from "./projects";

/**
 * Registers all link-related tools on the MCP server.
 */
export function registerLinkTools(
  server: McpServer,
  ldb: LeveldbPersistence,
): void {
  // ─── list_links ──────────────────────────────────────────────────────────────

  server.tool(
    "list_links",
    "List all links (connections) between blocks in a project. Returns link IDs, source/target block IDs, type, and label.",
    { projectId: z.string().describe("The project ID to list links for") },
    async ({ projectId }) => {
      try {
        const { userId } = getMcpContext();
        await checkProjectAccess(userId, projectId, "viewer");

        const { ydoc } = await getProjectDoc(projectId, ldb);
        const links = readLinks(ydoc);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                links: links.map((l) => ({
                  id: l.id,
                  source: l.source,
                  target: l.target,
                  type: l.type,
                  label: l.label,
                })),
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

  // ─── create_link ─────────────────────────────────────────────────────────────

  server.tool(
    "create_link",
    "Create a link (connection) between two blocks. Both blocks must exist. Self-links are not allowed. Optionally set a label (max 200 chars), type, and animated flag.",
    {
      projectId: z.string().describe("The project ID"),
      sourceBlockId: z.string().describe("The source block ID"),
      targetBlockId: z.string().describe("The target block ID"),
      label: z
        .string()
        .max(200)
        .optional()
        .describe("Optional label for the link (max 200 characters)"),
      type: z
        .string()
        .optional()
        .describe("Edge type (defaults to 'connection')"),
      animated: z
        .boolean()
        .optional()
        .describe("Whether the link should be animated (defaults to false)"),
    },
    async ({
      projectId,
      sourceBlockId,
      targetBlockId,
      label,
      type,
      animated,
    }) => {
      try {
        const { userId } = getMcpContext();
        await checkProjectAccess(userId, projectId, "editor");

        // Reject self-links
        if (sourceBlockId === targetBlockId) {
          throw new ValidationError(
            "Self-links are not allowed (source and target must differ)",
          );
        }

        // Validate label length (Zod handles max 200, but double-check for safety)
        if (label !== undefined && label.length > 200) {
          throw new ValidationError("Label must be 200 characters or fewer");
        }

        const { ydoc, isLive } = await getProjectDoc(projectId, ldb);

        // Verify both blocks exist
        const blocks = readBlocks(ydoc);
        const blockIds = new Set(blocks.map((b) => b.id));

        if (!blockIds.has(sourceBlockId)) {
          throw new NotFoundError(`Source block not found: ${sourceBlockId}`);
        }
        if (!blockIds.has(targetBlockId)) {
          throw new NotFoundError(`Target block not found: ${targetBlockId}`);
        }

        const linkId = randomUUID();
        const linkData = {
          id: linkId,
          source: sourceBlockId,
          target: targetBlockId,
          sourceHandle: null,
          targetHandle: null,
          type: type ?? "connection",
          animated: animated ?? false,
          markerEnd: "connection-arrow",
          data: { label: label ?? null },
        };

        ydoc.transact(() => {
          const yLinks = ydoc.getMap("links");
          yLinks.set(linkId, linkData);
        });

        await persistIfNeeded(projectId, ydoc, isLive, ldb);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ id: linkId }),
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

  // ─── delete_link ─────────────────────────────────────────────────────────────

  server.tool(
    "delete_link",
    "Delete a link (connection) between two blocks. The link must exist in the project.",
    {
      projectId: z.string().describe("The project ID containing the link"),
      linkId: z.string().describe("The ID of the link to delete"),
    },
    async ({ projectId, linkId }) => {
      try {
        const { userId } = getMcpContext();
        await checkProjectAccess(userId, projectId, "editor");

        const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
        const yLinks = ydoc.getMap("links");

        // Verify link exists
        if (!yLinks.has(linkId)) {
          throw new NotFoundError(`Link not found: ${linkId}`);
        }

        ydoc.transact(() => {
          yLinks.delete(linkId);
        });

        await persistIfNeeded(projectId, ydoc, isLive, ldb);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true }),
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
