"use client";

import { memo, useState, useCallback, useMemo, useEffect } from "react";
import { Plus, Trash2, Palette, Lock } from "lucide-react";
import { toast } from "sonner";
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
import ColorPicker from "./ColorPicker";
import "./palette-block.css";

type PaletteBlockProps = NodeProps<Node<BlockData>> & {
  isReadOnly?: boolean;
};

interface PaletteMetadata {
  colors: string[];
}

const PaletteBlock = memo(({ id, data, selected }: PaletteBlockProps) => {
  const { dict, lang } = useI18n();
  const { setNodes, getNode, getEdges } = useReactFlow();
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<
    { x: number; y: number } | undefined
  >(undefined);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Close picker when block loses selection
  useEffect(() => {
    if (!selected) {
      setShowPicker(false);
      setEditingIndex(null);
    }
  }, [selected]);

  // Title state
  const [title, setTitle] = useState(data.title || "");

  // Sync title from data if it changes externally
  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title]);

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

  const metadata = useMemo((): PaletteMetadata => {
    if (!data.metadata) return { colors: [] };
    try {
      const parsed =
        typeof data.metadata === "string"
          ? JSON.parse(data.metadata)
          : data.metadata;
      return {
        colors: Array.isArray(parsed?.colors) ? parsed.colors : [],
      };
    } catch {
      return { colors: [] };
    }
  }, [data.metadata]);

  const updatePalette = useCallback(
    (newColors: string[]) => {
      if (isReadOnly) return;
      const newMetadata = { ...metadata, colors: newColors };
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.common.anonymous;

      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        JSON.stringify(newMetadata),
        title,
      );
    },
    [id, data, metadata, isReadOnly, currentUser, dict, title],
  );

  const addColor = useCallback(
    (color: string) => {
      updatePalette([...metadata.colors, color]);
      setShowPicker(false);
    },
    [metadata.colors, updatePalette],
  );

  const removeColor = useCallback(
    (index: number) => {
      const newColors = [...metadata.colors];
      newColors.splice(index, 1);
      updatePalette(newColors);
    },
    [metadata.colors, updatePalette],
  );

  const handleColorClick = useCallback(
    (color: string) => {
      navigator.clipboard.writeText(color);
      toast.success(dict.common.copiedToClipboard || "Copied to clipboard");
    },
    [dict],
  );

  const handleEditColor = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isReadOnly) return;
      setEditingIndex(index);
      setPickerPosition({ x: e.clientX, y: e.clientY });
      setShowPicker(true);
    },
    [isReadOnly],
  );

  const handleUpdateColor = useCallback(
    (color: string) => {
      if (editingIndex !== null) {
        const newColors = [...metadata.colors];
        newColors[editingIndex] = color;
        updatePalette(newColors);
      } else {
        addColor(color);
      }
      setShowPicker(false);
      setEditingIndex(null);
    },
    [editingIndex, metadata.colors, updatePalette, addColor],
  );

  const handleBackgroundClick = useCallback(() => {
    setShowPicker(false);
    setEditingIndex(null);
  }, []);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.common.anonymous;

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
  const isLeftTargetConnected = edges.some(
    (e) =>
      e.target === id &&
      (e.targetHandle === "left" || e.targetHandle === "left-target"),
  );
  const isLeftSourceConnected = edges.some(
    (e) =>
      e.source === id &&
      (e.sourceHandle === "left" || e.sourceHandle === "left-source"),
  );
  const isRightTargetConnected = edges.some(
    (e) =>
      e.target === id &&
      (e.targetHandle === "right" || e.targetHandle === "right-target"),
  );
  const isRightSourceConnected = edges.some(
    (e) =>
      e.source === id &&
      (e.sourceHandle === "right" || e.sourceHandle === "right-source"),
  );

  return (
    <div
      className={`block-card ${selected ? "selected" : ""} ${
        isBeingMoved ? "is-moving" : ""
      } ${isReadOnly ? "read-only" : ""} flex flex-col !p-0`}
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
          <Palette size={16} />
          <span className="text-tiny uppercase tracking-wider opacity-50 font-bold">
            {dict.common.blockTypePalette || "Palette"}
          </span>
        </div>
        <div className="flex items-center gap-2 opacity-50">
          <input
            value={title}
            onChange={handleTitleChange}
            className="block-title text-[10px] font-bold tracking-widest text-right focus:opacity-100 transition-opacity"
            placeholder="..."
            readOnly={isReadOnly}
          />
        </div>
      </div>

      <div className="block-content flex-1 flex flex-col min-h-0">
        <div
          className="palette-block-container nowheel nodrag h-full"
          onClick={handleBackgroundClick}
        >
          <div className="palette-section">
            <div className="palette-colors-grid">
              {metadata.colors.map((color, index) => (
                <div
                  key={`${color}-${index}`}
                  className="palette-color-item group"
                >
                  <div
                    className="palette-color-preview"
                    style={{ backgroundColor: color }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleColorClick(color);
                    }}
                    onContextMenu={(e) => handleEditColor(index, e)}
                  >
                    {!isReadOnly && (
                      <button
                        className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeColor(index);
                        }}
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                  <span className="palette-color-hex">{color}</span>
                </div>
              ))}

              {!isReadOnly && (
                <button
                  className="palette-add-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingIndex(null);
                    setPickerPosition({ x: e.clientX, y: e.clientY });
                    setShowPicker(true);
                  }}
                  title={dict.common.addColor || "Add color"}
                >
                  <Plus size={20} />
                </button>
              )}
            </div>
          </div>

          {showPicker && (
            <ColorPicker
              initialColor={
                editingIndex !== null
                  ? metadata.colors[editingIndex]
                  : "#000000"
              }
              onSelect={handleUpdateColor}
              position={pickerPosition}
              onClose={() => {
                setShowPicker(false);
                setEditingIndex(null);
              }}
            />
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
        id="left-target"
        type="target"
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
        type="target"
        position={Position.Right}
        isConnectable={true}
        className="block-handle block-handle-right !z-50 !top-[60%]"
      >
        {!isRightTargetConnected && <div className="handle-dot" />}
      </Handle>
    </div>
  );
});

PaletteBlock.displayName = "PaletteBlock";

export default PaletteBlock;
