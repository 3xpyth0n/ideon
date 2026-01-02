"use client";

import { memo, useCallback, useMemo } from "react";
import { Check, Plus, Trash2, Lock } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
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
  const { setNodes, getNode, getEdges } = useReactFlow();

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

  const updateItems = useCallback(
    (newItems: ChecklistItem[]) => {
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.common.anonymous;

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
        data.title,
      );
    },
    [id, data, currentUser, dict],
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

    return formatted.replace(",", "").replace(" ", ` ${dict.common.at} `);
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
  const isLeftConnected = edges.some(
    (e) =>
      (e.target === id &&
        (e.targetHandle === "left" || e.targetHandle === "left-target")) ||
      (e.source === id && e.sourceHandle === "left"),
  );
  const isRightConnected = edges.some(
    (e) =>
      (e.source === id && e.sourceHandle === "right") ||
      (e.target === id &&
        (e.targetHandle === "right" || e.targetHandle === "right-target")),
  );

  return (
    <div
      className={`block-card block-type-checklist ${
        selected ? "selected" : ""
      } ${isBeingMoved ? "is-moving" : ""} ${
        isReadOnly ? "read-only" : ""
      } flex flex-col !p-0`}
      style={{ "--block-border-color": borderColor } as React.CSSProperties}
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

      <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
        <div className="flex items-center gap-2">
          <Check size={16} />
          <span className="text-tiny uppercase tracking-wider opacity-50 font-bold">
            {dict.common.blockTypeChecklist || "Checklist"}
          </span>
        </div>
      </div>

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
                onChange={(e) => handleChangeItemText(item.id, e.target.value)}
                className={`checklist-input ${item.checked ? "checked" : ""}`}
                placeholder={dict.common.taskPlaceholder || "Task..."}
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
              title={dict.common.addTask || "Add task"}
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
              {(data.authorName || dict.common.anonymous).toLowerCase()}
            </div>
          </div>
        </div>
      </div>

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={true}
        className="block-handle block-handle-left !z-50"
      >
        {!isLeftConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={true}
        className="block-handle block-handle-right !z-50"
      >
        {!isRightConnected && <div className="handle-dot" />}
      </Handle>
    </div>
  );
});

ChecklistBlock.displayName = "ChecklistBlock";

export default ChecklistBlock;
