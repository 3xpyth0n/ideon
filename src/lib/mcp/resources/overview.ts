/**
 * MCP Resource: canvas://project/{projectId}/overview
 *
 * Returns a text/plain summary of a project's canvas:
 * - Block count grouped by type
 * - Link count
 * - Bounding box coordinates (or "empty canvas" if no blocks)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LeveldbPersistence } from "y-leveldb";
import { getMcpContext } from "../context";
import { checkProjectAccess } from "../tools/projects";
import { getProjectDoc, readBlocks, readLinks } from "../yjs-bridge";
import { computeBoundingBox, type ExistingBlock } from "../placement-engine";

/**
 * Registers the canvas://project/{projectId}/overview resource template.
 */
export function registerOverviewResource(
  server: McpServer,
  ldb: LeveldbPersistence,
): void {
  const template = new ResourceTemplate(
    "canvas://project/{projectId}/overview",
    { list: undefined },
  );

  server.resource(
    "project-overview",
    template,
    {
      description:
        "Quick text summary of a project canvas: block counts by type, link count, and bounding box. Useful for getting oriented before making changes.",
      mimeType: "text/plain",
    },
    async (uri, variables) => {
      const projectId = variables.projectId as string;

      // Check access permissions
      const { userId } = getMcpContext();
      await checkProjectAccess(userId, projectId);

      // Load Yjs doc
      const { ydoc } = await getProjectDoc(projectId, ldb);
      const blocks = readBlocks(ydoc);
      const links = readLinks(ydoc);

      // Handle empty canvas
      if (blocks.length === 0) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: "Empty canvas: 0 blocks, 0 links, no bounding box.",
            },
          ],
        };
      }

      // Count blocks by type
      const typeCounts = new Map<string, number>();
      for (const block of blocks) {
        const t = block.type;
        typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
      }

      // Compute bounding box
      const existingBlocks: ExistingBlock[] = blocks.map((b) => ({
        x: b.position.x,
        y: b.position.y,
        width: b.width ?? 320,
        height: b.height ?? 240,
      }));
      const bbox = computeBoundingBox(existingBlocks);

      // Build text summary
      const lines: string[] = [];
      lines.push(
        `Canvas overview (${blocks.length} blocks, ${links.length} links)`,
      );
      lines.push("");
      lines.push("Blocks by type:");
      for (const [type, count] of [...typeCounts.entries()].sort()) {
        lines.push(`  ${type}: ${count}`);
      }
      lines.push("");
      lines.push(
        `Bounding box: (${bbox.minX}, ${bbox.minY}) to (${bbox.maxX}, ${bbox.maxY})`,
      );

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: lines.join("\n"),
          },
        ],
      };
    },
  );
}
