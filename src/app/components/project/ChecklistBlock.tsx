"use client";

import {
  memo,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useLayoutEffect,
} from "react";
import { Check, Plus, Trash2, GripVertical } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { BlockFooter } from "./BlockFooter";
import { useTouch } from "@providers/TouchProvider";
import { useTouchGestures } from "./hooks/useTouchGestures";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import { BlockData } from "./CanvasBlock";
import "./checklist-block.css";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import { parseChecklistMetadata, parseJsonRecord } from "@lib/metadata-parsers";

type ChecklistBlockProps = NodeProps<Node<BlockData>> & {
  isReadOnly?: boolean;
};

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  depth?: number;
}

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

const ChecklistBlock = memo(({ id, data, selected }: ChecklistBlockProps) => {
  const { dict, lang } = useI18n();
  const { rippleRef } = useTouch();
  const { setNodes, getNode, getEdges } = useReactFlow();

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

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
    canReact,
  });

  const isBeingMoved = !!data.movingUserColor;
  const borderColor = isBeingMoved ? data.movingUserColor : "var(--border)";

  const [title, setTitle] = useState(data.title || "");
  const [, setIsDragOverContainer] = useState(false);
  const dragCounter = useRef(0);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [dragTaskPreview, setDragTaskPreview] = useState<{
    text: string;
    checked: boolean;
    depth: number;
  } | null>(null);
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);

  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title]);

  // Blur inputs when block is deselected
  useEffect(() => {
    if (!selected) {
      // Find any active element within this block and blur it
      const activeElement = document.activeElement;
      const blockElement = document.querySelector(
        `.block-card[data-id="${id}"]`,
      );
      if (
        activeElement &&
        blockElement &&
        blockElement.contains(activeElement)
      ) {
        (activeElement as HTMLElement).blur();
      }
    }
  }, [selected, id]);

  const items: ChecklistItem[] = useMemo(() => {
    return parseChecklistMetadata(data.metadata).items as ChecklistItem[];
  }, [data.metadata]);

  const total = items.length;
  const completed = items.filter((i) => i.checked).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const status =
    percentage === 100 ? "complete" : percentage > 0 ? "in-progress" : "idle";

  const onLongPress = useCallback((e: React.TouchEvent | TouchEvent) => {
    const target = e.target as HTMLElement;
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX:
        "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX,
      clientY:
        "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY,
    });
    target.dispatchEvent(event);
  }, []);

  const touchHandlers = useTouchGestures({
    rippleRef,
    onLongPress,
  });

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isReadOnly) return;
      const newTitle = e.target.value;
      setTitle(newTitle);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;

      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        data.metadata,
        newTitle,
        data.reactions,
      );
    },
    [id, data, currentUser, dict],
  );

  const updateItems = useCallback(
    (newItems: ChecklistItem[]) => {
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;

      const meta = parseChecklistMetadata(data.metadata);

      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        JSON.stringify({ ...meta, items: newItems }),
        title,
        data.reactions,
      );
    },
    [id, data, currentUser, dict, title],
  );

  const handleAddItem = useCallback(
    (afterIndex: number = -1, depth: number = 0) => {
      if (isReadOnly) return;
      const newItem: ChecklistItem = {
        id: crypto.randomUUID(),
        text: "",
        checked: false,
        depth,
      };

      let newItems;
      if (afterIndex === -1) {
        newItems = [...items, newItem];
      } else {
        newItems = [...items];
        newItems.splice(afterIndex + 1, 0, newItem);
      }

      updateItems(newItems);
    },
    [items, updateItems, isReadOnly],
  );

  const handleToggleItem = useCallback(
    (itemId: string) => {
      if (isReadOnly) return;
      const newItems = items.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item,
      );
      updateItems(newItems);
    },
    [items, updateItems, isReadOnly],
  );

  const handleChangeItemText = useCallback(
    (itemId: string, text: string) => {
      if (isReadOnly) return;
      const newItems = items.map((item) =>
        item.id === itemId ? { ...item, text } : item,
      );
      updateItems(newItems);
    },
    [items, updateItems, isReadOnly],
  );

  const handleChangeItemDepth = useCallback(
    (itemId: string, delta: number) => {
      if (isReadOnly) return;
      const index = items.findIndex((i) => i.id === itemId);
      if (index === -1) return;

      const item = items[index];
      const newDepth = Math.max(0, (item.depth || 0) + delta);

      // Constraint: Cannot indent deeper than previous item + 1
      if (delta > 0 && index > 0) {
        const prevItem = items[index - 1];
        if (newDepth > (prevItem.depth || 0) + 1) return;
      } else if (delta > 0 && index === 0) {
        // Cannot indent first item
        return;
      }

      const newItems = [...items];
      newItems[index] = { ...item, depth: newDepth };
      updateItems(newItems);
    },
    [items, updateItems, isReadOnly],
  );

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      if (isReadOnly) return;
      const newItems = items.filter((item) => item.id !== itemId);
      updateItems(newItems);
    },
    [items, updateItems, isReadOnly],
  );

  const handleItemKeyDown = useCallback(
    (e: React.KeyboardEvent, itemId: string, index: number) => {
      if (isReadOnly) return;

      if (e.key === "Escape") {
        e.preventDefault();
        (e.target as HTMLElement).blur();
        return;
      }

      if (e.key === "Enter") {
        if (e.shiftKey) return;
        e.stopPropagation();
        return;
      }

      const currentItem = items[index];
      if (currentItem == null) return;

      if (e.key === "Backspace" && currentItem.text === "") {
        e.preventDefault();
        handleDeleteItem(itemId);
        // Focus previous
        if (index > 0) {
          const prevInput = document.querySelector(
            `[data-item-index="${index - 1}"] textarea`,
          ) as HTMLTextAreaElement;
          prevInput?.focus();
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();

        if (e.shiftKey) {
          // Shift + Tab: Outdent OR Focus Previous
          // First check if we can outdent
          const currentDepth = currentItem.depth || 0;
          if (currentDepth > 0) {
            handleChangeItemDepth(itemId, -1);
          } else {
            // If already at depth 0, standard Shift+Tab behavior (Focus Previous)
            if (index > 0) {
              const prevInput = document.querySelector(
                `[data-item-index="${index - 1}"] textarea`,
              ) as HTMLTextAreaElement;
              prevInput?.focus();
            }
          }
        } else {
          handleChangeItemDepth(itemId, 1);
        }
      } else if (e.key === "ArrowUp") {
        if (index > 0) {
          e.preventDefault();
          const prevInput = document.querySelector(
            `[data-item-index="${index - 1}"] textarea`,
          ) as HTMLTextAreaElement;
          prevInput?.focus();
        }
      } else if (e.key === "ArrowDown") {
        if (index < items.length - 1) {
          e.preventDefault();
          const nextInput = document.querySelector(
            `[data-item-index="${index + 1}"] textarea`,
          ) as HTMLTextAreaElement;
          nextInput?.focus();
        } else {
          e.preventDefault();
          const currentDepth = currentItem.depth || 0;
          handleAddItem(index, currentDepth);
          setTimeout(() => {
            const nextInput = document.querySelector(
              `[data-item-index="${index + 1}"] textarea`,
            ) as HTMLTextAreaElement;
            nextInput?.focus();
          }, 10);
        }
      }
    },
    [items, isReadOnly, handleAddItem, handleDeleteItem, handleChangeItemDepth],
  );

  const clearDragPreview = () => {
    setDragTaskPreview(null);
    setDropTargetIndex(null);
    setDragSourceIndex(null);
  };

  const syncDragPreviewFromEvent = (e: React.DragEvent): boolean => {
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return false;

    try {
      const parsed = JSON.parse(raw) as {
        kind?: string;
        text?: unknown;
        checked?: unknown;
        depth?: unknown;
      };

      if (parsed.kind === "checklist-item" || parsed.kind === "kanban-task") {
        setDragTaskPreview({
          text:
            typeof parsed.text === "string"
              ? parsed.text
              : dict.blocks.taskPlaceholder || "Task",
          checked: Boolean(parsed.checked),
          depth: typeof parsed.depth === "number" ? parsed.depth : 0,
        });
        return true;
      }
    } catch {
      return false;
    }

    return false;
  };

  // Drag and Drop Handlers
  const handleDragStart = (
    e: React.DragEvent,
    item: ChecklistItem,
    index: number,
  ) => {
    if (isReadOnly) return;
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        kind: "checklist-item",
        itemId: item.id,
        sourceBlockId: id,
        text: item.text,
        checked: item.checked,
        depth: item.depth || 0,
      }),
    );
    e.dataTransfer.effectAllowed = "move";
    setDragTaskPreview({
      text: item.text,
      checked: item.checked,
      depth: item.depth || 0,
    });
    setDragSourceIndex(index);

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
    dragImage.textContent = `${item.checked ? "☑" : "☐"} ${item.text}`;
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragEnd = () => {
    clearDragPreview();
    setIsDragOverContainer(false);
    dragCounter.current = 0;
  };

  useEffect(() => {
    const handleGlobalDragReset = () => {
      clearDragPreview();
      setIsDragOverContainer(false);
      dragCounter.current = 0;
    };

    window.addEventListener("drop", handleGlobalDragReset);
    window.addEventListener("dragend", handleGlobalDragReset);

    return () => {
      window.removeEventListener("drop", handleGlobalDragReset);
      window.removeEventListener("dragend", handleGlobalDragReset);
    };
  }, []);

  const handleContainerDragOver = (e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();

    const hasValidPayload = syncDragPreviewFromEvent(e);
    if (!hasValidPayload && !dragTaskPreview) return;

    const container = e.currentTarget as HTMLElement;
    const itemElements = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".checklist-item[data-item-index]",
      ),
    );

    let insertionIndex = items.length;
    const deadZone = 8;

    for (const el of itemElements) {
      const idxStr = el.dataset.itemIndex;
      if (typeof idxStr !== "string") continue;
      const idx = Number(idxStr);
      if (Number.isNaN(idx)) continue;

      const rect = el.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const distance = Math.abs(e.clientY - midpoint);

      if (distance <= deadZone) {
        const currentIndex = dropTargetIndex;
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

    const boundedIndex = Math.max(0, Math.min(insertionIndex, items.length));
    setDropTargetIndex((prev) => (prev === boundedIndex ? prev : boundedIndex));
    e.dataTransfer.dropEffect = "move";
  };

  const handleContainerDragEnter = (e: React.DragEvent) => {
    if (isReadOnly) return;
    e.preventDefault();
    syncDragPreviewFromEvent(e);
    dragCounter.current += 1;
    if (dragCounter.current === 1) {
      setIsDragOverContainer(true);
    }
  };

  const handleContainerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragOverContainer(false);
      setDropTargetIndex(null);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent, targetIndex: number) => {
      if (isReadOnly) return;
      e.preventDefault();
      e.stopPropagation();
      clearDragPreview();
      setIsDragOverContainer(false);
      dragCounter.current = 0;

      try {
        const dataStr = e.dataTransfer.getData("application/json");
        if (!dataStr) return;

        const parsed = JSON.parse(dataStr) as {
          kind?: string;
          itemId?: string;
          sourceBlockId?: string;
          sourceColumnId?: string;
          text?: string;
          checked?: boolean;
          depth?: number;
        };

        if (
          parsed.kind &&
          parsed.kind !== "checklist-item" &&
          parsed.kind !== "kanban-task"
        ) {
          return;
        }

        if (typeof parsed.itemId !== "string") return;
        if (typeof parsed.sourceBlockId !== "string") return;

        const itemId = parsed.itemId;
        const sourceBlockId = parsed.sourceBlockId;
        const sourceColumnId =
          typeof parsed.sourceColumnId === "string"
            ? parsed.sourceColumnId
            : undefined;
        const checked = Boolean(parsed.checked);
        const depth = typeof parsed.depth === "number" ? parsed.depth : 0;

        let text = typeof parsed.text === "string" ? parsed.text : "";

        if (!text) {
          const sourceNode = getNode(sourceBlockId);
          if (sourceNode?.data) {
            const sourceData = sourceNode.data as BlockData;
            if (sourceData.blockType === "kanban") {
              const sourceMeta = parseJsonRecord(sourceData.metadata);
              const sourceColumns = Array.isArray(sourceMeta.columns)
                ? sourceMeta.columns
                : [];

              for (const col of sourceColumns) {
                if (
                  sourceColumnId &&
                  typeof col?.id === "string" &&
                  col.id !== sourceColumnId
                ) {
                  continue;
                }
                const tasks = Array.isArray(col?.tasks) ? col.tasks : [];
                const task = tasks.find(
                  (t: { id?: string }) => t.id === itemId,
                );
                if (task && typeof task.text === "string") {
                  text = task.text;
                  break;
                }
              }
            }
          }
        }

        if (sourceBlockId === id) {
          // Reorder locally
          const oldIndex = items.findIndex((i) => i.id === itemId);
          if (oldIndex === -1) return;

          if (oldIndex === targetIndex || oldIndex + 1 === targetIndex) {
            return;
          }

          const newItems = [...items];
          const [movedItem] = newItems.splice(oldIndex, 1);
          const adjustedTargetIndex =
            oldIndex < targetIndex ? targetIndex - 1 : targetIndex;
          newItems.splice(adjustedTargetIndex, 0, movedItem);
          updateItems(newItems);
        } else {
          // Cross-block move
          // 1. Add to this block
          const newItem: ChecklistItem = {
            id: itemId, // Keep ID or generate new? Keeping ID is fine unless conflicts.
            text,
            checked,
            depth: depth || 0,
          };

          const newItems = [...items];
          newItems.splice(targetIndex, 0, newItem);
          updateItems(newItems);

          // 2. Remove from source block
          const sourceNode = getNode(sourceBlockId);
          if (sourceNode && sourceNode.data) {
            const sourceData = sourceNode.data as BlockData;
            if (sourceData.blockType === "kanban") {
              const sourceMeta = parseJsonRecord(sourceData.metadata);

              const sourceColumns = Array.isArray(sourceMeta.columns)
                ? sourceMeta.columns
                : [];

              const newSourceColumns = sourceColumns.map(
                (col: { id?: string; tasks?: ChecklistItem[] }) => {
                  if (sourceColumnId && col.id !== sourceColumnId) {
                    return col;
                  }
                  const tasks = Array.isArray(col.tasks) ? col.tasks : [];
                  return {
                    ...col,
                    tasks: tasks.filter((t: ChecklistItem) => t.id !== itemId),
                  };
                },
              );

              data.onContentChange?.(
                sourceBlockId,
                sourceData.content,
                new Date().toISOString(),
                currentUser?.displayName || "Anonymous",
                JSON.stringify({ ...sourceMeta, columns: newSourceColumns }),
                sourceData.title,
                sourceData.reactions,
              );
            } else {
              const sourceMeta = parseChecklistMetadata(sourceData.metadata);

              const sourceItems = sourceMeta.items;
              const newSourceItems = sourceItems.filter(
                (i: ChecklistItem) => i.id !== itemId,
              );

              data.onContentChange?.(
                sourceBlockId,
                sourceData.content,
                new Date().toISOString(),
                currentUser?.displayName || "Anonymous",
                JSON.stringify({ ...sourceMeta, items: newSourceItems }),
                sourceData.title,
                sourceData.reactions,
              );
            }
          }
        }
      } catch (err) {
        console.error("Drop failed", err);
      }
    },
    [id, items, updateItems, isReadOnly, getNode, data, currentUser],
  );

  const handleResize = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                width: Math.round(params.width),
                height: Math.round(params.height),
                position: {
                  x: Math.round(params.x),
                  y: Math.round(params.y),
                },
              }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const handleResizeEnd = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const { width, height, x, y } = params;
      data.onResizeEnd?.(id, { width, height, x, y });
    },
    [data, id],
  );

  const edges = getEdges();
  const isHandleConnected = (handleId: string) =>
    edges.some(
      (e) =>
        (e.source === id && e.sourceHandle === handleId) ||
        (e.target === id && e.targetHandle === handleId),
    );

  const isLeftSourceConnected = isHandleConnected("left");
  const isRightSourceConnected = isHandleConnected("right");
  const isTopSourceConnected = isHandleConnected("top");
  const isBottomSourceConnected = isHandleConnected("bottom");

  return (
    <div
      className={`block-card block-type-checklist ${
        selected ? "selected" : ""
      } ${isBeingMoved ? "is-moving" : ""} ${isReadOnly ? "read-only" : ""} ${
        total > 0 ? "has-progress" : ""
      } flex flex-col p-0!`}
      style={
        {
          "--block-border-color": borderColor,
          "--checklist-accent-color":
            percentage === 100
              ? "var(--accent)"
              : percentage > 0
                ? "var(--warning)"
                : "var(--border)",
        } as React.CSSProperties
      }
      {...touchHandlers}
    >
      <CustomNodeResizer
        minWidth={250}
        minHeight={180}
        isVisible={!isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit]">
        <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
          <div className="flex items-center gap-2">
            <Check size={16} />
            <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
              {dict.blocks.blockTypeChecklist || "Checklist"}
            </span>
            {total > 0 && (
              <div
                className={`checklist-progress-badge checklist-progress-${status}`}
              >
                {status === "complete"
                  ? dict.blocks.checklistComplete
                  : dict.blocks.checklistProgress
                      .replace("{completed}", completed.toString())
                      .replace("{total}", total.toString())}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <input
              value={title}
              onChange={handleTitleChange}
              className="block-title"
              placeholder={dict.blocks.title || "..."}
              readOnly={isReadOnly}
            />
          </div>
        </div>

        {total > 0 && (
          <div className="checklist-progress-bar">
            <div
              className="checklist-progress-fill"
              style={{
                width: `${percentage}%`,
                backgroundColor:
                  percentage === 100 ? "var(--accent)" : "var(--warning)",
              }}
            />
          </div>
        )}

        <div className="block-content flex-1 flex flex-col min-h-0">
          <div
            className="checklist-block-container nowheel nodrag h-full"
            onDragOver={handleContainerDragOver}
            onDragEnter={handleContainerDragEnter}
            onDragLeave={handleContainerDragLeave}
            onDrop={(e) => handleDrop(e, dropTargetIndex ?? total)}
          >
            {items.map((item, index) => (
              <div key={item.id}>
                {dragTaskPreview &&
                  dropTargetIndex === index &&
                  dragSourceIndex !== null &&
                  !(
                    dragSourceIndex === index || dragSourceIndex + 1 === index
                  ) && (
                    <div
                      className="checklist-item checklist-item-placeholder"
                      style={{
                        paddingLeft: `${(dragTaskPreview.depth || 0) * 24}px`,
                      }}
                      aria-hidden="true"
                    >
                      {!isReadOnly && (
                        <div className="checklist-drag-handle">
                          <GripVertical size={12} />
                        </div>
                      )}
                      <button
                        type="button"
                        className={`checklist-checkbox ${
                          dragTaskPreview.checked ? "checked" : ""
                        }`}
                        tabIndex={-1}
                      >
                        {dragTaskPreview.checked && (
                          <Check size={10} strokeWidth={4} />
                        )}
                      </button>
                      <div
                        className="checklist-placeholder-text"
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          fontSize: "0.875rem",
                          color: "var(--text-main)",
                        }}
                      >
                        {dragTaskPreview.text ||
                          dict.blocks.taskPlaceholder ||
                          "Task"}
                      </div>
                    </div>
                  )}
                <div
                  className={`checklist-item group ${
                    dragSourceIndex === index ? "is-dragging" : ""
                  }`}
                  draggable={!isReadOnly}
                  onDragStart={(e) => handleDragStart(e, item, index)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, dropTargetIndex ?? index)}
                  style={{ paddingLeft: `${(item.depth || 0) * 24}px` }}
                  data-item-index={index}
                >
                  {!isReadOnly && (
                    <div
                      className="checklist-drag-handle"
                      title={dict.common?.dragToReorder || "Drag to reorder"}
                    >
                      <GripVertical size={12} />
                    </div>
                  )}
                  <button
                    className={`checklist-checkbox ${
                      item.checked ? "checked" : ""
                    }`}
                    onClick={() => !isReadOnly && handleToggleItem(item.id)}
                  >
                    {item.checked && <Check size={10} strokeWidth={4} />}
                  </button>
                  <AutoResizeTextarea
                    value={item.text}
                    onChange={(e) =>
                      handleChangeItemText(item.id, e.target.value)
                    }
                    className={`checklist-input ${
                      item.checked ? "checked" : ""
                    }`}
                    placeholder={dict.blocks.taskPlaceholder || "Task..."}
                    readOnly={isReadOnly}
                    onKeyDown={(e) => handleItemKeyDown(e, item.id, index)}
                  />
                  {!isReadOnly && (
                    <button
                      className="checklist-delete-btn"
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {dragTaskPreview &&
              dropTargetIndex === items.length &&
              dragSourceIndex !== null &&
              dragSourceIndex !== items.length - 1 && (
                <div
                  className="checklist-item checklist-item-placeholder"
                  style={{
                    paddingLeft: `${(dragTaskPreview.depth || 0) * 24}px`,
                  }}
                  aria-hidden="true"
                >
                  {!isReadOnly && (
                    <div className="checklist-drag-handle">
                      <GripVertical size={12} />
                    </div>
                  )}
                  <button
                    type="button"
                    className={`checklist-checkbox ${
                      dragTaskPreview.checked ? "checked" : ""
                    }`}
                    tabIndex={-1}
                  >
                    {dragTaskPreview.checked && (
                      <Check size={10} strokeWidth={4} />
                    )}
                  </button>
                  <div
                    className="checklist-placeholder-text"
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      fontSize: "0.875rem",
                      color: "var(--text-main)",
                    }}
                  >
                    {dragTaskPreview.text ||
                      dict.blocks.taskPlaceholder ||
                      "Task"}
                  </div>
                </div>
              )}

            {!isReadOnly && (
              <button
                className="checklist-add-button"
                onClick={() => handleAddItem()}
                title={dict.blocks.addTask || "Add task"}
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        </div>

        <BlockFooter
          updatedAt={data.updatedAt}
          authorName={data.authorName}
          isLocked={isLocked}
          dict={dict}
          lang={lang}
        />
      </div>

      <BlockReactions
        reactions={data.reactions}
        onReact={handleReact}
        onRemoveReaction={handleRemoveReaction}
        currentUserId={currentUser?.id}
        isReadOnly={isReadOnly}
        canReact={canReact}
      />

      {/* Handles - Left Side */}
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={true}
        className="block-handle block-handle-left z-50!"
      >
        {!isLeftSourceConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Right Side */}
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={true}
        className="block-handle block-handle-right z-50!"
      >
        {!isRightSourceConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Top Side */}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={true}
        className="block-handle block-handle-top z-50!"
      >
        {!isTopSourceConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Bottom Side */}
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={true}
        className="block-handle block-handle-bottom z-50!"
      >
        {!isBottomSourceConnected && <div className="handle-dot" />}
      </Handle>
    </div>
  );
});

ChecklistBlock.displayName = "ChecklistBlock";

export default ChecklistBlock;
