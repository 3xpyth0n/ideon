"use client";

import {
  Fragment,
  memo,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  Check,
  GripVertical,
  Kanban,
  Plus,
  MoreHorizontal,
  Edit3,
  ArrowLeft,
  ArrowRight,
  Copy,
  Trash2,
  Settings,
} from "lucide-react";
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
import KanbanCard from "./KanbanCard";
import TaskModal from "./TaskModal";
import KanbanSettingsModal from "./KanbanSettingsModal";
import FieldPickerModal from "./FieldPickerModal";
import ColumnEditModal from "./ColumnEditModal";
import FloatingMenu from "./FloatingMenu";
import type { Option as SettingsOption } from "./KanbanSettingsModal";

// Task/Column/Field types are declared below as `type Task/Column/Field`.

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

interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role?: string;
  color?: string;
}

type KanbanBlockProps = NodeProps<Node<BlockData>>;

type Task = {
  id: string;
  text: string;
  checked: boolean;
  height?: number;
  assigneeId?: string;
  assigneeIds?: string[];
  assigneeName?: string | undefined;
  fields?: Record<string, string | undefined>;
};

type Column = {
  id: string;
  title: string;
  tasks: Task[];
  width?: number; // percent
  widthPx?: number; // explicit pixel width
  color?: string;
  description?: string;
};

type Field = {
  id: string;
  name: string;
  type: "text" | "date" | "select" | "number";
  options?: SettingsOption[];
  visible?: boolean;
  defaultValue?: string | undefined;
};

const MIN_COLUMN_PX = 350;

// Utility: darken a hex color by `amount` (0..1). Returns original if parsing fails.
function darkenHex(hex: string, amount = 0.2) {
  try {
    if (!hex || typeof hex !== "string") return hex;
    if (hex.startsWith("#")) {
      let h = hex.slice(1);
      if (h.length === 3)
        h = h
          .split("")
          .map((c) => c + c)
          .join("");
      if (h.length !== 6) return hex;
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const nr = Math.max(0, Math.min(255, Math.round(r * (1 - amount))));
      const ng = Math.max(0, Math.min(255, Math.round(g * (1 - amount))));
      const nb = Math.max(0, Math.min(255, Math.round(b * (1 - amount))));
      return `#${nr.toString(16).padStart(2, "0")}${ng
        .toString(16)
        .padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
    }
    return hex;
  } catch {
    return hex;
  }
}

const parseKanbanMetadata = (
  raw: unknown,
): { columns: Column[]; fields: Field[] } => {
  try {
    const parsed = (
      typeof raw === "string" ? JSON.parse(raw || "{}") : raw
    ) as Record<string, unknown>;

    const cols = Array.isArray(parsed.columns)
      ? (parsed.columns as unknown[])
      : [];
    const columns: Column[] = cols
      .map((col: unknown) => {
        if (typeof col !== "object" || col === null) return null;
        const c = col as Record<string, unknown>;
        const tasksRaw = Array.isArray(c.tasks) ? (c.tasks as unknown[]) : [];
        const tasks: Task[] = tasksRaw
          .map((task: unknown) => {
            if (typeof task !== "object" || task === null) return null;
            const t = task as Record<string, unknown>;
            if (typeof t.id !== "string") return null;

            const rawAssigneeIds = t["assigneeIds"];
            const assigneeIds = Array.isArray(rawAssigneeIds)
              ? (rawAssigneeIds as unknown[]).filter(
                  (x): x is string => typeof x === "string",
                )
              : typeof t["assigneeId"] === "string"
                ? [t["assigneeId"] as string]
                : undefined;

            const rawFields = t["fields"];
            const fields =
              typeof rawFields === "object" && rawFields !== null
                ? Object.fromEntries(
                    Object.entries(rawFields as Record<string, unknown>)
                      .filter(
                        ([, v]) => v === undefined || typeof v === "string",
                      )
                      .map(([k, v]) => [
                        k,
                        v === undefined ? undefined : String(v),
                      ]),
                  )
                : undefined;

            return {
              id: String(t.id),
              text: typeof t["text"] === "string" ? (t["text"] as string) : "",
              checked: Boolean(t["checked"]),
              height:
                typeof t["height"] === "number" && Number.isFinite(t["height"])
                  ? Math.max(64, Math.round(t["height"] as number))
                  : undefined,
              assigneeIds: assigneeIds as string[] | undefined,
              assigneeId:
                typeof t["assigneeId"] === "string"
                  ? (t["assigneeId"] as string)
                  : undefined,
              assigneeName:
                typeof t["assigneeName"] === "string"
                  ? (t["assigneeName"] as string)
                  : undefined,
              fields: fields as Record<string, string | undefined> | undefined,
            } as Task;
          })
          .filter((x): x is Task => x !== null);

        return {
          id:
            typeof c.id === "string"
              ? (c.id as string)
              : `c-${Math.random().toString(36).slice(2, 9)}`,
          title: typeof c.title === "string" ? (c.title as string) : "",
          tasks,
          width: typeof c.width === "number" ? (c.width as number) : undefined,
          widthPx:
            typeof c.widthPx === "number" ? (c.widthPx as number) : undefined,
          color: typeof c.color === "string" ? (c.color as string) : undefined,
          description:
            typeof c.description === "string"
              ? (c.description as string)
              : undefined,
        } as Column;
      })
      .filter((c): c is Column => c !== null);

    const fieldsRaw = Array.isArray(parsed.fields)
      ? (parsed.fields as unknown[])
      : [];
    const fields: Field[] = fieldsRaw
      .map((f: unknown) => {
        if (typeof f !== "object" || f === null) return null;
        const ff = f as Record<string, unknown>;
        if (typeof ff.id !== "string") return null;

        let opts: SettingsOption[] | undefined = undefined;
        if (Array.isArray(ff.options)) {
          opts = (ff.options as unknown[])
            .map((o) => {
              if (typeof o === "string") {
                const parts = o.split("|");
                return {
                  id: `o-${Math.random().toString(36).slice(2, 9)}`,
                  label: parts[0] || o,
                  color: parts[1] || undefined,
                  description: undefined,
                } as SettingsOption;
              }
              if (typeof o === "object" && o !== null) {
                const oo = o as Record<string, unknown>;
                return {
                  id:
                    typeof oo.id === "string"
                      ? (oo.id as string)
                      : `o-${Math.random().toString(36).slice(2, 9)}`,
                  label:
                    typeof oo.label === "string" ? (oo.label as string) : "",
                  color:
                    typeof oo.color === "string"
                      ? (oo.color as string)
                      : undefined,
                  description:
                    typeof oo.description === "string"
                      ? (oo.description as string)
                      : undefined,
                } as SettingsOption;
              }
              return null;
            })
            .filter((x): x is SettingsOption => x !== null);
        }

        return {
          id: ff.id as string,
          name: typeof ff.name === "string" ? (ff.name as string) : "",
          type:
            ff.type === "date" || ff.type === "select" || ff.type === "number"
              ? (ff.type as "date" | "select" | "number")
              : "text",
          options: opts,
          color:
            typeof ff.color === "string" ? (ff.color as string) : undefined,
          visible:
            typeof ff.visible === "boolean" ? (ff.visible as boolean) : true,
          defaultValue:
            typeof ff.defaultValue === "string"
              ? (ff.defaultValue as string)
              : undefined,
        } as Field;
      })
      .filter((x): x is Field => x !== null);

    return { columns, fields };
  } catch {
    return { columns: [], fields: [] };
  }
};

const KanbanBlock = memo(({ id, data, selected }: KanbanBlockProps) => {
  const { dict, lang } = useI18n();
  const [columns, setColumns] = useState<Column[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const columnsRef = useRef<Column[]>([]);
  const resizingRef = useRef<null | {
    index: number;
    startLeft?: number;
    containerWidth: number;
    moveHandler?: (ev: PointerEvent) => void;
    upHandler?: () => void;
  }>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{
    x: number;
    y: number;
    right?: number;
  }>({ x: 0, y: 0 });
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

  const [collaborators, setCollaborators] = useState<UserProfile[]>([]);

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
    setFields(meta.fields || []);
  }, [data.metadata]);

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  const save = (cols: Column[], updatedFields?: Field[]) => {
    const fieldsToSave = updatedFields ?? fields;
    setColumns(cols);
    setFields(fieldsToSave);
    return data.onContentChange?.(
      id,
      data.content,
      new Date().toISOString(),
      getEditorName(),
      JSON.stringify({ columns: cols, fields: fieldsToSave }),
      title,
      data.reactions,
    );
  };

  const startColumnResize = useCallback(
    (e: React.PointerEvent, idx: number) => {
      if (isReadOnly) return;
      const container = scrollRef.current;
      if (!container) return;
      const cols = columnsRef.current || [];
      if (idx < 0 || idx >= cols.length) return;

      // locate column element — prefer closest .kb-col from the event target
      const startTarget = e.currentTarget as HTMLElement;
      const els = container.querySelectorAll<HTMLElement>(".kb-col");
      const colEl: HTMLElement | null =
        startTarget.closest(".kb-col") || els[idx] || startTarget || null;
      if (!colEl) return;

      const startRect = colEl.getBoundingClientRect();
      const startRectWidth = startRect.width;
      const startWidthCss = Math.max(
        32,
        Math.round(
          colEl.clientWidth || parseFloat(getComputedStyle(colEl).width || "0"),
        ),
      );
      const scale =
        startRectWidth && startWidthCss ? startRectWidth / startWidthCss : 1;
      const startLeft = startRect.left;
      const startX = (e as unknown as PointerEvent).clientX ?? e.clientX;
      const minPx = MIN_COLUMN_PX; // in CSS px

      // mark root as resizing to disable transitions via CSS
      const rootEl = container.closest(".kb-root") as HTMLElement | null;
      try {
        rootEl?.classList.add("kb-resizing");
        document.body.style.userSelect = "none";
        // ensure box-sizing so width px matches bounding rect
        colEl.style.boxSizing = "border-box";
      } catch {
        // ignore
      }

      let latestWidth = startWidthCss;
      const pointerId =
        (e.nativeEvent as PointerEvent)?.pointerId ??
        (e as unknown as PointerEvent)?.pointerId ??
        0;

      const pointerCaptureTarget = startTarget;
      try {
        pointerCaptureTarget?.setPointerCapture?.(pointerId);
      } catch {
        // ignore
      }

      // Use relative delta from initial pointer and convert screen px -> CSS px using scale
      const moveHandler = (ev: PointerEvent) => {
        try {
          const dxScreen = ev.clientX - startX;
          const dxCss = dxScreen / (scale || 1);
          const newWidthCss = Math.max(
            minPx,
            Math.round(startWidthCss + dxCss),
          );
          latestWidth = newWidthCss;
          colEl.style.width = `${newWidthCss}px`;
        } catch {
          // ignore
        }
      };

      const upHandler = () => {
        try {
          window.removeEventListener("pointermove", moveHandler);
          window.removeEventListener("pointerup", upHandler);
        } catch {
          // ignore
        }
        try {
          pointerCaptureTarget?.removeEventListener("pointermove", moveHandler);
          pointerCaptureTarget?.removeEventListener("pointerup", upHandler);
        } catch {
          // ignore
        }

        const finalWidth = latestWidth;
        const next = (columnsRef.current || []).map((c: Column, i: number) =>
          i === idx ? { ...c, widthPx: finalWidth } : { ...c },
        );
        // persist the new widths
        save(next);

        try {
          rootEl?.classList.remove("kb-resizing");
          document.body.style.userSelect = "";
          // restore box-sizing state
          if (colEl) colEl.style.boxSizing = "";
        } catch {
          // ignore
        }

        try {
          pointerCaptureTarget?.releasePointerCapture?.(pointerId);
        } catch {
          // ignore
        }

        resizingRef.current = null;
      };

      // store handlers for debugging/inspection
      resizingRef.current = {
        index: idx,
        startLeft,
        containerWidth: container.getBoundingClientRect().width || 0,
        moveHandler,
        upHandler,
      };

      // Attach move handler both to the capture target and window for reliability
      try {
        window.addEventListener("pointermove", moveHandler);
        window.addEventListener("pointerup", upHandler);
      } catch {
        // ignore
      }
      try {
        pointerCaptureTarget?.addEventListener("pointermove", moveHandler);
        pointerCaptureTarget?.addEventListener("pointerup", upHandler);
      } catch {
        // ignore
      }
    },
    [isReadOnly, save],
  );

  const getColumnPercents = (cols: Column[]) => {
    const n = cols.length;
    if (n === 0) return [] as number[];
    const defined = cols.map((c: Column) =>
      typeof c.width === "number" ? c.width : null,
    );
    const totalDefined = defined.reduce<number>((s, v) => s + (v ?? 0), 0);
    const undefinedCount = defined.filter((v) => v === null).length;
    if (totalDefined === 0) {
      const per = 100 / n;
      return Array(n)
        .fill(per)
        .map((v) => Math.round(v * 100) / 100);
    }
    const remaining = Math.max(0, 100 - totalDefined);
    const share = undefinedCount > 0 ? remaining / undefinedCount : 0;
    let result = defined.map((v) => (v !== null ? v : share));
    const sum = result.reduce<number>((s, r) => s + r, 0);
    if (Math.abs(sum - 100) > 0.1) {
      result = result.map((r) => (r / sum) * 100);
    }
    const rounded = result.map((r) => Math.round(r * 100) / 100);
    const diff =
      Math.round((100 - rounded.reduce<number>((s, r) => s + r, 0)) * 100) /
      100;
    rounded[rounded.length - 1] =
      Math.round((rounded[rounded.length - 1] + diff) * 100) / 100;
    return rounded;
  };

  useEffect(() => {
    let mounted = true;
    const handleGlobalClick = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      // Use composedPath when available to reliably detect clicks that
      // originate from portals/shadow DOM. If the click is outside any
      // contextual menu or menu trigger we close the open menu.
      const composed = (
        ev as Event & { composedPath?: () => EventTarget[] }
      ).composedPath?.();
      let clickedInside = false;
      if (Array.isArray(composed)) {
        for (const p of composed) {
          if (p instanceof HTMLElement) {
            if (
              p.closest(".context-menu") ||
              p.classList.contains("kb-col-opts") ||
              p.classList.contains("kb-task-opts") ||
              p.classList.contains("kb-block-opts")
            ) {
              clickedInside = true;
              break;
            }
          }
        }
      }
      if (!clickedInside) {
        if (
          target.closest(".context-menu") ||
          target.closest(".kb-col-opts") ||
          target.closest(".kb-task-opts") ||
          target.closest(".kb-block-opts")
        ) {
          clickedInside = true;
        }
      }
      if (!clickedInside) setOpenMenuKey(null);
    };
    const handleGlobalKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpenMenuKey(null);
    };
    const fetchCollaborators = async () => {
      if (!data.initialProjectId) {
        if (mounted) setCollaborators([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/projects/${data.initialProjectId}/collaborators`,
        );
        if (!mounted) return;
        if (res.ok) {
          const json = await res.json();
          setCollaborators(json);
        }
      } catch (err) {
        console.error("Failed to fetch collaborators", err);
      }
    };
    fetchCollaborators();
    // Listen in capture phase on pointerdown to ensure we catch clicks
    // even if other handlers call stopPropagation during the bubble phase.
    window.addEventListener("pointerdown", handleGlobalClick, true);
    window.addEventListener("keydown", handleGlobalKey);
    return () => {
      mounted = false;
      window.removeEventListener("pointerdown", handleGlobalClick, true);
      window.removeEventListener("keydown", handleGlobalKey);
    };
  }, [data.initialProjectId]);

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

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [editColumnId, setEditColumnId] = useState<string | null>(null);
  const [taskModalTaskId, setTaskModalTaskId] = useState<string | null>(null);

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
    widthPx: MIN_COLUMN_PX,
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
      metadata: JSON.stringify({
        columns: cleanedColumns,
        fields: sourceMeta.fields || [],
      }),
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

  const findTaskById = (taskId: string) => {
    for (const c of columns) {
      const t = c.tasks.find((x) => x.id === taskId);
      if (t) return { ...t, columnId: c.id } as Task & { columnId: string };
    }
    return null;
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
        metadata: JSON.stringify({
          columns: nextSourceColumns,
          fields: sourceMeta.fields || [],
        }),
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

  const percents = getColumnPercents(columns);

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

      <div
        className={`kb-root ${
          dragKind === "column" ? "kb-dragging-columns" : ""
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
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
            {!isReadOnly && (
              <div className="relative">
                <button
                  className="kb-block-opts p-1 rounded ml-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (
                      e.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    const vw =
                      window.innerWidth ||
                      document.documentElement.clientWidth ||
                      1024;
                    const vh =
                      window.innerHeight ||
                      document.documentElement.clientHeight ||
                      768;
                    const estimatedMenuWidth = 220;
                    const estimatedMenuHeight = 220;
                    let left = Math.round(rect.left);
                    if (left + estimatedMenuWidth > vw - 8)
                      left = Math.max(8, vw - estimatedMenuWidth - 8);
                    if (left < 8) left = 8;
                    let top = Math.round(rect.bottom + 6);
                    if (top + estimatedMenuHeight > vh - 8) {
                      const alt = Math.round(
                        rect.top - estimatedMenuHeight - 6,
                      );
                      top = alt > 8 ? alt : Math.max(8, Math.round(rect.top));
                    }
                    setMenuPos({ x: left, y: top });
                    setOpenMenuKey("block:menu");
                  }}
                  title={tr("kanban.blockOptions", "Block options")}
                >
                  <MoreHorizontal size={14} />
                </button>

                {openMenuKey === "block:menu" && (
                  <FloatingMenu
                    style={
                      { top: menuPos.y, left: menuPos.x } as React.CSSProperties
                    }
                    onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    <button
                      className="context-menu-item"
                      onClick={() => {
                        setOpenMenuKey(null);
                        setSettingsOpen(true);
                      }}
                    >
                      <span className="context-menu-icon">
                        <Settings size={14} />
                      </span>
                      <span className="context-menu-label">
                        {tr("kanban.manageFields", "Manage fields")}
                      </span>
                    </button>
                  </FloatingMenu>
                )}
              </div>
            )}
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
                  onClick={() => {
                    const c = createColumn();
                    const next = [c];
                    // new columns use explicit pixel width
                    const nextCols = next.map((col) => ({
                      ...col,
                      widthPx: MIN_COLUMN_PX,
                    }));
                    save(nextCols);
                  }}
                  className="kb-btn-empty"
                >
                  <Plus size={28} />
                  <span>{tr("kanban.addColumn", "Add Column")}</span>
                </button>
              )}
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="kb-scroll nodrag nowheel nopan"
              onWheel={(e) => e.stopPropagation()}
            >
              {/* Removed the leading 'add column' + button per UX request */}
              {columns.map((col, idx) => (
                <div key={col.id} className="kb-col-wrap nodrag">
                  <div
                    className="kb-col nodrag"
                    style={{
                      width:
                        typeof col.widthPx === "number"
                          ? `${col.widthPx}px`
                          : `${
                              typeof col.width === "number"
                                ? col.width
                                : percents[idx]
                            }%`,
                    }}
                    onPointerMove={(e) => {
                      try {
                        const el = e.currentTarget as HTMLElement;
                        const rect = el.getBoundingClientRect();
                        const pxFromRight =
                          rect.right - (e as React.PointerEvent).clientX;
                        const threshold = 10;
                        if (pxFromRight >= 0 && pxFromRight <= threshold) {
                          el.style.cursor = "col-resize";
                        } else {
                          el.style.cursor = "";
                        }
                      } catch {
                        // ignore
                      }
                    }}
                    onPointerLeave={(e) => {
                      try {
                        (e.currentTarget as HTMLElement).style.cursor = "";
                      } catch {
                        // ignore
                      }
                    }}
                    onPointerDown={(e) => {
                      // allow starting a column resize by pointerdown near the right edge
                      if (isReadOnly) return;
                      try {
                        const el = e.currentTarget as HTMLElement;
                        const rect = el.getBoundingClientRect();
                        const pxFromRight =
                          rect.right - (e as React.PointerEvent).clientX;
                        const threshold = 10; // px from right edge to start resize
                        if (pxFromRight >= 0 && pxFromRight <= threshold) {
                          startColumnResize(e as React.PointerEvent, idx);
                        }
                      } catch {
                        // ignore
                      }
                    }}
                  >
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
                          <div className="flex items-center min-w-0">
                            {col.color ? (
                              <span
                                className="kb-col-swatch"
                                style={{
                                  background: col.color,
                                  borderColor: darkenHex(col.color, 0.22),
                                }}
                              />
                            ) : null}
                            <div className="kb-col-title-block min-w-0">
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
                              {col.description && col.description.trim() ? (
                                <>
                                  <div className="kb-col-title-sep" />
                                  <div className="kb-col-desc">
                                    {col.description}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                      {!isReadOnly && (
                        <div className="relative">
                          <button
                            className="kb-col-opts p-1 rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = (
                                e.currentTarget as HTMLElement
                              ).getBoundingClientRect();
                              const vw =
                                window.innerWidth ||
                                document.documentElement.clientWidth ||
                                1024;
                              const vh =
                                window.innerHeight ||
                                document.documentElement.clientHeight ||
                                768;
                              const estimatedMenuWidth = 220;
                              const estimatedMenuHeight = 220;
                              let left = Math.round(rect.left);
                              if (left + estimatedMenuWidth > vw - 8)
                                left = Math.max(8, vw - estimatedMenuWidth - 8);
                              if (left < 8) left = 8;
                              let top = Math.round(rect.bottom + 6);
                              if (top + estimatedMenuHeight > vh - 8) {
                                const alt = Math.round(
                                  rect.top - estimatedMenuHeight - 6,
                                );
                                top =
                                  alt > 8
                                    ? alt
                                    : Math.max(8, Math.round(rect.top));
                              }
                              setMenuPos({ x: left, y: top });
                              setOpenMenuKey(`col:${col.id}`);
                            }}
                            title={tr("kanban.editColumn", "Edit column")}
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {openMenuKey === `col:${col.id}` && (
                            <FloatingMenu
                              style={
                                {
                                  top: menuPos.y,
                                  left: menuPos.x,
                                } as React.CSSProperties
                              }
                              onMouseDown={(e: React.MouseEvent) =>
                                e.stopPropagation()
                              }
                              onClick={(e: React.MouseEvent) =>
                                e.stopPropagation()
                              }
                            >
                              <button
                                className="context-menu-item"
                                onClick={() => {
                                  setOpenMenuKey(null);
                                  setEditColumnId(col.id);
                                }}
                              >
                                <span className="context-menu-icon">
                                  <Edit3 size={14} />
                                </span>
                                <span className="context-menu-label">
                                  {tr("kanban.editDetails", "Edit details")}
                                </span>
                              </button>

                              <button
                                className="context-menu-item"
                                onClick={() => {
                                  setOpenMenuKey(null);
                                  if (idx > 0) {
                                    const next = [...columns];
                                    const [c] = next.splice(idx, 1);
                                    next.splice(idx - 1, 0, c);
                                    save(next);
                                  }
                                }}
                              >
                                <span className="context-menu-icon">
                                  <ArrowLeft size={14} />
                                </span>
                                <span className="context-menu-label">
                                  {tr("kanban.moveLeft", "Move left")}
                                </span>
                              </button>

                              <button
                                className="context-menu-item"
                                onClick={() => {
                                  setOpenMenuKey(null);
                                  if (idx < columns.length - 1) {
                                    const next = [...columns];
                                    const [c] = next.splice(idx, 1);
                                    next.splice(idx + 1, 0, c);
                                    save(next);
                                  }
                                }}
                              >
                                <span className="context-menu-icon">
                                  <ArrowRight size={14} />
                                </span>
                                <span className="context-menu-label">
                                  {tr("kanban.moveRight", "Move right")}
                                </span>
                              </button>

                              <button
                                className="context-menu-item"
                                onClick={() => {
                                  setOpenMenuKey(null);
                                  const dup = {
                                    ...col,
                                    id: `c-${Math.random()
                                      .toString(36)
                                      .slice(2, 9)}`,
                                    tasks: col.tasks.map((t) => ({
                                      ...t,
                                      id: `t-${Math.random()
                                        .toString(36)
                                        .slice(2, 9)}`,
                                    })),
                                  };
                                  const next = [...columns];
                                  next.splice(idx + 1, 0, dup);
                                  save(next);
                                }}
                              >
                                <span className="context-menu-icon">
                                  <Copy size={14} />
                                </span>
                                <span className="context-menu-label">
                                  {tr("kanban.duplicateColumn", "Duplicate")}
                                </span>
                              </button>

                              <button
                                className="context-menu-item danger"
                                onClick={() => {
                                  setOpenMenuKey(null);
                                  save(columns.filter((c) => c.id !== col.id));
                                }}
                              >
                                <span className="context-menu-icon">
                                  <Trash2 size={14} />
                                </span>
                                <span className="context-menu-label">
                                  {tr("kanban.deleteColumn", "Delete")}
                                </span>
                              </button>
                            </FloatingMenu>
                          )}
                        </div>
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

                          <KanbanCard
                            task={t}
                            taskIndex={taskIndex}
                            column={col}
                            columns={columns}
                            save={save}
                            collaborators={collaborators}
                            currentUser={currentUser}
                            isReadOnly={isReadOnly}
                            tr={tr}
                            handleTaskDragStart={handleTaskDragStart}
                            handleTaskDragOver={handleTaskDragOver}
                            handleTaskDragEnter={handleTaskDragEnter}
                            handleTaskDragLeave={handleTaskDragLeave}
                            handleTaskDropOnTask={handleTaskDropOnTask}
                            handleDragEnd={handleDragEnd}
                            fields={fields}
                            onOpenFieldPicker={() => setFieldPickerOpen(true)}
                            openMenuKey={openMenuKey}
                            openMenuPos={menuPos}
                            onRequestOpenMenu={(key, pos) => {
                              if (pos) setMenuPos(pos);
                              setOpenMenuKey(key);
                            }}
                            onRequestCloseMenu={() => setOpenMenuKey(null)}
                            onRequestOpenTaskModal={(taskId) =>
                              setTaskModalTaskId(taskId)
                            }
                          />
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
                            assigneeIds: [],
                            assigneeName: undefined,
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

                    {/** larger invisible handle on the right edge to make resize easier */}
                    {!isReadOnly && (
                      <div
                        className="kb-col-edge-handle"
                        onPointerDown={(ev) => {
                          ev.stopPropagation();
                          try {
                            startColumnResize(
                              ev as unknown as React.PointerEvent,
                              idx,
                            );
                          } catch {
                            // ignore
                          }
                        }}
                        onPointerMove={(ev) => {
                          try {
                            (ev.currentTarget as HTMLElement).style.cursor =
                              "col-resize";
                          } catch {
                            // ignore
                          }
                        }}
                      />
                    )}
                  </div>

                  {/* column resize is now started by pointerdown near the column's right edge */}

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
                        const next = [
                          ...columns.slice(0, idx + 1),
                          c,
                          ...columns.slice(idx + 1),
                        ];
                        // new inserted columns default to explicit pixel width
                        const nextCols = next.map((col) => ({
                          ...col,
                          widthPx: MIN_COLUMN_PX,
                        }));
                        save(nextCols);
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

      <KanbanSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialFields={fields}
        initialColumns={columns}
        onSave={(cols: Column[], f: Field[]) => save(cols, f)}
      />

      <FieldPickerModal
        isOpen={fieldPickerOpen}
        onClose={() => setFieldPickerOpen(false)}
        fields={fields}
        columns={columns}
        projectId={data.initialProjectId}
        blockId={id}
        onSaved={(f) => setFields(f)}
      />

      <ColumnEditModal
        isOpen={Boolean(editColumnId)}
        onClose={() => setEditColumnId(null)}
        column={columns.find((c) => c.id === editColumnId) ?? null}
        onSave={(patch) => {
          if (!editColumnId) return;
          const next = columns.map((c) =>
            c.id === editColumnId ? { ...c, ...patch } : c,
          );
          save(next);
          setEditColumnId(null);
        }}
      />

      <TaskModal
        isOpen={Boolean(taskModalTaskId)}
        onClose={() => setTaskModalTaskId(null)}
        task={taskModalTaskId ? findTaskById(taskModalTaskId) : null}
        collaborators={collaborators}
        fields={fields}
        tr={tr}
        onSave={(updated) => {
          const next = columns.map((c) => ({
            ...c,
            tasks: c.tasks.map((x) =>
              x.id === updated.id ? { ...x, ...updated } : x,
            ),
          }));
          save(next);
          setTaskModalTaskId(null);
        }}
      />

      <BlockFooter
        updatedAt={data.updatedAt}
        authorName={data.authorName}
        isLocked={data.isLocked}
        dict={dict}
        lang={lang}
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
