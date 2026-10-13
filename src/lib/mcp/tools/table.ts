/**
 * Table tools for the MCP server.
 *
 * Provides cell-level operations on database blocks:
 * list_table_rows, create_table_row, update_table_cell,
 * delete_table_row, manage_table_columns, export_table
 *
 * Parsing, cell validation, and export are shared with the client via
 * tableModel.ts so both layers enforce identical rules.
 */

import { z } from "zod";
import * as Y from "yjs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LeveldbPersistence } from "y-leveldb";
import type { Node } from "@xyflow/react";
import type { BlockData } from "../../../app/components/project/CanvasBlock";
import {
  parseTableMetadata,
  exportTableToCsv,
  exportTableToMarkdown,
  validateCellValue,
  coerceRowsForColumnType,
  defaultCellForType,
  TableValidationError,
  type ParsedTableMetadata,
  type TableColumn,
  type TableRow,
  type TableCellValue,
} from "../../../app/components/project/tableModel";
import { getMcpContext } from "../context";
import { getProjectDoc, persistIfNeeded } from "../yjs-bridge";
import { NotFoundError, ValidationError } from "../errors";
import { checkProjectAccess } from "./projects";
import { v4 as uuidv4 } from "uuid";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Loads and validates a database block from the Yjs blocks map.
 * Throws NotFoundError if block not found, ValidationError if not database type.
 */
function getDatabaseBlock(
  yBlocks: Y.Map<Node<BlockData>>,
  blockId: string,
): ParsedTableMetadata {
  const rawBlock = yBlocks.get(blockId);
  if (!rawBlock) {
    throw new NotFoundError(`Block '${blockId}' not found`);
  }

  const blockType = rawBlock.data?.blockType ?? rawBlock.type;
  if (blockType !== "database") {
    throw new ValidationError(
      `Block '${blockId}' is not a database block (type: ${
        blockType ?? "unknown"
      })`,
    );
  }

  const rawMeta = rawBlock.data?.metadata;
  let parsed: unknown;
  if (typeof rawMeta === "string") {
    if (rawMeta) {
      try {
        parsed = JSON.parse(rawMeta);
      } catch {
        throw new ValidationError(
          `Block '${blockId}' has malformed metadata (invalid JSON)`,
        );
      }
    } else {
      parsed = {};
    }
  } else {
    parsed = rawMeta ?? {};
  }

  return parseTableMetadata(parsed);
}

function getExistingBlockIds(yBlocks: Y.Map<Node<BlockData>>): Set<string> {
  return new Set(yBlocks.keys());
}

/**
 * Validate a cell value against its column type, re-raising the shared
 * validation error as the MCP ValidationError.
 */
export function assertValidCell(
  column: TableColumn,
  value: unknown,
  existingBlockIds: ReadonlySet<string>,
): TableCellValue {
  try {
    return validateCellValue(column, value, existingBlockIds);
  } catch (error) {
    if (error instanceof TableValidationError) {
      throw new ValidationError(error.message);
    }
    throw error;
  }
}

/**
 * Update only the data.metadata sub-field of the block, re-reading the
 * freshest value inside the transaction so concurrent edits to other
 * fields survive.
 */
async function persistMetadata(
  ydoc: Y.Doc,
  yBlocks: Y.Map<Node<BlockData>>,
  blockId: string,
  metadata: ParsedTableMetadata,
  projectId: string,
  isLive: boolean,
  ldb: LeveldbPersistence,
): Promise<void> {
  ydoc.transact(() => {
    const existing = yBlocks.get(blockId);
    if (!existing) {
      throw new NotFoundError(`Block '${blockId}' not found`);
    }
    const updated: Node<BlockData> = {
      ...existing,
      data: { ...existing.data, metadata: JSON.stringify(metadata) },
    };
    yBlocks.set(blockId, updated);
  });
  await persistIfNeeded(projectId, ydoc, isLive, ldb);
}

/**
 * Validate that a reorder request lists every existing column id exactly
 * once. Throws ValidationError otherwise.
 */
export function assertValidColumnOrder(
  columnIds: readonly string[],
  existingIds: readonly string[],
): void {
  const providedSet = new Set(columnIds);
  if (
    columnIds.length !== providedSet.size ||
    providedSet.size !== existingIds.length ||
    existingIds.some((id) => !providedSet.has(id))
  ) {
    throw new ValidationError(
      "columnIds must contain every existing column id exactly once",
    );
  }
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerTableTools(
  server: McpServer,
  ldb: LeveldbPersistence,
): void {
  // ── list_table_rows ────────────────────────────────────────────────────────

  server.tool(
    "list_table_rows",
    "List all rows and columns in a database block. Returns the table structure (columns with types) and all rows with their cell values. Requires viewer+ access.",
    {
      projectId: z
        .string()
        .describe("The project containing the database block"),
      blockId: z.string().describe("The database block identifier"),
    },
    async ({ projectId, blockId }) => {
      const { userId } = getMcpContext();
      await checkProjectAccess(userId, projectId);

      const { ydoc } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const metadata = getDatabaseBlock(yBlocks, blockId);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                blockId,
                blockType: "database",
                columns: metadata.columns,
                rows: metadata.rows,
                sortColumnId: metadata.sortColumnId,
                sortDirection: metadata.sortDirection,
                filterColumnId: metadata.filterColumnId,
                filterValue: metadata.filterValue,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── create_table_row ─────────────────────────────────────────────────────

  server.tool(
    "create_table_row",
    "Add a new row to a database block. Optionally set cell values for specific columns. Requires editor+ access.",
    {
      projectId: z
        .string()
        .describe("The project containing the database block"),
      blockId: z.string().describe("The database block identifier"),
      cells: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Cell values keyed by column ID. Missing columns get defaults.",
        ),
    },
    async ({ projectId, blockId, cells }) => {
      const { userId } = getMcpContext();
      await checkProjectAccess(userId, projectId, "editor");

      const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const metadata = getDatabaseBlock(yBlocks, blockId);
      const existingBlockIds = getExistingBlockIds(yBlocks);

      const newRow: TableRow = { id: uuidv4(), cells: {} };
      for (const col of metadata.columns) {
        if (cells && cells[col.id] !== undefined) {
          newRow.cells[col.id] = assertValidCell(
            col,
            cells[col.id],
            existingBlockIds,
          );
        } else {
          newRow.cells[col.id] = defaultCellForType(col.type);
        }
      }

      metadata.rows.push(newRow);
      await persistMetadata(
        ydoc,
        yBlocks,
        blockId,
        metadata,
        projectId,
        isLive,
        ldb,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { success: true, rowId: newRow.id, row: newRow },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── update_table_cell ────────────────────────────────────────────────────

  server.tool(
    "update_table_cell",
    "Update a single cell value in a database block. Specify row ID, column ID, and new value. For relation columns, pass { blockId: '...' }. Requires editor+ access.",
    {
      projectId: z
        .string()
        .describe("The project containing the database block"),
      blockId: z.string().describe("The database block identifier"),
      rowId: z.string().describe("The row ID to update"),
      columnId: z.string().describe("The column ID of the cell to update"),
      value: z
        .union([
          z.string(),
          z.number(),
          z.object({ blockId: z.string() }),
          z.null(),
        ])
        .describe("New cell value. For relation type, pass { blockId: '...' }"),
    },
    async ({ projectId, blockId, rowId, columnId, value }) => {
      const { userId } = getMcpContext();
      await checkProjectAccess(userId, projectId, "editor");

      const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const metadata = getDatabaseBlock(yBlocks, blockId);
      const existingBlockIds = getExistingBlockIds(yBlocks);

      const row = metadata.rows.find((r) => r.id === rowId);
      if (!row) {
        throw new NotFoundError(
          `Row '${rowId}' not found in block '${blockId}'`,
        );
      }
      const col = metadata.columns.find((c) => c.id === columnId);
      if (!col) {
        throw new ValidationError(
          `Column '${columnId}' not found in block '${blockId}'`,
        );
      }

      row.cells[columnId] = assertValidCell(col, value, existingBlockIds);
      await persistMetadata(
        ydoc,
        yBlocks,
        blockId,
        metadata,
        projectId,
        isLive,
        ldb,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { success: true, rowId, columnId, value },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── delete_table_row ─────────────────────────────────────────────────────

  server.tool(
    "delete_table_row",
    "Delete a row from a database block. Requires editor+ access.",
    {
      projectId: z
        .string()
        .describe("The project containing the database block"),
      blockId: z.string().describe("The database block identifier"),
      rowId: z.string().describe("The row ID to delete"),
    },
    async ({ projectId, blockId, rowId }) => {
      const { userId } = getMcpContext();
      await checkProjectAccess(userId, projectId, "editor");

      const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const metadata = getDatabaseBlock(yBlocks, blockId);

      const initialLength = metadata.rows.length;
      metadata.rows = metadata.rows.filter((r) => r.id !== rowId);
      if (metadata.rows.length === initialLength) {
        throw new NotFoundError(
          `Row '${rowId}' not found in block '${blockId}'`,
        );
      }

      await persistMetadata(
        ydoc,
        yBlocks,
        blockId,
        metadata,
        projectId,
        isLive,
        ldb,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { success: true, deletedRowId: rowId },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── manage_table_columns ─────────────────────────────────────────────────

  server.tool(
    "manage_table_columns",
    "Manage columns of a database block: add, rename, delete, reorder, or change the type of columns. Requires editor+ access.",
    {
      projectId: z
        .string()
        .describe("The project containing the database block"),
      blockId: z.string().describe("The database block identifier"),
      action: z
        .enum(["add", "rename", "delete", "reorder", "changeType"])
        .describe("Action to perform on columns"),
      columnId: z
        .string()
        .optional()
        .describe("Column ID (required for rename, delete, changeType)"),
      newName: z
        .string()
        .optional()
        .describe("New name for the column (rename only)"),
      columnType: z
        .enum(["text", "number", "enum", "url", "relation"])
        .optional()
        .describe("Type for the column (add and changeType only)"),
      options: z
        .array(z.object({ id: z.string(), label: z.string() }))
        .optional()
        .describe("Enum options (type=enum only)"),
      columnIds: z
        .array(z.string())
        .optional()
        .describe("Ordered column IDs (reorder only)"),
    },
    async ({
      projectId,
      blockId,
      action,
      columnId,
      newName,
      columnType,
      options,
      columnIds,
    }) => {
      const { userId } = getMcpContext();
      await checkProjectAccess(userId, projectId, "editor");

      const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const metadata = getDatabaseBlock(yBlocks, blockId);

      switch (action) {
        case "add": {
          const newCol: TableColumn = {
            id: uuidv4(),
            name: newName || "Column",
            type: columnType || "text",
            ...(columnType === "enum" && {
              options:
                options && options.length > 0
                  ? options
                  : [{ id: "o1", label: "Option 1" }],
            }),
          };
          metadata.columns.push(newCol);
          for (const row of metadata.rows) {
            row.cells[newCol.id] = defaultCellForType(newCol.type);
          }
          break;
        }
        case "rename": {
          if (!columnId) {
            throw new ValidationError("columnId is required for rename");
          }
          if (columnType) {
            throw new ValidationError(
              "columnType is not accepted for rename; use the changeType action",
            );
          }
          const col = metadata.columns.find((c) => c.id === columnId);
          if (!col) {
            throw new NotFoundError(`Column '${columnId}' not found`);
          }
          col.name = newName || col.name;
          break;
        }
        case "delete": {
          if (!columnId) {
            throw new ValidationError("columnId is required for delete");
          }
          const initialLength = metadata.columns.length;
          metadata.columns = metadata.columns.filter((c) => c.id !== columnId);
          if (metadata.columns.length === initialLength) {
            throw new NotFoundError(`Column '${columnId}' not found`);
          }
          for (const row of metadata.rows) {
            delete row.cells[columnId];
          }
          break;
        }
        case "reorder": {
          if (!columnIds) {
            throw new ValidationError("columnIds is required for reorder");
          }
          assertValidColumnOrder(
            columnIds,
            metadata.columns.map((c) => c.id),
          );
          const idToCol = new Map(metadata.columns.map((c) => [c.id, c]));
          metadata.columns = columnIds.map((id) => idToCol.get(id)!);
          break;
        }
        case "changeType": {
          if (!columnId) {
            throw new ValidationError("columnId is required for changeType");
          }
          if (!columnType) {
            throw new ValidationError("columnType is required for changeType");
          }
          const col = metadata.columns.find((c) => c.id === columnId);
          if (!col) {
            throw new NotFoundError(`Column '${columnId}' not found`);
          }
          const previousType = col.type;
          const previousOptions = col.options;
          col.type = columnType;
          if (columnType === "enum") {
            if (options && options.length > 0) {
              col.options = options;
            } else if (!col.options) {
              col.options = [{ id: "o1", label: "Option 1" }];
            }
          } else {
            col.options = undefined;
          }
          metadata.rows = coerceRowsForColumnType(
            col,
            previousOptions,
            previousType,
            metadata.rows,
          );
          break;
        }
      }

      await persistMetadata(
        ydoc,
        yBlocks,
        blockId,
        metadata,
        projectId,
        isLive,
        ldb,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { success: true, action, columns: metadata.columns.length },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── export_table ────────────────────────────────────────────────────────

  server.tool(
    "export_table",
    "Export a database block as CSV or Markdown text. Requires viewer+ access.",
    {
      projectId: z
        .string()
        .describe("The project containing the database block"),
      blockId: z.string().describe("The database block identifier"),
      format: z.enum(["csv", "markdown"]).describe("Output format"),
    },
    async ({ projectId, blockId, format }) => {
      const { userId } = getMcpContext();
      await checkProjectAccess(userId, projectId);

      const { ydoc } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const metadata = getDatabaseBlock(yBlocks, blockId);

      const content =
        format === "csv"
          ? exportTableToCsv(metadata.columns, metadata.rows)
          : exportTableToMarkdown(metadata.columns, metadata.rows);

      return {
        content: [
          {
            type: "text" as const,
            text: content,
          },
        ],
      };
    },
  );
}
