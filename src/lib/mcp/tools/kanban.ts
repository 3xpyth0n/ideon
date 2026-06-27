/**
 * Kanban tools for the MCP server.
 *
 * Provides `list_kanban_tasks`, `create_kanban_task`, and `move_kanban_task`
 * tools for managing tasks within kanban-type blocks.
 */

import { z } from "zod";
import * as Y from "yjs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LeveldbPersistence } from "y-leveldb";
import type { Node } from "@xyflow/react";
import type { BlockData } from "../../../app/components/project/CanvasBlock";
import { getMcpContext } from "../context";
import { getProjectDoc, persistIfNeeded } from "../yjs-bridge";
import { NotFoundError, ValidationError } from "../errors";
import { checkProjectAccess } from "./projects";

// ─── Kanban Metadata Types ───────────────────────────────────────────────────

export interface LinkedTask {
  taskId: string;
  blockId: string;
  relationType: "blocked-by" | "blocks" | "relates-to";
}

export interface KanbanTask {
  id: string;
  text: string;
  checked: boolean;
  description?: string;
  assigneeIds?: string[];
  fields?: Record<string, string>;
  linkedTasks?: LinkedTask[];
  taskNumber?: number;
  [key: string]: unknown;
}

export interface KanbanColumn {
  id: string;
  title: string;
  color?: string;
  description?: string;
  workflowState?: "todo" | "in-progress" | "done";
  tasks: KanbanTask[];
  [key: string]: unknown;
}

export interface KanbanFieldOption {
  id: string;
  label: string;
  color?: string;
}

export interface KanbanField {
  id: string;
  name: string;
  type: "text" | "date" | "select" | "number";
  options?: KanbanFieldOption[];
}

export interface KanbanMetadata {
  columns: KanbanColumn[];
  fields?: KanbanField[];
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Loads and validates a kanban block, returning the parsed block data and
 * parsed metadata columns. Throws if block not found or not kanban type.
 */
function getKanbanBlock(
  yBlocks: Y.Map<Node<BlockData>>,
  blockId: string,
): { metadata: KanbanMetadata } {
  const rawBlock = yBlocks.get(blockId);
  if (!rawBlock) {
    throw new NotFoundError(`Block '${blockId}' not found`);
  }

  const blockType = rawBlock.data?.blockType ?? rawBlock.type;
  if (blockType !== "kanban") {
    throw new ValidationError(
      `Block '${blockId}' is not a kanban block (type: ${
        blockType ?? "unknown"
      })`,
    );
  }

  // Parse metadata — can be a JSON string or an object
  const rawMeta = rawBlock.data?.metadata;
  let metadata: KanbanMetadata;
  try {
    const parsed =
      typeof rawMeta === "string" ? JSON.parse(rawMeta || "{}") : rawMeta ?? {};
    metadata = {
      ...parsed,
      columns: Array.isArray(parsed.columns) ? parsed.columns : [],
      fields: Array.isArray(parsed.fields) ? parsed.fields : undefined,
    };
  } catch {
    metadata = { columns: [] };
  }

  return { metadata };
}

/**
 * Searches all columns for a task by ID.
 * Returns the task, its containing column, and their indices, or undefined if not found.
 */
export function findTaskAcrossColumns(
  metadata: KanbanMetadata,
  taskId: string,
):
  | {
      task: KanbanTask;
      column: KanbanColumn;
      columnIndex: number;
      taskIndex: number;
    }
  | undefined {
  for (let ci = 0; ci < metadata.columns.length; ci++) {
    const col = metadata.columns[ci];
    const ti = col.tasks.findIndex((t) => t.id === taskId);
    if (ti !== -1) {
      return {
        task: col.tasks[ti],
        column: col,
        columnIndex: ci,
        taskIndex: ti,
      };
    }
  }
  return undefined;
}

/**
 * Computes the next available task number by scanning all tasks across all columns.
 */
export function getNextTaskNumber(metadata: KanbanMetadata): number {
  let max = 0;
  for (const col of metadata.columns) {
    for (const task of col.tasks) {
      if (task.taskNumber && task.taskNumber > max) {
        max = task.taskNumber;
      }
    }
  }
  return max + 1;
}

/**
 * Maps a relation type to its reciprocal.
 */
export function getReciprocalRelation(
  relationType: "blocked-by" | "blocks" | "relates-to",
): "blocked-by" | "blocks" | "relates-to" {
  switch (relationType) {
    case "blocked-by":
      return "blocks";
    case "blocks":
      return "blocked-by";
    case "relates-to":
      return "relates-to";
  }
}

/**
 * Encapsulates the deep-clone-mutate-set pattern for metadata persistence.
 * Clones the block, updates its metadata, and sets it back via Yjs transaction,
 * then calls persistIfNeeded.
 */
export async function persistMetadata(
  ydoc: Y.Doc,
  yBlocks: Y.Map<Node<BlockData>>,
  blockId: string,
  metadata: KanbanMetadata,
  projectId: string,
  isLive: boolean,
  ldb: LeveldbPersistence,
): Promise<void> {
  ydoc.transact(() => {
    const block = JSON.parse(JSON.stringify(yBlocks.get(blockId)!));
    block.data.metadata = JSON.stringify(metadata);
    yBlocks.set(blockId, block);
  });
  await persistIfNeeded(projectId, ydoc, isLive, ldb);
}

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerKanbanTools(
  server: McpServer,
  ldb: LeveldbPersistence,
): void {
  // ── list_kanban_tasks ──────────────────────────────────────────────────────

  server.tool(
    "list_kanban_tasks",
    "List all columns and tasks in a kanban block. Returns the column structure with task details. Requires viewer+ access.",
    {
      projectId: z.string().describe("The project containing the kanban block"),
      blockId: z.string().describe("The kanban block identifier"),
      includeFields: z
        .boolean()
        .optional()
        .describe("Include task field values and board field definitions"),
      includeAssignees: z
        .boolean()
        .optional()
        .describe("Include task assignee IDs and assignee resolution map"),
      includeLinkedTasks: z
        .boolean()
        .optional()
        .describe("Include task linked tasks"),
    },
    async ({
      projectId,
      blockId,
      includeFields,
      includeAssignees,
      includeLinkedTasks,
    }) => {
      const { userId } = getMcpContext();

      // Viewer access is sufficient for reading
      await checkProjectAccess(userId, projectId);

      const { ydoc } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const { metadata } = getKanbanBlock(yBlocks, blockId);

      const columns = metadata.columns.map((col) => ({
        id: col.id,
        title: col.title,
        workflowState: col.workflowState ?? null,
        tasks: col.tasks.map((task) => {
          // Default compact format
          const taskData: Record<string, unknown> = {
            id: task.id,
            title: task.text,
            checked: task.checked,
          };

          if (includeFields) {
            taskData.fields = task.fields ?? {};
          }

          if (includeAssignees) {
            taskData.assigneeIds = task.assigneeIds ?? [];
          }

          if (includeLinkedTasks) {
            taskData.linkedTasks = task.linkedTasks ?? [];
          }

          return taskData;
        }),
      }));

      // Build response with optional top-level data
      const response: Record<string, unknown> = { columns };

      if (includeFields) {
        response.fields = metadata.fields ?? [];
      }

      if (includeAssignees) {
        // Collect all referenced assignee IDs and build resolution map
        const assigneeIds = new Set<string>();
        for (const col of metadata.columns) {
          for (const task of col.tasks) {
            if (task.assigneeIds) {
              for (const id of task.assigneeIds) {
                assigneeIds.add(id);
              }
            }
          }
        }
        // Map userId → userId (no user lookup available in this context)
        const assignees: Record<string, string> = {};
        for (const id of assigneeIds) {
          assignees[id] = id;
        }
        response.assignees = assignees;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    },
  );

  // ── create_kanban_task ─────────────────────────────────────────────────────

  server.tool(
    "create_kanban_task",
    "Create a new task in a kanban block. By default, the task is added to the first column (or the 'todo' column if found). Requires editor+ access.",
    {
      projectId: z.string().describe("The project containing the kanban block"),
      blockId: z.string().describe("The kanban block identifier"),
      title: z
        .string()
        .min(1)
        .max(500)
        .describe("The task title (1-500 characters)"),
      columnId: z
        .string()
        .optional()
        .describe(
          "Target column ID. If omitted, uses the first column or the 'todo' column.",
        ),
      description: z
        .string()
        .max(5000)
        .optional()
        .describe("Optional task description (max 5000 characters)"),
      assigneeIds: z
        .array(z.string())
        .optional()
        .describe("Array of user IDs to assign to the task"),
      fields: z
        .record(z.string(), z.string())
        .optional()
        .describe("Field values keyed by field ID"),
    },
    async ({
      projectId,
      blockId,
      title,
      columnId,
      description,
      assigneeIds,
      fields,
    }) => {
      const { userId } = getMcpContext();

      // Editor+ access required for writes
      await checkProjectAccess(userId, projectId, "editor");

      const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const { metadata } = getKanbanBlock(yBlocks, blockId);

      if (metadata.columns.length === 0) {
        throw new ValidationError("Kanban block has no columns");
      }

      // Find target column
      let targetColumn: KanbanColumn | undefined;
      if (columnId) {
        targetColumn = metadata.columns.find((col) => col.id === columnId);
        if (!targetColumn) {
          throw new NotFoundError(
            `Column '${columnId}' not found in kanban block`,
          );
        }
      } else {
        // Default: use the todo column, or the first column
        targetColumn =
          metadata.columns.find((col) => col.workflowState === "todo") ??
          metadata.columns[0];
      }

      // Filter and validate fields against board-level field definitions
      let validatedFields: Record<string, string> | undefined;
      if (fields && metadata.fields) {
        const fieldMap = new Map(metadata.fields.map((f) => [f.id, f]));
        validatedFields = {};

        for (const [fieldId, value] of Object.entries(fields)) {
          const fieldDef = fieldMap.get(fieldId);
          // Silently drop unknown field IDs
          if (!fieldDef) continue;

          // Validate select-type field values against defined options
          if (fieldDef.type === "select") {
            const validOptionIds = (fieldDef.options ?? []).map(
              (opt) => opt.id,
            );
            if (!validOptionIds.includes(value)) {
              throw new ValidationError(
                `Invalid option '${value}' for select field '${fieldId}'`,
              );
            }
          }

          validatedFields[fieldId] = value;
        }
      }

      // Generate new task with format matching frontend (t-xxxx)
      const taskId = `t-${Math.random().toString(36).slice(2, 9)}`;
      const newTask: KanbanTask = {
        id: taskId,
        text: title,
        checked: false,
        taskNumber: getNextTaskNumber(metadata),
        ...(description ? { description } : {}),
        ...(assigneeIds ? { assigneeIds } : {}),
        ...(validatedFields && Object.keys(validatedFields).length > 0
          ? { fields: validatedFields }
          : {}),
      };

      // Update columns with new task appended to target column
      const updatedColumns = metadata.columns.map((col) =>
        col.id === targetColumn!.id
          ? { ...col, tasks: [...col.tasks, newTask] }
          : col,
      );

      // Persist changes within a transaction
      const updatedMetadataStr = JSON.stringify({
        ...metadata,
        columns: updatedColumns,
      });

      ydoc.transact(() => {
        const block = JSON.parse(JSON.stringify(yBlocks.get(blockId)!));
        block.data.metadata = updatedMetadataStr;
        yBlocks.set(blockId, block);
      });

      await persistIfNeeded(projectId, ydoc, isLive, ldb);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ taskId }, null, 2),
          },
        ],
      };
    },
  );

  // ── move_kanban_task ───────────────────────────────────────────────────────

  server.tool(
    "move_kanban_task",
    "Move a task from its current column to a target column at an optional position. Finds the task across all columns. Requires editor+ access.",
    {
      projectId: z.string().describe("The project containing the kanban block"),
      blockId: z.string().describe("The kanban block identifier"),
      taskId: z.string().describe("The task to move"),
      targetColumnId: z.string().describe("The destination column ID"),
      position: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Zero-based position in the target column. If omitted, appends at the end.",
        ),
    },
    async ({ projectId, blockId, taskId, targetColumnId, position }) => {
      const { userId } = getMcpContext();

      // Editor+ access required for writes
      await checkProjectAccess(userId, projectId, "editor");

      const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const { metadata } = getKanbanBlock(yBlocks, blockId);

      // Verify target column exists
      const targetColumn = metadata.columns.find(
        (col) => col.id === targetColumnId,
      );
      if (!targetColumn) {
        throw new NotFoundError(
          `Column '${targetColumnId}' not found in kanban block`,
        );
      }

      // Find and remove the task from its source column
      let foundTask: KanbanTask | undefined;
      const columnsAfterRemoval = metadata.columns.map((col) => {
        const taskIndex = col.tasks.findIndex((t) => t.id === taskId);
        if (taskIndex !== -1) {
          foundTask = col.tasks[taskIndex];
          return {
            ...col,
            tasks: [
              ...col.tasks.slice(0, taskIndex),
              ...col.tasks.slice(taskIndex + 1),
            ],
          };
        }
        return col;
      });

      if (!foundTask) {
        throw new NotFoundError(`Task '${taskId}' not found in kanban block`);
      }

      // Insert task into target column at the specified position
      const updatedColumns = columnsAfterRemoval.map((col) => {
        if (col.id !== targetColumnId) return col;

        const tasks = [...col.tasks];
        const insertAt =
          position !== undefined
            ? Math.min(position, tasks.length)
            : tasks.length;
        tasks.splice(insertAt, 0, foundTask!);

        return { ...col, tasks };
      });

      // Persist changes — deep clone the block to ensure all properties are preserved
      const block = JSON.parse(JSON.stringify(yBlocks.get(blockId)!));
      block.data.metadata = JSON.stringify({
        ...metadata,
        columns: updatedColumns,
      });
      yBlocks.set(blockId, block);

      await persistIfNeeded(projectId, ydoc, isLive, ldb);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true }, null, 2),
          },
        ],
      };
    },
  );

  // ── update_kanban_task ─────────────────────────────────────────────────────

  server.tool(
    "update_kanban_task",
    "Update a task's properties (title, description, checked, assignees, fields). Requires editor+ access.",
    {
      projectId: z.string().describe("The project containing the kanban block"),
      blockId: z.string().describe("The kanban block identifier"),
      taskId: z.string().describe("The task to update"),
      title: z
        .string()
        .min(1)
        .max(500)
        .optional()
        .describe("New task title (1-500 characters)"),
      description: z
        .string()
        .max(5000)
        .optional()
        .describe("New task description (max 5000 characters)"),
      checked: z.boolean().optional().describe("New checked state"),
      assigneeIds: z
        .array(z.string())
        .optional()
        .describe("New list of assignee user IDs"),
      fields: z
        .record(z.string(), z.string().nullable())
        .optional()
        .describe(
          "Field values to merge. String values are set, null values remove the key.",
        ),
    },
    async ({
      projectId,
      blockId,
      taskId,
      title,
      description,
      checked,
      assigneeIds,
      fields,
    }) => {
      const { userId } = getMcpContext();

      // Editor+ access required for writes
      await checkProjectAccess(userId, projectId, "editor");

      const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const { metadata } = getKanbanBlock(yBlocks, blockId);

      // Locate the task across all columns
      const found = findTaskAcrossColumns(metadata, taskId);
      if (!found) {
        throw new NotFoundError(`Task '${taskId}' not found in kanban block`);
      }

      const { task } = found;

      // Apply provided fields
      if (title !== undefined) {
        task.text = title;
      }
      if (description !== undefined) {
        task.description = description;
      }
      if (checked !== undefined) {
        task.checked = checked;
      }
      if (assigneeIds !== undefined) {
        task.assigneeIds = assigneeIds;
      }

      // Merge fields: string values are set, null values remove the key
      if (fields !== undefined) {
        if (!task.fields) {
          task.fields = {};
        }
        for (const [key, value] of Object.entries(fields)) {
          if (value === null) {
            delete task.fields[key];
          } else {
            task.fields[key] = value;
          }
        }
      }

      // Persist changes
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
            text: JSON.stringify({ taskId }, null, 2),
          },
        ],
      };
    },
  );

  // ── delete_kanban_task ─────────────────────────────────────────────────────

  server.tool(
    "delete_kanban_task",
    "Delete a task from a kanban block. Removes the task and cascades deletion to any linked task references. Requires editor+ access.",
    {
      projectId: z.string().describe("The project containing the kanban block"),
      blockId: z.string().describe("The kanban block identifier"),
      taskId: z.string().describe("The task to delete"),
    },
    async ({ projectId, blockId, taskId }) => {
      const { userId } = getMcpContext();

      // Editor+ access required for writes
      await checkProjectAccess(userId, projectId, "editor");

      const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const { metadata } = getKanbanBlock(yBlocks, blockId);

      // Locate the task across all columns
      const result = findTaskAcrossColumns(metadata, taskId);
      if (!result) {
        throw new NotFoundError(`Task '${taskId}' not found in kanban block`);
      }

      // Remove task from its column's tasks array
      metadata.columns[result.columnIndex].tasks.splice(result.taskIndex, 1);

      // Cascade: remove all linkedTasks entries referencing the deleted task
      for (const col of metadata.columns) {
        for (const task of col.tasks) {
          if (task.linkedTasks) {
            task.linkedTasks = task.linkedTasks.filter(
              (link) => !(link.taskId === taskId && link.blockId === blockId),
            );
          }
        }
      }

      // Persist changes
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
              { deletedTaskId: taskId, columnId: result.column.id },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── manage_kanban_columns ──────────────────────────────────────────────────

  server.tool(
    "manage_kanban_columns",
    "Create, rename, delete, or reorder columns in a kanban block. Requires editor+ access.",
    {
      projectId: z.string().describe("The project containing the kanban block"),
      blockId: z.string().describe("The kanban block identifier"),
      action: z
        .enum(["create", "rename", "delete", "reorder"])
        .describe("The column management action to perform"),
      title: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe("Column title (required for create, rename)"),
      columnId: z
        .string()
        .optional()
        .describe("Target column ID (required for rename, delete)"),
      color: z
        .string()
        .optional()
        .describe("Optional color for column (create only)"),
      description: z
        .string()
        .max(1000)
        .optional()
        .describe("Optional description for column (create only)"),
      workflowState: z
        .enum(["todo", "in-progress", "done"])
        .optional()
        .describe("Optional workflow state for column (create only)"),
      columnIds: z
        .array(z.string())
        .optional()
        .describe("Ordered array of all column IDs (required for reorder)"),
    },
    async ({
      projectId,
      blockId,
      action,
      title,
      columnId,
      color,
      description,
      workflowState,
      columnIds,
    }) => {
      const { userId } = getMcpContext();

      // Editor+ access required for writes
      await checkProjectAccess(userId, projectId, "editor");

      const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const { metadata } = getKanbanBlock(yBlocks, blockId);

      switch (action) {
        case "create": {
          if (!title) {
            throw new ValidationError("title is required for create action");
          }
          const newColumnId = `c-${Math.random().toString(36).slice(2, 9)}`;
          const newColumn: KanbanColumn = {
            id: newColumnId,
            title,
            tasks: [],
            ...(color ? { color } : {}),
            ...(description ? { description } : {}),
            ...(workflowState ? { workflowState } : {}),
          };
          metadata.columns.push(newColumn);

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
                text: JSON.stringify({ columnId: newColumnId }, null, 2),
              },
            ],
          };
        }

        case "rename": {
          if (!columnId) {
            throw new ValidationError("columnId is required for rename action");
          }
          if (!title) {
            throw new ValidationError("title is required for rename action");
          }
          const col = metadata.columns.find((c) => c.id === columnId);
          if (!col) {
            throw new NotFoundError(
              `Column '${columnId}' not found in kanban block`,
            );
          }
          col.title = title;

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
                text: JSON.stringify({ success: true }, null, 2),
              },
            ],
          };
        }

        case "delete": {
          if (!columnId) {
            throw new ValidationError("columnId is required for delete action");
          }
          const colIndex = metadata.columns.findIndex((c) => c.id === columnId);
          if (colIndex === -1) {
            throw new NotFoundError(
              `Column '${columnId}' not found in kanban block`,
            );
          }
          const targetCol = metadata.columns[colIndex];
          if (targetCol.tasks.length > 0) {
            throw new ValidationError(
              `Column '${columnId}' must be empty before deletion`,
            );
          }
          metadata.columns.splice(colIndex, 1);

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
                text: JSON.stringify({ success: true }, null, 2),
              },
            ],
          };
        }

        case "reorder": {
          if (!columnIds) {
            throw new ValidationError(
              "columnIds is required for reorder action",
            );
          }
          const existingIds = metadata.columns.map((c) => c.id);
          const sortedExisting = [...existingIds].sort();
          const sortedProvided = [...columnIds].sort();
          if (
            sortedExisting.length !== sortedProvided.length ||
            sortedExisting.some((id, i) => id !== sortedProvided[i])
          ) {
            throw new ValidationError(
              "columnIds must contain all existing column IDs",
            );
          }

          // Build a map for O(1) lookup and reorder
          const columnMap = new Map(metadata.columns.map((c) => [c.id, c]));
          metadata.columns = columnIds.map((id) => columnMap.get(id)!);

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
                text: JSON.stringify({ success: true }, null, 2),
              },
            ],
          };
        }
      }
    },
  );

  // ── manage_kanban_fields ───────────────────────────────────────────────────

  server.tool(
    "manage_kanban_fields",
    "Create, update, or delete custom fields at the board level. Fields allow tasks to be annotated with structured metadata. Requires editor+ access.",
    {
      projectId: z.string().describe("The project containing the kanban block"),
      blockId: z.string().describe("The kanban block identifier"),
      action: z
        .enum(["create", "update", "delete"])
        .describe("The action to perform"),
      name: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe("Field name (required for create, optional for update)"),
      fieldId: z
        .string()
        .optional()
        .describe("Field ID (required for update and delete)"),
      type: z
        .enum(["text", "date", "select", "number"])
        .optional()
        .describe("Field type (required for create, optional for update)"),
      options: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            color: z.string().optional(),
          }),
        )
        .optional()
        .describe("Options array for select-type fields"),
    },
    async ({ projectId, blockId, action, name, fieldId, type, options }) => {
      const { userId } = getMcpContext();

      // Editor+ access required for writes
      await checkProjectAccess(userId, projectId, "editor");

      const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const { metadata } = getKanbanBlock(yBlocks, blockId);

      // Initialize fields array if not present
      if (!metadata.fields) {
        metadata.fields = [];
      }

      switch (action) {
        case "create": {
          if (!name) {
            throw new ValidationError(
              "Field name is required for create action",
            );
          }
          if (!type) {
            throw new ValidationError(
              "Field type is required for create action",
            );
          }

          const newFieldId = `f-${Math.random().toString(36).slice(2, 9)}`;
          const newField: KanbanField = {
            id: newFieldId,
            name,
            type,
            ...(options ? { options } : {}),
          };

          metadata.fields.push(newField);
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
                text: JSON.stringify({ fieldId: newFieldId }, null, 2),
              },
            ],
          };
        }

        case "update": {
          if (!fieldId) {
            throw new ValidationError("Field ID is required for update action");
          }

          const field = metadata.fields.find((f) => f.id === fieldId);
          if (!field) {
            throw new NotFoundError(
              `Field '${fieldId}' not found in kanban block`,
            );
          }

          if (name !== undefined) {
            field.name = name;
          }
          if (type !== undefined) {
            field.type = type;
          }
          if (options !== undefined) {
            field.options = options;
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
                text: JSON.stringify({ success: true }, null, 2),
              },
            ],
          };
        }

        case "delete": {
          if (!fieldId) {
            throw new ValidationError("Field ID is required for delete action");
          }

          const fieldIndex = metadata.fields.findIndex((f) => f.id === fieldId);
          if (fieldIndex === -1) {
            throw new NotFoundError(
              `Field '${fieldId}' not found in kanban block`,
            );
          }

          // Remove the field definition
          metadata.fields.splice(fieldIndex, 1);

          // Cascade: remove the field key from all tasks' fields records
          for (const col of metadata.columns) {
            for (const task of col.tasks) {
              if (task.fields && fieldId in task.fields) {
                delete task.fields[fieldId];
              }
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
                text: JSON.stringify({ success: true }, null, 2),
              },
            ],
          };
        }
      }
    },
  );

  // ── link_kanban_tasks ──────────────────────────────────────────────────────

  server.tool(
    "link_kanban_tasks",
    "Create or delete relations between kanban tasks. Supports 'blocked-by', 'blocks', and 'relates-to' relation types with automatic reciprocal linking for same-block tasks. Requires editor+ access.",
    {
      projectId: z.string().describe("The project containing the kanban block"),
      blockId: z.string().describe("The kanban block identifier"),
      action: z.enum(["create", "delete"]).describe("Action to perform"),
      sourceTaskId: z.string().describe("The source task ID"),
      targetBlockId: z.string().describe("The block ID of the target task"),
      targetTaskId: z.string().describe("The target task ID"),
      relationType: z
        .enum(["blocked-by", "blocks", "relates-to"])
        .optional()
        .describe(
          "Relation type (required for create): 'blocked-by', 'blocks', or 'relates-to'",
        ),
    },
    async ({
      projectId,
      blockId,
      action,
      sourceTaskId,
      targetBlockId,
      targetTaskId,
      relationType,
    }) => {
      const { userId } = getMcpContext();

      // Editor+ access required for writes
      await checkProjectAccess(userId, projectId, "editor");

      const { ydoc, isLive } = await getProjectDoc(projectId, ldb);
      const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");
      const { metadata } = getKanbanBlock(yBlocks, blockId);

      if (action === "create") {
        // Validate relationType is provided for create
        if (!relationType) {
          throw new ValidationError(
            "relationType is required for create action",
          );
        }

        // Find source task
        const sourceResult = findTaskAcrossColumns(metadata, sourceTaskId);
        if (!sourceResult) {
          throw new NotFoundError(
            `Task '${sourceTaskId}' not found in kanban block`,
          );
        }

        const { task: sourceTask } = sourceResult;

        // Initialize linkedTasks array if not present
        if (!sourceTask.linkedTasks) {
          sourceTask.linkedTasks = [];
        }

        // Check for duplicate link
        const duplicate = sourceTask.linkedTasks.find(
          (link) =>
            link.taskId === targetTaskId && link.blockId === targetBlockId,
        );
        if (duplicate) {
          throw new ValidationError(
            "Link already exists between source and target tasks",
          );
        }

        // Add link to source task
        sourceTask.linkedTasks.push({
          taskId: targetTaskId,
          blockId: targetBlockId,
          relationType,
        });

        // If same block, add reciprocal reference to target task
        if (targetBlockId === blockId) {
          const targetResult = findTaskAcrossColumns(metadata, targetTaskId);
          if (!targetResult) {
            throw new NotFoundError(
              `Task '${targetTaskId}' not found in kanban block`,
            );
          }

          const { task: targetTask } = targetResult;

          if (!targetTask.linkedTasks) {
            targetTask.linkedTasks = [];
          }

          targetTask.linkedTasks.push({
            taskId: sourceTaskId,
            blockId: blockId,
            relationType: getReciprocalRelation(relationType),
          });
        }

        // Persist changes
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
              text: JSON.stringify({ success: true }, null, 2),
            },
          ],
        };
      } else {
        // action === "delete"

        // Find source task
        const sourceResult = findTaskAcrossColumns(metadata, sourceTaskId);
        if (!sourceResult) {
          throw new NotFoundError(
            `Task '${sourceTaskId}' not found in kanban block`,
          );
        }

        const { task: sourceTask } = sourceResult;

        // Remove matching entry from source task's linkedTasks
        if (sourceTask.linkedTasks) {
          sourceTask.linkedTasks = sourceTask.linkedTasks.filter(
            (link) =>
              !(link.taskId === targetTaskId && link.blockId === targetBlockId),
          );
        }

        // If same block, remove reciprocal reference from target task
        if (targetBlockId === blockId) {
          const targetResult = findTaskAcrossColumns(metadata, targetTaskId);
          if (targetResult) {
            const { task: targetTask } = targetResult;
            if (targetTask.linkedTasks) {
              targetTask.linkedTasks = targetTask.linkedTasks.filter(
                (link) =>
                  !(link.taskId === sourceTaskId && link.blockId === blockId),
              );
            }
          }
        }

        // Persist changes
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
              text: JSON.stringify({ success: true }, null, 2),
            },
          ],
        };
      }
    },
  );
}
