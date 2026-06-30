/**
 * MCP Resource: canvas://project/{projectId}/graph
 *
 * Returns application/json with the full graph structure:
 * - blocks: array of { id, type, position, width, height }
 * - links: array of { id, source, target, type, label }
 *
 * Handles empty canvas by returning empty arrays.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LeveldbPersistence } from "y-leveldb";
import { getMcpContext } from "../context";
import { checkProjectAccess } from "../tools/projects";
import { getProjectDoc, readBlocks, readLinks } from "../yjs-bridge";

/**
 * Registers the canvas://project/{projectId}/graph resource template.
 */
export function registerGraphResource(
  server: McpServer,
  ldb: LeveldbPersistence,
): void {
  const template = new ResourceTemplate("canvas://project/{projectId}/graph", {
    list: undefined,
  });

  server.resource(
    "project-graph",
    template,
    {
      description:
        "Full graph structure of a project canvas as JSON. Contains all blocks (id, type, position, dimensions) and links (id, source, target, type, label). Use for programmatic analysis of canvas topology.",
      mimeType: "application/json",
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

      // Build graph JSON — simplified block/link data for AI consumption
      const graph = {
        blocks: blocks.map((b) => ({
          id: b.id,
          type: b.type,
          position: b.position,
          width: b.width ?? 320,
          height: b.height ?? 240,
        })),
        links: links.map((l) => ({
          id: l.id,
          source: l.source,
          target: l.target,
          type: l.type,
          label: l.label,
        })),
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(graph, null, 2),
          },
        ],
      };
    },
  );
}
