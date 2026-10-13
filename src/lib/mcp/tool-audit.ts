import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { appendAuditEvent } from "../../app/lib/audit-trail";
import { logger } from "../../app/lib/logger";
import { getMcpContext } from "./context";

const MCP_WRITE_TOOLS = new Set([
  "create_block",
  "update_block",
  "delete_block",
  "create_blocks_batch",
  "create_link",
  "delete_link",
  "create_kanban_task",
  "update_kanban_task",
  "move_kanban_task",
  "delete_kanban_task",
  "link_kanban_tasks",
  "manage_kanban_columns",
  "manage_kanban_fields",
  "create_table_row",
  "update_table_cell",
  "delete_table_row",
  "manage_table_columns",
]);

function entityTypeForTool(name: string): string {
  if (name.includes("kanban_task")) return "kanbanTask";
  if (name.includes("kanban_columns")) return "kanbanColumn";
  if (name.includes("kanban_fields")) return "kanbanField";
  if (name.includes("table_row") || name.includes("table_cell"))
    return "tableRow";
  if (name.includes("table_columns")) return "tableColumn";
  if (name.includes("block")) return "block";
  if (name.includes("link")) return "link";
  return "project";
}

function extractEntityId(args: Record<string, unknown>): string | null {
  for (const key of ["blockId", "taskId", "rowId"]) {
    const value = args[key];
    if (typeof value === "string") return value;
  }
  return null;
}

async function auditToolSuccess(
  name: string,
  args: Record<string, unknown> | undefined,
): Promise<void> {
  const projectId = typeof args?.projectId === "string" ? args.projectId : null;
  if (!projectId) return;
  const { userId } = getMcpContext();
  await appendAuditEvent({
    projectId,
    userId,
    action: `mcp.${name}`,
    entityType: entityTypeForTool(name),
    entityId: extractEntityId(args ?? {}),
    summary: `MCP tool ${name} applied`,
    metadata: { tool: name },
  });
}

export function withToolAudit(server: McpServer): McpServer {
  const originalTool = server.tool.bind(server);
  const wrappedTool = (name: string, ...rest: unknown[]): unknown => {
    if (MCP_WRITE_TOOLS.has(name)) {
      const handlerIndex = rest.length - 1;
      const handler = rest[handlerIndex];
      if (typeof handler === "function") {
        rest[handlerIndex] = async (...args: unknown[]) => {
          const result = await (
            handler as (...a: unknown[]) => Promise<unknown>
          )(...args);
          try {
            await auditToolSuccess(
              name,
              args[0] as Record<string, unknown> | undefined,
            );
          } catch (e) {
            logger.error(
              { err: e, tool: name },
              "[MCP] Failed to append tool audit event",
            );
          }
          return result;
        };
      }
    }
    return (originalTool as (...a: unknown[]) => unknown)(name, ...rest);
  };
  (server as unknown as { tool: unknown }).tool = wrappedTool;
  return server;
}
