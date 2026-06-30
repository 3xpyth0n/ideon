/**
 * MCP Server factory.
 *
 * Creates a fresh McpServer instance per request. The Streamable HTTP stateless
 * transport requires a new server↔transport pair for each request because the
 * SDK's Protocol.connect() can only be called once per server instance.
 *
 * Tool/resource registration is lightweight (array pushes), so creating a new
 * instance per request is the correct and performant approach.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LeveldbPersistence } from "y-leveldb";
import { registerProjectTools } from "./tools/projects";
import { registerBlockTools } from "./tools/blocks";
import { registerLinkTools } from "./tools/links";
import { registerKanbanTools } from "./tools/kanban";
import { registerSearchTools } from "./tools/search";
import { registerOverviewResource } from "./resources/overview";
import { registerGraphResource } from "./resources/graph";
import { registerHelpResource } from "./resources/help";

const INSTRUCTIONS = `Ideon is a spatial visual workspace. Projects contain blocks placed on an infinite 2D canvas.
Blocks have positions (x, y) and are connected by links. Spatial proximity = semantic proximity.

Key concepts:
- Blocks: visual elements (text notes, kanban boards, links, code snippets, etc.) placed on a canvas
- Links: visual connections between blocks showing relationships
- Position matters: place related blocks near each other using anchorBlockId + direction

Workflow tips:
- Always call list_blocks first to understand the current canvas layout
- Use anchorBlockId to place new blocks near related existing blocks
- Use direction (right/down/left/up) to control relative placement
- Use create_blocks_batch for multiple related blocks (auto grid layout)
- Read canvas://project/{id}/overview for a quick summary before acting`;

/**
 * Creates a new MCP server instance with all tools and resources registered.
 * Must be called once per request for stateless Streamable HTTP transport.
 */
export function createMcpServer(ldb: LeveldbPersistence): McpServer {
  const server = new McpServer(
    {
      name: "ideon",
      version: "1.0.0",
    },
    {
      instructions: INSTRUCTIONS,
    },
  );

  // Register tools
  registerProjectTools(server, ldb);
  registerBlockTools(server, ldb);
  registerLinkTools(server, ldb);
  registerKanbanTools(server, ldb);
  registerSearchTools(server, ldb);

  // Register resources
  registerOverviewResource(server, ldb);
  registerGraphResource(server, ldb);
  registerHelpResource(server);

  return server;
}
