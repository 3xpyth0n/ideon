"use client";
import React, { useLayoutEffect, useRef } from "react";
import {
  GripVertical,
  MoreHorizontal,
  Edit3,
  Copy,
  Trash2,
} from "lucide-react";
import CardAssigneeView from "./CardAssigneeView";
import FloatingMenu from "./FloatingMenu";
import type { Field, Option } from "./KanbanSettingsModal";

type Task = {
  id: string;
  text: string;
  checked: boolean;
  height?: number;
  assigneeId?: string;
  assigneeIds?: string[];
  assigneeName?: string;
  fields?: Record<string, string | undefined>;
};

type Column = {
  id: string;
  title: string;
  tasks: Task[];
};

type UserProfile = {
  id: string;
  email?: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string;
  color?: string;
};

interface Props {
  task: Task;
  taskIndex: number;
  column: Column;
  columns: Column[];
  save: (cols: Column[]) => void;
  fields: Field[];
  collaborators: UserProfile[];
  currentUser?: UserProfile | undefined;
  isReadOnly: boolean;
  tr: (path: string, fallback: string) => string;
  handleTaskDragStart: (
    e: React.DragEvent,
    sourceColumnId: string,
    task: Task,
  ) => void;
  handleTaskDragOver: (
    e: React.DragEvent,
    columnId: string,
    taskIndex: number,
  ) => void;
  handleTaskDragEnter: (
    e: React.DragEvent,
    columnId: string,
    taskIndex: number,
  ) => void;
  handleTaskDragLeave: (e: React.DragEvent) => void;
  handleTaskDropOnTask: (
    e: React.DragEvent,
    targetColumnId: string,
    taskIndex: number,
  ) => void;
  handleDragEnd: () => void;
  onOpenFieldPicker?: () => void;
  openMenuKey?: string | null;
  openMenuPos?: { x: number; y: number; right?: number } | null;
  onRequestOpenMenu?: (
    key: string | null,
    pos?: { x: number; y: number; right?: number } | null,
  ) => void;
  onRequestCloseMenu?: () => void;
  onRequestOpenTaskModal?: (taskId: string) => void;
}

function toPlainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function KanbanCard({
  task: t,
  taskIndex,
  column: col,
  columns,
  save,
  fields,
  collaborators,
  isReadOnly,
  tr,
  handleTaskDragStart,
  handleTaskDragOver,
  handleTaskDragEnter,
  handleTaskDragLeave,
  handleTaskDropOnTask,
  handleDragEnd,
  openMenuKey,
  openMenuPos,
  onRequestOpenMenu,
  onRequestCloseMenu,
  onRequestOpenTaskModal,
}: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (typeof t.height !== "number" || !Number.isFinite(t.height)) return;

    const minContentHeight = Math.max(64, Math.ceil(el.scrollHeight));
    if (t.height >= minContentHeight) return;

    save(
      columns.map((c) =>
        c.id === col.id
          ? {
              ...c,
              tasks: c.tasks.map((x) =>
                x.id === t.id ? { ...x, height: minContentHeight } : x,
              ),
            }
          : c,
      ),
    );
  }, [col.id, columns, save, t.height, t.id, t.text]);

  const computeChipColors = (color?: string) => {
    let bg = "var(--bg-island)";
    let border = "transparent";
    if (typeof color === "string" && color) {
      // normalize short hex like #f00 -> #ff0000
      if (color.startsWith("#")) {
        if (color.length === 4) {
          const r = color[1];
          const g = color[2];
          const b = color[3];
          const full = `#${r}${r}${g}${g}${b}${b}`;
          bg = `${full}22`;
          border = `${full}cc`;
        } else if (color.length === 7) {
          bg = `${color}22`;
          border = `${color}cc`;
        } else {
          bg = color;
          border = color;
        }
      } else if (color.startsWith("rgb(")) {
        bg = color.replace("rgb(", "rgba(").replace(")", ",0.12)");
        border = color.replace("rgb(", "rgba(").replace(")", ",0.88)");
      } else if (color.startsWith("hsl(")) {
        bg = color.replace("hsl(", "hsla(").replace(")", ",0.12)");
        border = color.replace("hsl(", "hsla(").replace(")", ",0.88)");
      } else {
        bg = color;
        // make border slightly darker/larger contrast by using the color directly
        border = color;
      }
    }
    return { background: bg, borderColor: border } as React.CSSProperties;
  };
  // Menu open/close is managed by parent `KanbanBlock` via props:
  // `openMenuKey`, `openMenuPos`, `onRequestOpenMenu`, `onRequestCloseMenu`.
  const resizingRef = useRef<null | { startY: number; startH: number }>(null);
  // split text into title + description
  const lines = (t.text || "").split("\n");
  const title = lines[0] || "";
  const description = lines.slice(1).join("\n").trim();
  const plainDescription = toPlainText(description);
  const descriptionSnippet =
    plainDescription.length > 100
      ? `${plainDescription.slice(0, 100).trimEnd()}...`
      : plainDescription;

  const startResize = (e: React.PointerEvent) => {
    if (isReadOnly) return;
    const el = cardRef.current;
    if (!el) return;

    // measure bounding rect (screen px) and css height (layout px)
    const startRect = el.getBoundingClientRect();
    const startRectHeight = startRect.height;
    const startHeightCss = Math.max(
      48,
      Math.round(
        el.clientHeight || parseFloat(getComputedStyle(el).height || "0"),
      ),
    );
    const prevInlineHeight = el.style.height;
    el.style.height = "auto";
    const minContentHeight = Math.max(64, Math.ceil(el.scrollHeight));
    el.style.height = prevInlineHeight;
    // scale to convert screen px -> CSS px
    const scale =
      startRectHeight && startHeightCss ? startRectHeight / startHeightCss : 1;
    const startY =
      (e.nativeEvent as PointerEvent)?.clientY ??
      (e as unknown as PointerEvent).clientY ??
      0;

    // disable transitions while resizing to avoid visual teleport
    const rootEl = el.closest(".kb-root") as HTMLElement | null;
    try {
      rootEl?.classList.add("kb-resizing");
      document.body.style.userSelect = "none";
      el.style.boxSizing = "border-box";
    } catch {
      // ignore
    }

    let latestHeight = startHeightCss;
    const pointerId =
      (e.nativeEvent as PointerEvent)?.pointerId ??
      (e as unknown as PointerEvent)?.pointerId ??
      0;
    const pointerCaptureTarget = e.currentTarget as HTMLElement;
    try {
      pointerCaptureTarget?.setPointerCapture?.(pointerId);
    } catch {
      // ignore
    }

    resizingRef.current = { startY, startH: startHeightCss };

    const move = (ev: PointerEvent) => {
      try {
        const dyScreen = ev.clientY - startY;
        const dyCss = dyScreen / (scale || 1);
        const nextH = Math.max(
          minContentHeight,
          Math.round(startHeightCss + dyCss),
        );
        latestHeight = nextH;
        el.style.height = `${nextH}px`;
      } catch {
        // ignore
      }
    };

    const up = () => {
      try {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      } catch {
        // ignore
      }
      try {
        pointerCaptureTarget?.removeEventListener("pointermove", move);
        pointerCaptureTarget?.removeEventListener("pointerup", up);
      } catch {
        // ignore
      }

      const finalH = latestHeight;
      // persist height to task
      save(
        columns.map((c) =>
          c.id === col.id
            ? {
                ...c,
                tasks: c.tasks.map((x) =>
                  x.id === t.id ? { ...x, height: finalH } : x,
                ),
              }
            : c,
        ),
      );

      try {
        rootEl?.classList.remove("kb-resizing");
        document.body.style.userSelect = "";
        if (el) el.style.boxSizing = "";
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

    // attach both to window and to the capture target for reliability
    try {
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    } catch {
      // ignore
    }
    try {
      pointerCaptureTarget?.addEventListener("pointermove", move);
      pointerCaptureTarget?.addEventListener("pointerup", up);
    } catch {
      // ignore
    }
  };

  return (
    <div
      ref={cardRef}
      className="kb-task nodrag relative"
      style={
        typeof t.height === "number" && Number.isFinite(t.height)
          ? { height: `${Math.max(64, Math.round(t.height))}px` }
          : undefined
      }
      data-task-index={taskIndex}
      onDragOver={(e) => handleTaskDragOver(e, col.id, taskIndex)}
      onDragEnter={(e) => handleTaskDragEnter(e, col.id, taskIndex)}
      onDragLeave={handleTaskDragLeave}
      onDrop={(e) => handleTaskDropOnTask(e, col.id, taskIndex)}
    >
      {!isReadOnly && (
        <div
          className="kb-task-drag-handle nodrag"
          title={tr("common.dragToReorder", "Drag to reorder")}
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

      <div className="flex-1 min-w-0">
        <div
          className="kb-task-title w-full text-sm font-semibold mb-1 cursor-pointer"
          onClick={() => {
            if (!isReadOnly) {
              // request parent to open the task modal
              onRequestOpenTaskModal?.(t.id);
            }
          }}
          role="button"
        >
          {title || tr("kanban.addTask", "Task")}
        </div>
        {descriptionSnippet ? (
          <div className="kb-task-desc">{descriptionSnippet}</div>
        ) : null}
      </div>

      {!isReadOnly && (
        <div className="kb-task-meta flex items-center gap-2 ml-2">
          <div className="flex items-center gap-2">
            <div className="kb-task-assignee order-first shrink-0">
              <CardAssigneeView
                collaborators={collaborators}
                value={
                  Array.isArray(t.assigneeIds)
                    ? t.assigneeIds
                    : t.assigneeId
                      ? [t.assigneeId]
                      : []
                }
                isOpen={openMenuKey === `assignee:${t.id}`}
                onOpen={(pos) => onRequestOpenMenu?.(`assignee:${t.id}`, pos)}
                onClose={() => onRequestCloseMenu?.()}
                onChange={(ids) => {
                  save(
                    columns.map((c) =>
                      c.id === col.id
                        ? {
                            ...c,
                            tasks: c.tasks.map((x) =>
                              x.id === t.id
                                ? {
                                    ...x,
                                    assigneeIds: ids,
                                    assigneeId: ids[0] ?? undefined,
                                  }
                                : x,
                            ),
                          }
                        : c,
                    ),
                  );
                }}
              />
            </div>
            {/* assignee + menu stay inline; field chips moved to footer below */}

            {/* three-dot menu trigger */}
            <div className="relative order-last">
              <button
                type="button"
                className="kb-task-opts p-1 rounded"
                aria-label={tr("kanban.taskOptions", "Task options")}
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
                  // compute left clamped to viewport
                  let left = Math.round(rect.left);
                  if (left + estimatedMenuWidth > vw - 8)
                    left = Math.max(8, vw - estimatedMenuWidth - 8);
                  if (left < 8) left = 8;
                  // compute top; prefer below button, but if not enough space open above
                  let top = Math.round(rect.bottom + 6);
                  if (top + estimatedMenuHeight > vh - 8) {
                    const alt = Math.round(rect.top - estimatedMenuHeight - 6);
                    top = alt > 8 ? alt : Math.max(8, Math.round(rect.top));
                  }
                  onRequestOpenMenu?.(`task:${t.id}`, { x: left, y: top });
                }}
              >
                <MoreHorizontal size={14} />
              </button>

              {openMenuKey === `task:${t.id}` && (
                <FloatingMenu
                  style={
                    {
                      top: openMenuPos?.y ?? 0,
                      left: openMenuPos?.x ?? 0,
                    } as React.CSSProperties
                  }
                  onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  <button
                    className="context-menu-item"
                    onClick={() => {
                      onRequestCloseMenu?.();
                      onRequestOpenTaskModal?.(t.id);
                    }}
                  >
                    <span className="context-menu-icon">
                      <Edit3 size={14} />
                    </span>
                    <span className="context-menu-label">
                      {tr("kanban.editTask", "Edit")}
                    </span>
                  </button>

                  <button
                    className="context-menu-item"
                    onClick={() => {
                      onRequestCloseMenu?.();
                      const newTask = {
                        ...t,
                        id: `t-${Math.random().toString(36).slice(2, 9)}`,
                      } as Task;
                      save(
                        columns.map((c) =>
                          c.id === col.id
                            ? {
                                ...c,
                                tasks: [
                                  ...c.tasks.slice(0, taskIndex + 1),
                                  newTask,
                                  ...c.tasks.slice(taskIndex + 1),
                                ],
                              }
                            : c,
                        ),
                      );
                    }}
                  >
                    <span className="context-menu-icon">
                      <Copy size={14} />
                    </span>
                    <span className="context-menu-label">
                      {tr("kanban.duplicateTask", "Duplicate")}
                    </span>
                  </button>

                  <button
                    className="context-menu-item danger"
                    onClick={() => {
                      onRequestCloseMenu?.();
                      save(
                        columns.map((c) =>
                          c.id === col.id
                            ? {
                                ...c,
                                tasks: c.tasks.filter((x) => x.id !== t.id),
                              }
                            : c,
                        ),
                      );
                    }}
                  >
                    <span className="context-menu-icon">
                      <Trash2 size={14} />
                    </span>
                    <span className="context-menu-label">
                      {tr("kanban.deleteTask", "Delete")}
                    </span>
                  </button>
                </FloatingMenu>
              )}
            </div>
          </div>
        </div>
      )}
      {/* footer line for field badges */}
      <div className="kb-task-footer">
        {fields.map((f) => {
          const v = t.fields?.[f.id];
          if (!v) return null;
          const raw = String(v);
          const labelAndColor = (() => {
            let label = raw;
            let color: string | undefined = undefined;
            if (f.type === "select") {
              if (Array.isArray(f.options) && f.options.length > 0) {
                const opt = (f.options as Option[]).find(
                  (o) => String(o.id) === raw,
                );
                if (opt) {
                  label = opt.label || raw;
                  color = opt.color as string | undefined;
                } else if (raw.includes("|")) {
                  const parts = raw.split("|");
                  label = parts[0] || raw;
                  color = parts[1] || undefined;
                }
              } else if (raw.includes("|")) {
                const parts = raw.split("|");
                label = parts[0] || raw;
                color = parts[1] || undefined;
              }
            }
            return { label, color };
          })();

          const chipStyle = computeChipColors(
            f.type === "select"
              ? labelAndColor.color
              : (f as unknown as { color?: string }).color,
          );

          if (f.type === "number") {
            return (
              <div
                key={f.id}
                className="kb-field-chip"
                style={chipStyle}
                title={`${f.name}: ${String(v)}`}
              >
                <span>{String(v)}</span>
              </div>
            );
          }

          if (f.type === "date") {
            try {
              const d = new Date(String(v));
              const formattedDate = d.toLocaleDateString();
              return (
                <div
                  key={f.id}
                  className="kb-field-chip"
                  style={chipStyle}
                  title={`${f.name}: ${formattedDate}`}
                >
                  <span>{formattedDate}</span>
                </div>
              );
            } catch {
              return null;
            }
          }

          if (f.type === "select") {
            return (
              <div
                key={f.id}
                className="kb-field-chip flex items-center"
                style={chipStyle}
                title={`${f.name}: ${labelAndColor.label}`}
              >
                {labelAndColor.color && (
                  <span
                    className="kb-field-swatch"
                    style={{
                      background: labelAndColor.color,
                      borderColor: chipStyle.borderColor as string,
                    }}
                  />
                )}
                <span className="kb-field-label">{labelAndColor.label}</span>
              </div>
            );
          }

          return (
            <div
              key={f.id}
              className="kb-field-chip"
              style={chipStyle}
              title={`${f.name}: ${String(v)}`}
            >
              <span>{String(v)}</span>
            </div>
          );
        })}
      </div>

      <div
        className="kb-card-resize-handle"
        onPointerDown={startResize}
        role="separator"
        aria-orientation="horizontal"
        title={tr("kanban.resizeCard", "Resize card")}
      />
    </div>
  );
}
