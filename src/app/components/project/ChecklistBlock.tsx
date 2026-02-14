"use client";

import { memo, useState, useCallback, useMemo, useEffect } from "react";
import { Check, Plus, Trash2, Lock } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useTouch } from "@providers/TouchProvider";
import { useTouchGestures } from "./hooks/useTouchGestures";
import {
  Handle,
  Position,
  NodeResizer,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import { BlockData } from "./CanvasBlock";
import { DEFAULT_BLOCK_WIDTH, DEFAULT_BLOCK_HEIGHT } from "./utils/constants";
import "./checklist-block.css";

type ChecklistBlockProps = NodeProps<Node<BlockData>> & {
  isReadOnly?: boolean;
};

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

const ChecklistBlock = memo(({ id, data, selected }: ChecklistBlockProps) => {
  const { dict, lang } = useI18n();
  const { rippleRef } = useTouch();
  const { setNodes, getNode, getEdges } = useReactFlow();

  const [title, setTitle] = useState(data.title || "");

  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title]);

  const items: ChecklistItem[] = useMemo(() => {
    if (!data.metadata) return [];
    try {
      const meta =
        typeof data.metadata === "string"
          ? JSON.parse(data.metadata)
          : data.metadata;
      return Array.isArray(meta.items) ? meta.items : [];
    } catch {
      return [];
    }
  }, [data.metadata]);

  const { total, completed, percentage, status } = useMemo(() => {
    const total = items.length;
    const completed = items.filter((item) => item.checked).length;
    const percentage = total > 0 ? (completed / total) * 100 : 0;

    let status = "empty";
    if (total === 0) status = "empty";
    else if (percentage === 100) status = "complete";
    else if (percentage > 0) status = "in-progress";
    else status = "not-started";

    return { total, completed, percentage, status };
  }, [items]);

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const isPreviewMode = data.isPreviewMode;
  const isLocked = data.isLocked;

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;
  const isReadOnly =
    isPreviewMode || (isLocked ? !isOwner && !isProjectOwner : false);

  const isBeingMoved = !!data.movingUserColor;
  const borderColor = isBeingMoved ? data.movingUserColor : "var(--border)";

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

      const meta =
        typeof data.metadata === "string"
          ? JSON.parse(data.metadata || "{}")
          : data.metadata || {};

      data.onContentChange?.(
        id,
        data.content, // content is unused for checklist, we use metadata
        now,
        editor,
        JSON.stringify({ ...meta, items: newItems }),
        title,
      );
    },
    [id, data, currentUser, dict, title],
  );

  const handleAddItem = useCallback(() => {
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      text: "",
      checked: false,
    };
    updateItems([...items, newItem]);
  }, [items, updateItems]);

  const handleToggleItem = useCallback(
    (itemId: string) => {
      const newItems = items.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item,
      );
      updateItems(newItems);
    },
    [items, updateItems],
  );

  const handleChangeItemText = useCallback(
    (itemId: string, text: string) => {
      const newItems = items.map((item) =>
        item.id === itemId ? { ...item, text } : item,
      );
      updateItems(newItems);
    },
    [items, updateItems],
  );

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      const newItems = items.filter((item) => item.id !== itemId);
      updateItems(newItems);
    },
    [items, updateItems],
  );

  const formatDate = (isoString: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };

    const formatted = new Intl.DateTimeFormat(
      lang === "fr" ? "fr-FR" : "en-US",
      options,
    ).format(date);

    return formatted.replace(",", "").replace(" ", ` ${dict.project.at} `);
  };

  const handleResize = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const { width, height, x, y } = params;

      const snapW =
        Math.abs(width - DEFAULT_BLOCK_WIDTH) <= DEFAULT_BLOCK_WIDTH * 0.1;
      const snapH =
        Math.abs(height - DEFAULT_BLOCK_HEIGHT) <= DEFAULT_BLOCK_HEIGHT * 0.1;

      const finalWidth = snapW ? DEFAULT_BLOCK_WIDTH : Math.round(width);
      const finalHeight = snapH ? DEFAULT_BLOCK_HEIGHT : Math.round(height);

      const currentBlock = getNode(id);
      if (!currentBlock) return;

      let finalX = Math.round(x);
      let finalY = Math.round(y);

      if (snapW && Math.abs(x - currentBlock.position.x) > 0.1) {
        finalX = Math.round(x + width - DEFAULT_BLOCK_WIDTH);
      }
      if (snapH && Math.abs(y - currentBlock.position.y) > 0.1) {
        finalY = Math.round(y + height - DEFAULT_BLOCK_HEIGHT);
      }

      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                width: finalWidth,
                height: finalHeight,
                position: { x: finalX, y: finalY },
              }
            : n,
        ),
      );
    },
    [id, getNode, setNodes],
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

  const isLeftTargetConnected = isHandleConnected("left-target");
  const isLeftSourceConnected = isHandleConnected("left");
  const isRightTargetConnected = isHandleConnected("right-target");
  const isRightSourceConnected = isHandleConnected("right");
  const isTopTargetConnected = isHandleConnected("top-target");
  const isTopSourceConnected = isHandleConnected("top");
  const isBottomTargetConnected = isHandleConnected("bottom-target");
  const isBottomSourceConnected = isHandleConnected("bottom");

  return (
    <div
      className={`block-card block-type-checklist ${
        selected ? "selected" : ""
      } ${isBeingMoved ? "is-moving" : ""} ${isReadOnly ? "read-only" : ""} ${
        total > 0 ? "has-progress" : ""
      } flex flex-col !p-0`}
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
      <NodeResizer
        minWidth={250}
        minHeight={150}
        isVisible={selected && !isReadOnly}
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
            <span className="text-tiny uppercase tracking-wider opacity-50 font-bold">
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
          <div className="flex items-center gap-2">
            <input
              value={title}
              onChange={handleTitleChange}
              className="block-title"
              placeholder="..."
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
          <div className="checklist-block-container nowheel nodrag h-full">
            {items.map((item) => (
              <div key={item.id} className="checklist-item">
                <button
                  className={`checklist-checkbox ${
                    item.checked ? "checked" : ""
                  }`}
                  onClick={() => !isReadOnly && handleToggleItem(item.id)}
                >
                  {item.checked && <Check size={10} strokeWidth={4} />}
                </button>
                <input
                  type="text"
                  value={item.text}
                  onChange={(e) =>
                    handleChangeItemText(item.id, e.target.value)
                  }
                  className={`checklist-input ${item.checked ? "checked" : ""}`}
                  placeholder={dict.blocks.taskPlaceholder || "Task..."}
                  readOnly={isReadOnly}
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
            ))}

            {!isReadOnly && (
              <button
                className="checklist-add-button"
                onClick={handleAddItem}
                title={dict.blocks.addTask || "Add task"}
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="block-author-container mt-2 pt-3 px-4 pb-3">
          <div className="flex items-center justify-between w-full text-tiny opacity-40">
            <div className="block-timestamp">
              {formatDate(data.updatedAt || "")}
            </div>
            <div className="block-author-info flex items-center gap-1.5">
              {isLocked && <Lock size={10} className="block-lock-icon" />}
              <div className="author-name">
                {(data.authorName || dict.project.anonymous).toLowerCase()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Handles - Left Side */}
      <Handle
        id="left-target"
        type="source"
        position={Position.Left}
        isConnectable={true}
        className="block-handle block-handle-left !z-50 !top-[40%]"
      >
        {!isLeftTargetConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={true}
        className="block-handle block-handle-left !z-50 !top-[60%]"
      >
        {!isLeftSourceConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Right Side */}
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={true}
        className="block-handle block-handle-right !z-50 !top-[40%]"
      >
        {!isRightSourceConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="right-target"
        type="source"
        position={Position.Right}
        isConnectable={true}
        className="block-handle block-handle-right !z-50 !top-[60%]"
      >
        {!isRightTargetConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Top Side */}
      <Handle
        id="top-target"
        type="source"
        position={Position.Top}
        isConnectable={true}
        className="block-handle block-handle-top !z-50 !left-[40%]"
      >
        {!isTopTargetConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={true}
        className="block-handle block-handle-top !z-50 !left-[60%]"
      >
        {!isTopSourceConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Bottom Side */}
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={true}
        className="block-handle block-handle-bottom !z-50 !left-[60%]"
      >
        {!isBottomSourceConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="bottom-target"
        type="source"
        position={Position.Bottom}
        isConnectable={true}
        className="block-handle block-handle-bottom !z-50 !left-[40%]"
      >
        {!isBottomTargetConnected && <div className="handle-dot" />}
      </Handle>
    </div>
  );
});

ChecklistBlock.displayName = "ChecklistBlock";

export default ChecklistBlock;
