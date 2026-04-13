import type { Node } from "@xyflow/react";

import type { BlockData } from "./CanvasBlock";

export type FieldType = "text" | "date" | "select" | "number";
export type TaskRelationType = "related" | "blocked-by";
export type WorkflowState = "todo" | "in-progress" | "done";

export type Option = {
  id: string;
  label: string;
  color?: string;
  description?: string;
};

export type Field = {
  id: string;
  name: string;
  type: FieldType;
  color?: string;
  visible?: boolean;
  defaultValue?: string | undefined;
  options?: Option[];
};

export type LinkedTaskReference = {
  blockId: string;
  taskId: string;
  taskNumber?: number;
  title?: string;
  blockTitle?: string;
  relationType?: TaskRelationType;
};

export type Task = {
  id: string;
  text: string;
  checked: boolean;
  height?: number;
  assigneeId?: string;
  assigneeIds?: string[];
  assigneeName?: string;
  fields?: Record<string, string | undefined>;
  taskNumber?: number;
  linkedTasks?: LinkedTaskReference[];
};

export type Column = {
  id: string;
  title: string;
  tasks: Task[];
  width?: number;
  widthPx?: number;
  color?: string;
  description?: string;
  workflowState?: WorkflowState;
};

export type ParsedKanbanMetadata = {
  columns: Column[];
  fields: Field[];
};

export type KanbanTaskRecord = {
  blockId: string;
  blockTitle: string;
  columnId: string;
  columnTitle: string;
  isDone: boolean;
  taskId: string;
  taskNumber?: number;
  title: string;
  linkedTasks: LinkedTaskReference[];
};

export type TaskDependencyState = {
  status: "blocked" | "ready" | "blocking" | "related" | "clear";
  blockers: KanbanTaskRecord[];
  activeBlockers: KanbanTaskRecord[];
  resolvedBlockers: KanbanTaskRecord[];
  relatedTasks: KanbanTaskRecord[];
  blockingTasks: KanbanTaskRecord[];
};

const createId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const normalizeRelationType = (
  value: unknown,
): TaskRelationType | undefined => {
  if (value === "blocked-by" || value === "related") {
    return value;
  }
  return undefined;
};

const normalizeWorkflowState = (value: unknown): WorkflowState | undefined => {
  if (value === "todo" || value === "in-progress" || value === "done") {
    return value;
  }
  return undefined;
};

export const getTaskTitle = (text: string | null | undefined): string => {
  if (typeof text !== "string") return "";
  const [title = ""] = text.split("\n");
  return title.trim();
};

export const formatTaskNumber = (taskNumber?: number): string =>
  isPositiveInteger(taskNumber) ? `#${taskNumber}` : "";

export const assignDefaultColumnWorkflowStates = (
  columns: Column[],
): { columns: Column[]; changed: boolean } => {
  if (columns.length === 0 || columns.some((column) => column.workflowState)) {
    return { columns, changed: false };
  }

  let changed = false;
  const nextColumns = columns.map((column, index) => {
    let workflowState: WorkflowState | undefined;

    if (columns.length === 1) {
      workflowState = "todo";
    } else if (index === 0) {
      workflowState = "todo";
    } else if (index === columns.length - 1) {
      workflowState = "done";
    } else if (index === 1) {
      workflowState = "in-progress";
    }

    if (!workflowState) return column;
    changed = true;
    return { ...column, workflowState } satisfies Column;
  });

  return { columns: nextColumns, changed };
};

export const buildTaskLinkKey = (blockId: string, taskId: string): string =>
  `${blockId}::${taskId}`;

const normalizeLinkedTaskReference = (
  raw: unknown,
): LinkedTaskReference | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.blockId !== "string" || typeof value.taskId !== "string") {
    return null;
  }

  return {
    blockId: value.blockId,
    taskId: value.taskId,
    taskNumber: isPositiveInteger(value.taskNumber)
      ? value.taskNumber
      : undefined,
    title: typeof value.title === "string" ? value.title : undefined,
    blockTitle:
      typeof value.blockTitle === "string" ? value.blockTitle : undefined,
    relationType: normalizeRelationType(value.relationType),
  };
};

const normalizeLinkedTaskReferences = (
  raw: unknown,
): LinkedTaskReference[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const entries = raw
    .map((entry) => normalizeLinkedTaskReference(entry))
    .filter((entry): entry is LinkedTaskReference => entry !== null);
  return entries.length > 0 ? entries : undefined;
};

export const parseKanbanMetadata = (raw: unknown): ParsedKanbanMetadata => {
  try {
    const parsed = (
      typeof raw === "string" ? JSON.parse(raw || "{}") : raw
    ) as Record<string, unknown>;

    const columnsRaw = Array.isArray(parsed.columns)
      ? (parsed.columns as unknown[])
      : [];
    const columns = columnsRaw
      .map((column): Column | null => {
        if (typeof column !== "object" || column === null) return null;
        const value = column as Record<string, unknown>;
        const tasksRaw = Array.isArray(value.tasks)
          ? (value.tasks as unknown[])
          : [];

        const tasks = tasksRaw
          .map((task): Task | null => {
            if (typeof task !== "object" || task === null) return null;
            const entry = task as Record<string, unknown>;
            if (typeof entry.id !== "string") return null;

            const assigneeIds = Array.isArray(entry.assigneeIds)
              ? (entry.assigneeIds as unknown[]).filter(
                  (item): item is string => typeof item === "string",
                )
              : typeof entry.assigneeId === "string"
                ? [entry.assigneeId]
                : undefined;

            const rawFields = entry.fields;
            const fields =
              typeof rawFields === "object" && rawFields !== null
                ? Object.fromEntries(
                    Object.entries(rawFields as Record<string, unknown>)
                      .filter(
                        ([, fieldValue]) =>
                          fieldValue === undefined ||
                          typeof fieldValue === "string",
                      )
                      .map(([key, fieldValue]) => [
                        key,
                        fieldValue === undefined
                          ? undefined
                          : String(fieldValue),
                      ]),
                  )
                : undefined;

            return {
              id: entry.id,
              text: typeof entry.text === "string" ? entry.text : "",
              checked: Boolean(entry.checked),
              height: isPositiveInteger(entry.height)
                ? Math.max(64, Math.round(entry.height))
                : undefined,
              assigneeIds,
              assigneeId:
                typeof entry.assigneeId === "string"
                  ? entry.assigneeId
                  : undefined,
              assigneeName:
                typeof entry.assigneeName === "string"
                  ? entry.assigneeName
                  : undefined,
              fields: fields as Record<string, string | undefined> | undefined,
              taskNumber: isPositiveInteger(entry.taskNumber)
                ? entry.taskNumber
                : undefined,
              linkedTasks: normalizeLinkedTaskReferences(entry.linkedTasks),
            } satisfies Task;
          })
          .filter((task): task is Task => task !== null);

        return {
          id: typeof value.id === "string" ? value.id : createId("c"),
          title: typeof value.title === "string" ? value.title : "",
          tasks,
          width:
            typeof value.width === "number" && Number.isFinite(value.width)
              ? value.width
              : undefined,
          widthPx:
            typeof value.widthPx === "number" && Number.isFinite(value.widthPx)
              ? value.widthPx
              : undefined,
          color: typeof value.color === "string" ? value.color : undefined,
          description:
            typeof value.description === "string"
              ? value.description
              : undefined,
          workflowState: normalizeWorkflowState(value.workflowState),
        } satisfies Column;
      })
      .filter((column): column is Column => column !== null);

    const fieldsRaw = Array.isArray(parsed.fields)
      ? (parsed.fields as unknown[])
      : [];
    const fields = fieldsRaw
      .map((field): Field | null => {
        if (typeof field !== "object" || field === null) return null;
        const value = field as Record<string, unknown>;
        if (typeof value.id !== "string") return null;

        let options: Option[] | undefined;
        if (Array.isArray(value.options)) {
          options = value.options
            .map((option): Option | null => {
              if (typeof option === "string") {
                const [label, color] = option.split("|");
                return {
                  id: createId("o"),
                  label: label || option,
                  color: color || undefined,
                } satisfies Option;
              }

              if (typeof option !== "object" || option === null) return null;
              const item = option as Record<string, unknown>;
              return {
                id: typeof item.id === "string" ? item.id : createId("o"),
                label: typeof item.label === "string" ? item.label : "",
                color: typeof item.color === "string" ? item.color : undefined,
                description:
                  typeof item.description === "string"
                    ? item.description
                    : undefined,
              } satisfies Option;
            })
            .filter((option): option is Option => option !== null);
        }

        return {
          id: value.id,
          name: typeof value.name === "string" ? value.name : "",
          type:
            value.type === "date" ||
            value.type === "select" ||
            value.type === "number"
              ? value.type
              : "text",
          options,
          color: typeof value.color === "string" ? value.color : undefined,
          visible: typeof value.visible === "boolean" ? value.visible : true,
          defaultValue:
            typeof value.defaultValue === "string"
              ? value.defaultValue
              : undefined,
        } satisfies Field;
      })
      .filter((field): field is Field => field !== null);

    return { columns, fields };
  } catch {
    return { columns: [], fields: [] };
  }
};

export const getMaxTaskNumber = (columns: Column[]): number =>
  columns.reduce((max, column) => {
    for (const task of column.tasks) {
      if (isPositiveInteger(task.taskNumber)) {
        max = Math.max(max, task.taskNumber);
      }
    }
    return max;
  }, 0);

export const assignMissingTaskNumbers = (
  columns: Column[],
  startingFrom: number,
  options?: { reservedTaskNumbers?: Set<number> },
): { columns: Column[]; changed: boolean; nextTaskNumber: number } => {
  let changed = false;
  const occupiedTaskNumbers = new Set(options?.reservedTaskNumbers ?? []);

  let maxOccupied = 0;
  for (const n of occupiedTaskNumbers) {
    if (n > maxOccupied) maxOccupied = n;
  }

  let nextTaskNumber = Math.max(
    1,
    startingFrom,
    maxOccupied > 0 ? maxOccupied + 1 : 0,
  );

  const normalizedColumns = columns.map((column) => ({
    ...column,
    tasks: column.tasks.map((task) => {
      const currentTaskNumber = task.taskNumber;

      if (
        isPositiveInteger(currentTaskNumber) &&
        !occupiedTaskNumbers.has(currentTaskNumber)
      ) {
        occupiedTaskNumbers.add(currentTaskNumber);
        nextTaskNumber = Math.max(nextTaskNumber, currentTaskNumber + 1);
        return task;
      }

      changed = true;
      while (occupiedTaskNumbers.has(nextTaskNumber)) {
        nextTaskNumber += 1;
      }

      const updatedTask = {
        ...task,
        taskNumber: nextTaskNumber,
      } satisfies Task;

      occupiedTaskNumbers.add(nextTaskNumber);
      nextTaskNumber += 1;
      return updatedTask;
    }),
  }));

  return { columns: normalizedColumns, changed, nextTaskNumber };
};

export const cloneKanbanMetadataForDuplicate = ({
  raw,
  sourceBlockId,
  targetBlockId,
}: {
  raw: unknown;
  sourceBlockId: string;
  targetBlockId: string;
}): string | undefined => {
  if (
    raw === undefined ||
    raw === null ||
    (typeof raw === "string" && raw.trim() === "")
  ) {
    return undefined;
  }

  const parsed = parseKanbanMetadata(raw);
  if (parsed.columns.length === 0) {
    return undefined;
  }

  const taskIdMap = new Map<string, string>();

  const columns = parsed.columns.map((column) => ({
    ...column,
    id: createId("c"),
    tasks: column.tasks.map((task) => {
      const nextTaskId = createId("t");
      taskIdMap.set(task.id, nextTaskId);
      return {
        ...task,
        id: nextTaskId,
        taskNumber: undefined,
        linkedTasks: task.linkedTasks?.map((link) => ({ ...link })),
      } satisfies Task;
    }),
  }));

  const clonedColumns = columns.map((column) => ({
    ...column,
    tasks: column.tasks.map((task) => ({
      ...task,
      linkedTasks: task.linkedTasks?.map((link) => {
        const mappedTaskId = taskIdMap.get(link.taskId);
        if (link.blockId === sourceBlockId && mappedTaskId) {
          return {
            ...link,
            blockId: targetBlockId,
            taskId: mappedTaskId,
            taskNumber: undefined,
          } satisfies LinkedTaskReference;
        }
        return { ...link } satisfies LinkedTaskReference;
      }),
    })),
  }));

  return JSON.stringify({ columns: clonedColumns, fields: parsed.fields });
};

export const ensureUniqueKanbanTaskIds = (
  columns: Column[],
  {
    currentBlockId,
    reservedTaskIds,
  }: {
    currentBlockId: string;
    reservedTaskIds?: Set<string>;
  },
): { columns: Column[]; changed: boolean } => {
  const occupiedTaskIds = new Set(reservedTaskIds ?? []);
  const localTaskIds = new Set<string>();
  const canonicalTaskIds = new Map<string, string>();
  let changed = false;

  const normalizedColumns = columns.map((column) => ({
    ...column,
    tasks: column.tasks.map((task) => {
      const originalTaskId = task.id;
      let nextTaskId = originalTaskId;

      if (
        !originalTaskId ||
        occupiedTaskIds.has(originalTaskId) ||
        localTaskIds.has(originalTaskId)
      ) {
        changed = true;
        nextTaskId = createId("t");
        while (
          occupiedTaskIds.has(nextTaskId) ||
          localTaskIds.has(nextTaskId)
        ) {
          nextTaskId = createId("t");
        }
      }

      if (!canonicalTaskIds.has(originalTaskId)) {
        canonicalTaskIds.set(originalTaskId, nextTaskId);
      }

      occupiedTaskIds.add(nextTaskId);
      localTaskIds.add(nextTaskId);

      if (nextTaskId === originalTaskId) {
        return task;
      }

      return {
        ...task,
        id: nextTaskId,
      } satisfies Task;
    }),
  }));

  if (!changed) {
    return { columns, changed: false };
  }

  return {
    columns: normalizedColumns.map((column) => ({
      ...column,
      tasks: column.tasks.map((task) => ({
        ...task,
        linkedTasks: task.linkedTasks?.map((link) => {
          if (link.blockId !== currentBlockId) {
            return link;
          }

          const canonicalTaskId = canonicalTaskIds.get(link.taskId);
          if (!canonicalTaskId || canonicalTaskId === link.taskId) {
            return link;
          }

          return {
            ...link,
            taskId: canonicalTaskId,
          } satisfies LinkedTaskReference;
        }),
      })),
    })),
    changed: true,
  };
};

export const buildProjectTaskRecords = ({
  nodes,
  currentBlockId,
  currentBlockTitle,
  currentColumns,
}: {
  nodes: Array<Node<BlockData>>;
  currentBlockId: string;
  currentBlockTitle: string;
  currentColumns: Column[];
}): KanbanTaskRecord[] => {
  const records: KanbanTaskRecord[] = [];

  const addColumns = (
    blockId: string,
    blockTitle: string,
    columns: Column[],
  ) => {
    const normalizedColumns =
      assignDefaultColumnWorkflowStates(columns).columns;

    for (const column of normalizedColumns) {
      for (const task of column.tasks) {
        records.push({
          blockId,
          blockTitle,
          columnId: column.id,
          columnTitle: column.title,
          isDone: Boolean(task.checked) || column.workflowState === "done",
          taskId: task.id,
          taskNumber: isPositiveInteger(task.taskNumber)
            ? task.taskNumber
            : undefined,
          title: getTaskTitle(task.text),
          linkedTasks: task.linkedTasks ? [...task.linkedTasks] : [],
        });
      }
    }
  };

  for (const node of nodes) {
    if (!node.data || node.data.blockType !== "kanban") continue;
    if (node.id === currentBlockId) continue;

    const parsed = parseKanbanMetadata(node.data.metadata);
    addColumns(node.id, node.data.title || "", parsed.columns);
  }

  addColumns(currentBlockId, currentBlockTitle, currentColumns);

  return records.sort((left, right) => {
    const leftNumber = isPositiveInteger(left.taskNumber)
      ? left.taskNumber
      : Number.MAX_SAFE_INTEGER;
    const rightNumber = isPositiveInteger(right.taskNumber)
      ? right.taskNumber
      : Number.MAX_SAFE_INTEGER;

    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    return left.title.localeCompare(right.title);
  });
};

export const getNextTaskNumberFromRecords = (
  records: KanbanTaskRecord[],
): number => {
  const max = records.reduce(
    (value, record) =>
      isPositiveInteger(record.taskNumber)
        ? Math.max(value, record.taskNumber)
        : value,
    0,
  );
  return max + 1;
};

export const syncLinkedTaskReferences = (
  columns: Column[],
  records: KanbanTaskRecord[],
): { columns: Column[]; changed: boolean } => {
  const recordMap = new Map<string, KanbanTaskRecord>(
    records.map((record) => [
      buildTaskLinkKey(record.blockId, record.taskId),
      record,
    ]),
  );

  let changed = false;

  const nextColumns = columns.map((column) => ({
    ...column,
    tasks: column.tasks.map((task) => {
      const existingLinks = task.linkedTasks ?? [];
      if (existingLinks.length === 0) return task;

      const seen = new Set<string>();
      const linkedTasks: LinkedTaskReference[] = [];

      for (const link of existingLinks) {
        const normalizedLink = normalizeLinkedTaskReference(link);
        if (!normalizedLink) {
          changed = true;
          continue;
        }

        const key = buildTaskLinkKey(
          normalizedLink.blockId,
          normalizedLink.taskId,
        );
        if (seen.has(key)) {
          changed = true;
          continue;
        }

        const record = recordMap.get(key);
        if (!record) {
          changed = true;
          continue;
        }

        seen.add(key);
        const syncedLink: LinkedTaskReference = {
          blockId: normalizedLink.blockId,
          taskId: normalizedLink.taskId,
          taskNumber: record.taskNumber,
          title: record.title || normalizedLink.title,
          blockTitle: record.blockTitle || normalizedLink.blockTitle,
          relationType: normalizedLink.relationType,
        };

        if (
          syncedLink.taskNumber !== normalizedLink.taskNumber ||
          syncedLink.title !== normalizedLink.title ||
          syncedLink.blockTitle !== normalizedLink.blockTitle ||
          syncedLink.relationType !== normalizedLink.relationType
        ) {
          changed = true;
        }

        linkedTasks.push(syncedLink);
      }

      if (linkedTasks.length === 0) {
        changed = true;
        return { ...task, linkedTasks: undefined } satisfies Task;
      }

      if (linkedTasks.length !== existingLinks.length) {
        changed = true;
      }

      return { ...task, linkedTasks } satisfies Task;
    }),
  }));

  return { columns: nextColumns, changed };
};

export const getTaskDependencyState = (
  task: Task,
  records: KanbanTaskRecord[],
  backlinks: KanbanTaskRecord[] = [],
  currentBlockId?: string,
): TaskDependencyState => {
  const recordMap = new Map<string, KanbanTaskRecord>(
    records.map((record) => [
      buildTaskLinkKey(record.blockId, record.taskId),
      record,
    ]),
  );

  const blockers: KanbanTaskRecord[] = [];
  const relatedTasks: KanbanTaskRecord[] = [];

  for (const link of task.linkedTasks ?? []) {
    const record = recordMap.get(buildTaskLinkKey(link.blockId, link.taskId));
    if (!record) continue;

    if (link.relationType === "blocked-by") {
      blockers.push(record);
    } else {
      relatedTasks.push(record);
    }
  }

  const activeBlockers = blockers.filter((record) => !record.isDone);
  const resolvedBlockers = blockers.filter((record) => record.isDone);
  const currentTaskKey = currentBlockId
    ? buildTaskLinkKey(currentBlockId, task.id)
    : null;
  const blockingTasks = backlinks.filter((record) =>
    record.linkedTasks.some(
      (link) =>
        link.relationType === "blocked-by" &&
        (currentTaskKey === null ||
          buildTaskLinkKey(link.blockId, link.taskId) === currentTaskKey),
    ),
  );

  let status: TaskDependencyState["status"] = "clear";
  if (activeBlockers.length > 0) {
    status = "blocked";
  } else if (resolvedBlockers.length > 0) {
    status = "ready";
  } else if (blockingTasks.length > 0) {
    status = "blocking";
  } else if (relatedTasks.length > 0) {
    status = "related";
  }

  return {
    status,
    blockers,
    activeBlockers,
    resolvedBlockers,
    relatedTasks,
    blockingTasks,
  };
};
