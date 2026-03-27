"use client";

import {
  Fragment,
  memo,
  useEffect,
  useState,
  useRef,
  useLayoutEffect,
  useCallback,
} from "react";
import { Check, GripVertical, Kanban, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { BlockFooter } from "./BlockFooter";
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import { BlockData } from "./CanvasBlock";
import "./kanban-block.css";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import { focusProjectCanvas } from "./utils/focusCanvas";

interface Task {
  id: string;
  text: string;
  checked: boolean;
}

interface Column {
  id: string;
  title: string;
  tasks: Task[];
}

interface KanbanMetadata {
  columns: Column[];
}

interface TransferTaskPayload {
  kind: "kanban-task" | "checklist-item";
  sourceBlockId: string;
  sourceColumnId?: string;
  itemId: string;
  text: string;
  checked: boolean;
  depth?: number;
}

interface TransferColumnPayload {
  kind: "kanban-column";
  sourceBlockId: string;
  columnId: string;
  column: Column;
}

type KanbanBlockProps = NodeProps<Node<BlockData>>;

const AutoResizeTextarea = ({
  value,
  onChange,
  className,
  placeholder,
  readOnly,
  onKeyDown,
  onFocus,
  autoFocus,
  onBlur,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onFocus?: () => void;
  autoFocus?: boolean;
  onBlur?: () => void;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, []);

  useLayoutEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        adjustHeight();
        onChange(e);
      }}
      className={className}
      placeholder={placeholder}
      readOnly={readOnly}
      rows={1}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      autoFocus={autoFocus}
      style={{ resize: "none", overflow: "hidden" }}
    />
  );
};

const parseKanbanMetadata = (metadata: unknown): KanbanMetadata => {
  try {
    if (typeof metadata !== "string") {
      return { columns: [] };
    }
    const parsed = JSON.parse(metadata) as { columns?: unknown };
    if (!Array.isArray(parsed.columns)) {
      return { columns: [] };
    }
    const columns: Column[] = parsed.columns
      .map((col) => {
        if (typeof col !== "object" || col === null) return null;
        const c = col as {
          id?: unknown;
          title?: unknown;
          tasks?: unknown;
        };
        if (typeof c.id !== "string") return null;
        return {
          id: c.id,
          title: typeof c.title === "string" ? c.title : "Column",
          tasks: Array.isArray(c.tasks)
            ? c.tasks
                .map((task) => {
                  if (typeof task !== "object" || task === null) return null;
                  const t = task as {
                    id?: unknown;
                    text?: unknown;
                    checked?: unknown;
                  };
                  if (typeof t.id !== "string") return null;
                  return {
                    id: t.id,
                    text: typeof t.text === "string" ? t.text : "",
                    checked: Boolean(t.checked),
                  };
                })
                .filter((task): task is Task => task !== null)
            : [],
        };
      })
      .filter((col): col is Column => col !== null);

    return { columns };
  } catch {
    return { columns: [] };
  }
};

const KanbanBlock = memo(({ id, data, selected }: KanbanBlockProps) => {
  const { dict } = useI18n();
  const [columns, setColumns] = useState<Column[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [title, setTitle] = useState(data.title || "");
  const [dropTargetColumn, setDropTargetColumn] = useState<string | null>(null);
  const [dropTargetTaskIndex, setDropTargetTaskIndex] = useState<number | null>(
    null,
  );
  const [dropTargetColumnIndex, setDropTargetColumnIndex] = useState<
    number | null
  >(null);
  const [dragKind, setDragKind] = useState<"task" | "column" | null>(null);
  const [dragTaskPreview, setDragTaskPreview] = useState<{
    text: string;
    checked: boolean;
  } | null>(null);
  const [dragColumnPreviewTitle, setDragColumnPreviewTitle] = useState("");
  const [dragSourceTaskInfo, setDragSourceTaskInfo] = useState<{
    columnId: string;
    index: number;
  } | null>(null);
  const [dragSourceColumnIndex, setDragSourceColumnIndex] = useState<
    number | null
  >(null);

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const isPreviewMode = data.isPreviewMode;
  const isLocked = data.isLocked;

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;
  const isViewer = data.userRole === "viewer";
  const isReadOnly =
    isPreviewMode ||
    isViewer ||
    (isLocked ? !isOwner && !isProjectOwner : false);
  const canReact = !isPreviewMode || isViewer;

  const tr = (path: string, fallback: string): string => {
    const keys = path.split(".");
    let v: unknown = dict;
    for (const k of keys) {
      if (typeof v === "object" && v !== null) {
        v = (v as Record<string, unknown>)[k];
      } else {
        return fallback;
      }
    }
    return typeof v === "string" ? v : fallback;
  };

  const getEditorName = () =>
    currentUser?.displayName ||
    currentUser?.username ||
    dict.project?.anonymous ||
    "unknown";

  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title, title]);

  useEffect(() => {
    const meta = parseKanbanMetadata(data.metadata);
    setColumns(meta.columns);
  }, [data.metadata]);

  const persistBlock = (blockId: string, payload: BlockData) => {
    data.onContentChange?.(
      blockId,
      payload.content,
      new Date().toISOString(),
      getEditorName(),
      payload.metadata,
      payload.title,
      payload.reactions,
    );
  };

  const save = (cols: Column[]) => {
    setColumns(cols);
    data.onContentChange?.(
      id,
      data.content,
      new Date().toISOString(),
      getEditorName(),
      JSON.stringify({ columns: cols }),
      title,
      data.reactions,
    );
  };

  const handleResize = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const { width, height, x, y } = params;
      const onResize = data.onResize;
      onResize?.(id, {
        width: Math.round(width),
        height: Math.round(height),
        x: Math.round(x),
        y: Math.round(y),
      });
    },
    [id, data],
  );

  const handleResizeEnd = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const { width, height, x, y } = params;
      const onResizeEnd = data.onResizeEnd;
      onResizeEnd?.(id, {
        width: Math.round(width),
        height: Math.round(height),
        x: Math.round(x),
        y: Math.round(y),
      });
    },
    [id, data],
  );

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) return;
    const newTitle = e.target.value;
    setTitle(newTitle);
    data.onContentChange?.(
      id,
      data.content,
      new Date().toISOString(),
      getEditorName(),
      data.metadata,
      newTitle,
      data.reactions,
    );
  };

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
    canReact,
  });

  const { getEdges, getNode } = useReactFlow();
  const edges = getEdges();
  const connected = (h: string) =>
    edges.some(
      (e) =>
        (e.source === id && e.sourceHandle === h) ||
        (e.target === id && e.targetHandle === h),
    );

  const createColumn = (): Column => ({
    id: `c-${Math.random().toString(36).slice(2, 9)}`,
    title: tr("kanban.defaultColumnTitle", "Column"),
    tasks: [],
  });

  const removeChecklistItemFromSource = (
    sourceBlockId: string,
    itemId: string,
  ) => {
    const sourceNode = getNode(sourceBlockId);
    if (!sourceNode || !sourceNode.data) return;
    const sourceData = sourceNode.data as BlockData;

    if (sourceData.blockType !== "checklist") return;

    const sourceMeta =
      typeof sourceData.metadata === "string"
        ? JSON.parse(sourceData.metadata || "{}")
        : sourceData.metadata || {};

    const sourceItems = Array.isArray((sourceMeta as { items?: unknown }).items)
      ? (sourceMeta as { items: Array<{ id?: string }> }).items || []
      : [];

    const newSourceItems = sourceItems.filter((i) => i.id !== itemId);

    persistBlock(sourceBlockId, {
      ...sourceData,
      metadata: JSON.stringify({ ...sourceMeta, items: newSourceItems }),
    });
  };

  const removeTaskFromKanbanSource = (
    sourceBlockId: string,
    sourceColumnId: string | undefined,
    itemId: string,
  ) => {
    const sourceNode = getNode(sourceBlockId);
    if (!sourceNode || !sourceNode.data) return;
    const sourceData = sourceNode.data as BlockData;

    if (sourceData.blockType !== "kanban") return;

    const sourceMeta = parseKanbanMetadata(sourceData.metadata);

    const newSourceColumns = sourceMeta.columns.map((col) => {
      if (sourceColumnId && col.id !== sourceColumnId) {
        return col;
      }
      return {
        ...col,
        tasks: col.tasks.filter((task) => task.id !== itemId),
      };
    });

    const cleanedColumns = sourceColumnId
      ? newSourceColumns
      : newSourceColumns.map((col) => ({
          ...col,
          tasks: col.tasks.filter((task) => task.id !== itemId),
        }));

    persistBlock(sourceBlockId, {
      ...sourceData,
      metadata: JSON.stringify({ columns: cleanedColumns }),
    });
  };

  const clearDropTargets = () => {
    setDropTargetColumn(null);
    setDropTargetTaskIndex(null);
    setDropTargetColumnIndex(null);
  };

  const clearDragPreview = () => {
    setDragKind(null);
    setDragTaskPreview(null);
    setDragColumnPreviewTitle("");
    setDragSourceTaskInfo(null);
    setDragSourceColumnIndex(null);
  };

  const syncDragPreviewFromEvent = (
    e: React.DragEvent,
  ): "task" | "column" | null => {
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return dragKind;

    try {
      const parsed = JSON.parse(raw) as {
        kind?: string;
        text?: unknown;
        checked?: unknown;
        column?: { title?: unknown };
      };

      if (parsed.kind === "kanban-column") {
        setDragKind("column");
        setDragColumnPreviewTitle(
          typeof parsed.column?.title === "string"
            ? parsed.column.title
            : tr("kanban.defaultColumnTitle", "Column"),
        );
        setDragTaskPreview(null);
        return "column";
      }

      if (parsed.kind === "kanban-task" || parsed.kind === "checklist-item") {
        setDragKind("task");
        setDragTaskPreview({
          text:
            typeof parsed.text === "string"
              ? parsed.text
              : tr("kanban.addTask", "Task"),
          checked: Boolean(parsed.checked),
        });
        setDragColumnPreviewTitle("");
        return "task";
      }
    } catch {
      return dragKind;
    }

    return dragKind;
  };

  const handleContainerDragEnter = (e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault();
  };

  const handleContainerDragLeave = (e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault();
    const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const hasPointerCoords = e.clientX !== 0 || e.clientY !== 0;
    const isOutsideBounds =
      hasPointerCoords &&
      (e.clientX < bounds.left ||
        e.clientX > bounds.right ||
        e.clientY < bounds.top ||
        e.clientY > bounds.bottom);

    if (isOutsideBounds) {
      clearDropTargets();
    }
  };

  const handleDragEnd = () => {
    clearDropTargets();
    clearDragPreview();
  };

  useEffect(() => {
    const handleGlobalDragReset = () => {
      clearDropTargets();
      clearDragPreview();
    };

    window.addEventListener("drop", handleGlobalDragReset);
    window.addEventListener("dragend", handleGlobalDragReset);

    return () => {
      window.removeEventListener("drop", handleGlobalDragReset);
      window.removeEventListener("dragend", handleGlobalDragReset);
    };
  }, []);

  const handleTaskDragStart = (
    e: React.DragEvent,
    sourceColumnId: string,
    task: Task,
  ) => {
    if (isReadOnly) return;
    const sourceColumn = columns.find((c) => c.id === sourceColumnId);
    const taskIndex =
      sourceColumn?.tasks.findIndex((t) => t.id === task.id) ?? -1;
    const payload: TransferTaskPayload = {
      kind: "kanban-task",
      sourceBlockId: id,
      sourceColumnId,
      itemId: task.id,
      text: task.text,
      checked: task.checked,
    };
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
    setDragKind("task");
    setDragTaskPreview({ text: task.text, checked: task.checked });
    setDragColumnPreviewTitle("");
    setDragSourceTaskInfo(
      taskIndex !== -1 ? { columnId: sourceColumnId, index: taskIndex } : null,
    );

    const dragImage = document.createElement("div");
    dragImage.style.position = "absolute";
    dragImage.style.top = "-9999px";
    dragImage.style.padding = "8px 12px";
    dragImage.style.backgroundColor = "var(--bg-island)";
    dragImage.style.color = "var(--text-main)";
    dragImage.style.border = "1px solid var(--border)";
    dragImage.style.borderRadius = "6px";
    dragImage.style.fontSize = "14px";
    dragImage.style.maxWidth = "280px";
    dragImage.style.opacity = "1";
    dragImage.style.pointerEvents = "none";
    dragImage.textContent = `${task.checked ? "☑" : "☐"} ${task.text}`;
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleTaskDragEnter = (
    e: React.DragEvent,
    columnId: string,
    taskIndex: number,
  ) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const kind = syncDragPreviewFromEvent(e);
    if (kind !== "task") return;
    setDropTargetColumn(columnId);
    setDropTargetTaskIndex(taskIndex);
    setDropTargetColumnIndex(null);
  };

  const handleTaskDragOver = (
    e: React.DragEvent,
    columnId: string,
    taskIndex: number,
  ) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();

    const kind = syncDragPreviewFromEvent(e) || "task";
    if (kind !== "task") return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const deadZone = 8;
    let insertionIndex = taskIndex;

    if (e.clientY > midpoint + deadZone) {
      insertionIndex = taskIndex + 1;
    } else if (e.clientY < midpoint - deadZone) {
      insertionIndex = taskIndex;
    } else {
      const currentIndex =
        dropTargetColumn === columnId ? dropTargetTaskIndex : null;
      if (currentIndex === taskIndex || currentIndex === taskIndex + 1) {
        insertionIndex = currentIndex;
      }
    }

    setDropTargetColumn(columnId);
    setDropTargetTaskIndex(insertionIndex);
    setDropTargetColumnIndex(null);
    e.dataTransfer.dropEffect = "move";
  };

  const handleTaskDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleColumnAreaDragEnter = (
    e: React.DragEvent,
    columnId: string,
    tasksCount: number,
  ) => {
    if (isReadOnly) return;
    e.preventDefault();
    if (e.currentTarget !== e.target) return;
    const kind = syncDragPreviewFromEvent(e) || "task";
    if (kind !== "task") return;
    setDropTargetColumn(columnId);
    setDropTargetTaskIndex(tasksCount);
    setDropTargetColumnIndex(null);
  };

  const handleTasksContainerDragOver = (
    e: React.DragEvent,
    columnId: string,
    tasksCount: number,
  ) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();

    const kind = syncDragPreviewFromEvent(e) || "task";
    if (kind !== "task") return;

    const container = e.currentTarget as HTMLElement;
    const taskElements = Array.from(
      container.querySelectorAll<HTMLElement>(".kb-task[data-task-index]"),
    );

    let insertionIndex = tasksCount;
    const deadZone = 8;

    for (const el of taskElements) {
      const idxStr = el.dataset.taskIndex;
      if (typeof idxStr !== "string") continue;
      const idx = Number(idxStr);
      if (Number.isNaN(idx)) continue;

      const rect = el.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const distance = Math.abs(e.clientY - midpoint);

      if (distance <= deadZone) {
        const currentIndex =
          dropTargetColumn === columnId ? dropTargetTaskIndex : null;
        if (currentIndex === idx || currentIndex === idx + 1) {
          insertionIndex = currentIndex;
          break;
        }
      }

      if (e.clientY < midpoint) {
        insertionIndex = idx;
        break;
      }

      insertionIndex = idx + 1;
    }

    setDragKind("task");
    setDropTargetColumn(columnId);
    setDropTargetTaskIndex(Math.max(0, Math.min(insertionIndex, tasksCount)));
    setDropTargetColumnIndex(null);
    e.dataTransfer.dropEffect = "move";
  };

  const handleTaskDropOnTask = (
    e: React.DragEvent,
    targetColumnId: string,
    taskIndex: number,
  ) => {
    const insertionIndex =
      dropTargetColumn === targetColumnId && dropTargetTaskIndex !== null
        ? dropTargetTaskIndex
        : taskIndex;
    handleTaskDrop(e, targetColumnId, insertionIndex);
  };

  const handleTaskDrop = (
    e: React.DragEvent,
    targetColumnId: string,
    targetIndex: number | null,
  ) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();

    const dataStr = e.dataTransfer.getData("application/json");
    if (!dataStr) return;

    try {
      const parsed = JSON.parse(dataStr) as Partial<TransferTaskPayload>;
      if (typeof parsed.sourceBlockId !== "string") return;
      if (typeof parsed.itemId !== "string") return;
      if (typeof parsed.text !== "string") return;

      const payload: TransferTaskPayload = {
        kind:
          parsed.kind === "kanban-task" || parsed.kind === "checklist-item"
            ? parsed.kind
            : "checklist-item",
        sourceBlockId: parsed.sourceBlockId,
        sourceColumnId:
          typeof parsed.sourceColumnId === "string"
            ? parsed.sourceColumnId
            : undefined,
        itemId: parsed.itemId,
        text: parsed.text,
        checked: Boolean(parsed.checked),
        depth: typeof parsed.depth === "number" ? parsed.depth : 0,
      };

      let movedTask: Task = {
        id: payload.itemId,
        text: payload.text,
        checked: payload.checked,
      };

      let sourceColIndex = -1;
      let sourceTaskIndex = -1;

      let nextColumns = columns.map((col) => ({
        ...col,
        tasks: [...col.tasks],
      }));

      if (payload.kind === "kanban-task" && payload.sourceBlockId === id) {
        let taskIndex = -1;

        nextColumns.forEach((col, colIndex) => {
          const idx = col.tasks.findIndex((t) => t.id === payload.itemId);
          if (idx !== -1) {
            sourceColIndex = colIndex;
            taskIndex = idx;
            sourceTaskIndex = idx;
          }
        });

        if (sourceColIndex === -1 || taskIndex === -1) return;

        const [extractedTask] = nextColumns[sourceColIndex].tasks.splice(
          taskIndex,
          1,
        );
        movedTask = extractedTask;
      } else if (payload.kind === "kanban-task") {
        removeTaskFromKanbanSource(
          payload.sourceBlockId,
          payload.sourceColumnId,
          payload.itemId,
        );
      } else {
        removeChecklistItemFromSource(payload.sourceBlockId, payload.itemId);
      }

      const targetColIndex = nextColumns.findIndex(
        (c) => c.id === targetColumnId,
      );
      if (targetColIndex === -1) return;

      const insertionIndex =
        targetIndex === null
          ? nextColumns[targetColIndex].tasks.length
          : Math.max(
              0,
              Math.min(targetIndex, nextColumns[targetColIndex].tasks.length),
            );

      const adjustedInsertionIndex =
        payload.kind === "kanban-task" &&
        payload.sourceBlockId === id &&
        sourceColIndex === targetColIndex &&
        sourceTaskIndex !== -1 &&
        sourceTaskIndex < insertionIndex
          ? insertionIndex - 1
          : insertionIndex;

      nextColumns[targetColIndex].tasks.splice(
        Math.max(
          0,
          Math.min(
            adjustedInsertionIndex,
            nextColumns[targetColIndex].tasks.length,
          ),
        ),
        0,
        movedTask,
      );
      save(nextColumns);
    } catch {
      // Ignore malformed transfer payloads
    } finally {
      clearDropTargets();
      clearDragPreview();
    }
  };

  const handleColumnDragStart = (e: React.DragEvent, column: Column) => {
    if (isReadOnly) return;
    const sourceColumnIndex = columns.findIndex((c) => c.id === column.id);
    const payload: TransferColumnPayload = {
      kind: "kanban-column",
      sourceBlockId: id,
      columnId: column.id,
      column,
    };
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
    setDragKind("column");
    setDragColumnPreviewTitle(column.title);
    setDragTaskPreview(null);
    setDragSourceColumnIndex(sourceColumnIndex);

    const dragImage = document.createElement("div");
    dragImage.style.position = "absolute";
    dragImage.style.top = "-9999px";
    dragImage.style.padding = "8px 12px";
    dragImage.style.backgroundColor = "var(--bg-island)";
    dragImage.style.color = "var(--text-main)";
    dragImage.style.border = "1px solid var(--border)";
    dragImage.style.borderRadius = "6px";
    dragImage.style.fontSize = "14px";
    dragImage.style.fontWeight = "600";
    dragImage.style.opacity = "1";
    dragImage.style.pointerEvents = "none";
    dragImage.textContent = `📋 ${column.title}`;
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleColumnDrop = (e: React.DragEvent, insertIndex: number) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();

    const dataStr = e.dataTransfer.getData("application/json");
    if (!dataStr) return;

    try {
      const parsed = JSON.parse(dataStr) as Partial<TransferColumnPayload>;
      if (parsed.kind !== "kanban-column") return;
      if (typeof parsed.sourceBlockId !== "string") return;
      if (typeof parsed.columnId !== "string") return;
      if (typeof parsed.column !== "object" || parsed.column === null) return;

      const movedColumn = parsed.column as Column;

      if (parsed.sourceBlockId === id) {
        const currentIndex = columns.findIndex((c) => c.id === parsed.columnId);
        if (currentIndex === -1) return;

        const reordered = [...columns];
        const [col] = reordered.splice(currentIndex, 1);
        const targetIndex =
          currentIndex < insertIndex ? insertIndex - 1 : insertIndex;
        reordered.splice(
          Math.max(0, Math.min(targetIndex, reordered.length)),
          0,
          col,
        );
        save(reordered);
        return;
      }

      const sourceNode = getNode(parsed.sourceBlockId);
      if (!sourceNode || !sourceNode.data) return;
      const sourceData = sourceNode.data as BlockData;
      if (sourceData.blockType !== "kanban") return;

      const sourceMeta = parseKanbanMetadata(sourceData.metadata);
      const nextSourceColumns = sourceMeta.columns.filter(
        (c) => c.id !== parsed.columnId,
      );

      persistBlock(parsed.sourceBlockId, {
        ...sourceData,
        metadata: JSON.stringify({ columns: nextSourceColumns }),
      });

      const nextTargetColumns = [...columns];
      const targetIndex = Math.max(
        0,
        Math.min(insertIndex, nextTargetColumns.length),
      );
      nextTargetColumns.splice(targetIndex, 0, {
        id: movedColumn.id,
        title: movedColumn.title,
        tasks: [...movedColumn.tasks],
      });
      save(nextTargetColumns);
    } catch {
      // Ignore malformed transfer payloads
    } finally {
      clearDropTargets();
      clearDragPreview();
    }
  };

  const handleColumnDragEnter = (e: React.DragEvent, insertIndex: number) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const kind = syncDragPreviewFromEvent(e) || "column";
    if (kind !== "column") return;
    if (!dragColumnPreviewTitle) {
      setDragColumnPreviewTitle(tr("kanban.defaultColumnTitle", "Column"));
    }
    setDragKind("column");
    setDropTargetColumnIndex(insertIndex);
    setDropTargetColumn(null);
    setDropTargetTaskIndex(null);
  };

  const handleColumnDragOver = (e: React.DragEvent, insertIndex: number) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const kind = syncDragPreviewFromEvent(e) || "column";
    if (kind !== "column") return;
    if (!dragColumnPreviewTitle) {
      setDragColumnPreviewTitle(tr("kanban.defaultColumnTitle", "Column"));
    }
    setDragKind("column");
    setDropTargetColumnIndex(insertIndex);
    setDropTargetColumn(null);
    setDropTargetTaskIndex(null);
    e.dataTransfer.dropEffect = "move";
  };

  return (
    <div
      className={`block-card block-kanban ${selected ? "selected" : ""} ${
        isReadOnly ? "read-only" : ""
      }`}
    >
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={true}
        className="block-handle block-handle-left z-50!"
      >
        {!connected("left") && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={true}
        className="block-handle block-handle-right z-50!"
      >
        {!connected("right") && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={true}
        className="block-handle block-handle-top z-50!"
      >
        {!connected("top") && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={true}
        className="block-handle block-handle-bottom z-50!"
      >
        {!connected("bottom") && <div className="handle-dot" />}
      </Handle>

      <CustomNodeResizer
        minWidth={380}
        minHeight={240}
        isVisible={!isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="kb-root">
        <div className="block-header handle-drag-target flex items-center gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Kanban size={14} />
            <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
              {tr("blocks.blockTypeKanban", "Kanban")}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <input
              value={title}
              onChange={handleTitleChange}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.target as HTMLElement)?.blur?.();
                  focusProjectCanvas();
                }
              }}
              className="block-title nodrag"
              placeholder={tr("blocks.title", "...")}
              readOnly={isReadOnly}
            />
          </div>
        </div>

        <div
          className="kb-main nodrag"
          onDragEnter={handleContainerDragEnter}
          onDragLeave={handleContainerDragLeave}
        >
          {columns.length === 0 ? (
            <div className="kb-empty">
              {!isReadOnly && (
                <button
                  onClick={() => save([createColumn()])}
                  className="kb-btn-empty"
                >
                  <Plus size={28} />
                  <span>{tr("kanban.addColumn", "Add Column")}</span>
                </button>
              )}
            </div>
          ) : (
            <div
              className="kb-scroll nodrag nowheel nopan"
              onWheel={(e) => e.stopPropagation()}
            >
              {!isReadOnly && (
                <button
                  className={`kb-sep nodrag ${
                    dropTargetColumnIndex === 0 &&
                    (dragSourceColumnIndex === null ||
                      dragSourceColumnIndex > 0)
                      ? "kb-sep-drop-target"
                      : ""
                  }`}
                  onDragOver={(e) => handleColumnDragOver(e, 0)}
                  onDragEnter={(e) => handleColumnDragEnter(e, 0)}
                  onDrop={(e) => handleColumnDrop(e, 0)}
                  onClick={() => {
                    const c = createColumn();
                    save([c, ...columns]);
                  }}
                >
                  {dragKind === "column" &&
                  dropTargetColumnIndex === 0 &&
                  (dragSourceColumnIndex === null ||
                    dragSourceColumnIndex > 0) ? (
                    <div className="kb-sep-preview-title">
                      {dragColumnPreviewTitle ||
                        tr("kanban.defaultColumnTitle", "Column")}
                    </div>
                  ) : (
                    <Plus size={14} />
                  )}
                </button>
              )}
              {columns.map((col, idx) => (
                <div key={col.id} className="kb-col-wrap nodrag">
                  <div className="kb-col nodrag">
                    <div className="kb-col-head">
                      <div className="kb-col-title-wrap">
                        {!isReadOnly && (
                          <div
                            className="kb-col-drag-handle"
                            title={tr(
                              "common.dragToReorder",
                              "Drag to reorder",
                            )}
                            draggable={true}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              handleColumnDragStart(e, col);
                            }}
                            onDragEnd={handleDragEnd}
                          >
                            <GripVertical size={12} />
                          </div>
                        )}
                        {editingId === col.id ? (
                          <input
                            autoFocus
                            type="text"
                            className="kb-edit nodrag"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onBlur={() => {
                              const trimmed = editText.trim();
                              if (trimmed) {
                                save(
                                  columns.map((c) =>
                                    c.id === col.id
                                      ? { ...c, title: trimmed }
                                      : c,
                                  ),
                                );
                              }
                              setEditingId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const trimmed = editText.trim();
                                if (trimmed) {
                                  save(
                                    columns.map((c) =>
                                      c.id === col.id
                                        ? { ...c, title: trimmed }
                                        : c,
                                    ),
                                  );
                                }
                                setEditingId(null);
                              }
                              if (e.key === "Escape") {
                                setEditingId(null);
                              }
                            }}
                          />
                        ) : (
                          <h3
                            className="kb-title nodrag"
                            onClick={() => {
                              if (!isReadOnly) {
                                setEditingId(col.id);
                                setEditText(col.title);
                              }
                            }}
                          >
                            {col.title}
                          </h3>
                        )}
                      </div>
                      {!isReadOnly && (
                        <button
                          className="kb-del-col"
                          onClick={() =>
                            save(columns.filter((c) => c.id !== col.id))
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    <div
                      className="kb-tasks nowheel nodrag nopan"
                      onWheel={(e) => e.stopPropagation()}
                      onDragOver={(e) =>
                        handleTasksContainerDragOver(
                          e,
                          col.id,
                          col.tasks.length,
                        )
                      }
                      onDragEnter={(e) =>
                        handleColumnAreaDragEnter(e, col.id, col.tasks.length)
                      }
                      onDrop={(e) => handleTaskDrop(e, col.id, null)}
                    >
                      {col.tasks.map((t, taskIndex) => (
                        <Fragment key={t.id}>
                          {dragKind === "task" &&
                            dropTargetColumn === col.id &&
                            dropTargetTaskIndex === taskIndex &&
                            !(
                              dragSourceTaskInfo?.columnId === col.id &&
                              (dragSourceTaskInfo?.index === taskIndex ||
                                dragSourceTaskInfo?.index + 1 === taskIndex)
                            ) && (
                              <div
                                className="kb-task kb-task-placeholder"
                                aria-hidden="true"
                              >
                                <button
                                  type="button"
                                  className={`checklist-checkbox ${
                                    dragTaskPreview?.checked ? "checked" : ""
                                  }`}
                                  tabIndex={-1}
                                >
                                  {dragTaskPreview?.checked && (
                                    <Check size={10} strokeWidth={4} />
                                  )}
                                </button>
                                <div className="kb-task-placeholder-text">
                                  {dragTaskPreview?.text ||
                                    tr("kanban.addTask", "Task")}
                                </div>
                              </div>
                            )}
                          <div
                            className="kb-task nodrag"
                            data-task-index={taskIndex}
                            onDragOver={(e) =>
                              handleTaskDragOver(e, col.id, taskIndex)
                            }
                            onDragEnter={(e) =>
                              handleTaskDragEnter(e, col.id, taskIndex)
                            }
                            onDragLeave={handleTaskDragLeave}
                            onDrop={(e) =>
                              handleTaskDropOnTask(e, col.id, taskIndex)
                            }
                          >
                            {!isReadOnly && (
                              <div
                                className="kb-task-drag-handle nodrag"
                                title={tr(
                                  "common.dragToReorder",
                                  "Drag to reorder",
                                )}
                                draggable={true}
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  handleTaskDragStart(e, col.id, t);
                                }}
                                onDragEnd={handleDragEnd}
                              >
                                <GripVertical size={12} />
                              </div>
                            )}
                            <button
                              type="button"
                              className={`checklist-checkbox ${
                                t.checked ? "checked" : ""
                              }`}
                              aria-label={tr(
                                "kanban.toggleTask",
                                "Toggle task",
                              )}
                              disabled={isReadOnly}
                              onClick={() =>
                                save(
                                  columns.map((c) =>
                                    c.id === col.id
                                      ? {
                                          ...c,
                                          tasks: c.tasks.map((x) =>
                                            x.id === t.id
                                              ? { ...x, checked: !x.checked }
                                              : x,
                                          ),
                                        }
                                      : c,
                                  ),
                                )
                              }
                            >
                              {t.checked && <Check size={10} strokeWidth={4} />}
                            </button>
                            <AutoResizeTextarea
                              value={t.text}
                              onChange={(e) =>
                                save(
                                  columns.map((c) =>
                                    c.id === col.id
                                      ? {
                                          ...c,
                                          tasks: c.tasks.map((x) =>
                                            x.id === t.id
                                              ? { ...x, text: e.target.value }
                                              : x,
                                          ),
                                        }
                                      : c,
                                  ),
                                )
                              }
                              placeholder={tr("kanban.addTask", "Task...")}
                              readOnly={isReadOnly}
                              className="nodrag"
                            />
                            {!isReadOnly && (
                              <button
                                className="kb-del-task"
                                onClick={() =>
                                  save(
                                    columns.map((c) =>
                                      c.id === col.id
                                        ? {
                                            ...c,
                                            tasks: c.tasks.filter(
                                              (x) => x.id !== t.id,
                                            ),
                                          }
                                        : c,
                                    ),
                                  )
                                }
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </Fragment>
                      ))}
                      {dragKind === "task" &&
                        dropTargetColumn === col.id &&
                        dropTargetTaskIndex === col.tasks.length &&
                        !(
                          dragSourceTaskInfo?.columnId === col.id &&
                          dragSourceTaskInfo?.index === col.tasks.length - 1
                        ) && (
                          <div
                            className="kb-task kb-task-placeholder"
                            aria-hidden="true"
                          >
                            <button
                              type="button"
                              className={`checklist-checkbox ${
                                dragTaskPreview?.checked ? "checked" : ""
                              }`}
                              tabIndex={-1}
                            >
                              {dragTaskPreview?.checked && (
                                <Check size={10} strokeWidth={4} />
                              )}
                            </button>
                            <div className="kb-task-placeholder-text">
                              {dragTaskPreview?.text ||
                                tr("kanban.addTask", "Task")}
                            </div>
                          </div>
                        )}
                    </div>

                    {!isReadOnly && (
                      <button
                        className="kb-add-task"
                        onClick={() => {
                          const t: Task = {
                            id: `t-${Math.random().toString(36).slice(2, 9)}`,
                            text: "",
                            checked: false,
                          };
                          save(
                            columns.map((c) =>
                              c.id === col.id
                                ? { ...c, tasks: [...c.tasks, t] }
                                : c,
                            ),
                          );
                        }}
                      >
                        <Plus size={14} />
                        {tr("kanban.addTask", "Add Task")}
                      </button>
                    )}
                  </div>

                  {!isReadOnly && (
                    <button
                      className={`kb-sep nodrag ${
                        dropTargetColumnIndex === idx + 1 &&
                        (dragSourceColumnIndex === null ||
                          (dragSourceColumnIndex !== idx + 1 &&
                            dragSourceColumnIndex + 1 !== idx + 1))
                          ? "kb-sep-drop-target"
                          : ""
                      }`}
                      onDragOver={(e) => handleColumnDragOver(e, idx + 1)}
                      onDragEnter={(e) => handleColumnDragEnter(e, idx + 1)}
                      onDrop={(e) => handleColumnDrop(e, idx + 1)}
                      onClick={() => {
                        const c = createColumn();
                        save([
                          ...columns.slice(0, idx + 1),
                          c,
                          ...columns.slice(idx + 1),
                        ]);
                      }}
                    >
                      {dragKind === "column" &&
                      dropTargetColumnIndex === idx + 1 &&
                      (dragSourceColumnIndex === null ||
                        (dragSourceColumnIndex !== idx + 1 &&
                          dragSourceColumnIndex + 1 !== idx + 1)) ? (
                        <div className="kb-sep-preview-title">
                          {dragColumnPreviewTitle ||
                            tr("kanban.defaultColumnTitle", "Column")}
                        </div>
                      ) : (
                        <Plus size={14} />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BlockFooter
        updatedAt={data.updatedAt}
        authorName={data.authorName}
        isLocked={data.isLocked}
        dict={dict}
        lang="en"
      />

      <BlockReactions
        reactions={data.reactions}
        onReact={handleReact}
        onRemoveReaction={handleRemoveReaction}
        currentUserId={currentUser?.id}
        isReadOnly={isReadOnly}
        canReact={canReact}
      />
    </div>
  );
});

KanbanBlock.displayName = "KanbanBlock";
export default KanbanBlock;
