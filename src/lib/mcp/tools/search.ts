/**
 * Search tool for the MCP server.
 *
 * Registers the `search_blocks` tool which performs case-insensitive
 * substring search across block content and metadata.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LeveldbPersistence } from "y-leveldb";
import { checkProjectAccess } from "./projects";
import { getMcpContext } from "../context";
import { getProjectDoc, readBlocks } from "../yjs-bridge";
import { ValidationError } from "../errors";

interface SearchResult {
  id: string;
  type: string;
  x: number;
  y: number;
  contentPreview: string;
  matchContext: string;
}

/**
 * Extracts a ~100 char window around the first occurrence of `query` in `text`.
 * Shows 50 chars before the match, the match itself, and 50 chars after.
 */
function getMatchContext(text: string, query: string): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) return "";

  const contextBefore = 50;
  const contextAfter = 50;

  const start = Math.max(0, matchIndex - contextBefore);
  const end = Math.min(text.length, matchIndex + query.length + contextAfter);

  let context = text.slice(start, end);

  if (start > 0) context = "..." + context;
  if (end < text.length) context = context + "...";

  return context;
}

/**
 * Registers the `search_blocks` tool on the given MCP server.
 */
export function registerSearchTools(
  server: McpServer,
  ldb: LeveldbPersistence,
): void {
  server.tool(
    "search_blocks",
    "Search blocks by content or metadata. Case-insensitive substring match. Returns up to 50 matching results with position and context.",
    {
      projectId: z.string().describe("The project ID to search within"),
      query: z.string().describe("Search query (1-200 characters)"),
    },
    async (params) => {
      const { userId } = getMcpContext();
      const { projectId, query } = params;

      // Validate query length (trim whitespace first)
      const trimmedQuery = query.trim();
      if (trimmedQuery.length < 1 || trimmedQuery.length > 200) {
        throw new ValidationError(
          "Query must be between 1 and 200 characters after trimming whitespace",
        );
      }

      // Check viewer+ access
      await checkProjectAccess(userId, projectId, "viewer");

      // Load Yjs doc and read blocks
      const { ydoc } = await getProjectDoc(projectId, ldb);
      const blocks = readBlocks(ydoc);

      const lowerQuery = trimmedQuery.toLowerCase();
      const results: SearchResult[] = [];
      const MAX_RESULTS = 50;

      for (const block of blocks) {
        if (results.length >= MAX_RESULTS) break;

        const content = block.data?.content ?? "";
        const metadataStr = block.data?.metadata
          ? JSON.stringify(block.data.metadata)
          : "";

        const contentMatch = content.toLowerCase().includes(lowerQuery);
        const metadataMatch = metadataStr.toLowerCase().includes(lowerQuery);

        if (contentMatch || metadataMatch) {
          // Build contentPreview: first 200 chars of content
          const contentPreview = content.slice(0, 200);

          // Build matchContext from whichever field matched
          let matchContext = "";
          if (contentMatch) {
            matchContext = getMatchContext(content, trimmedQuery);
          } else if (metadataMatch) {
            matchContext = getMatchContext(metadataStr, trimmedQuery);
          }

          results.push({
            id: block.id,
            type: block.type,
            x: block.position.x,
            y: block.position.y,
            contentPreview,
            matchContext,
          });
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ results }, null, 2),
          },
        ],
      };
    },
  );
}
