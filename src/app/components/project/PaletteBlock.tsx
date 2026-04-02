"use client";

import { memo, useState, useCallback, useMemo } from "react";
import { Plus, Trash2, Palette } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@providers/I18nProvider";
import { BlockFooter } from "./BlockFooter";
import { useTouchGestures } from "./hooks/useTouchGestures";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import { BlockData } from "./CanvasBlock";
import ColorPicker from "./ColorPicker";
import "./palette-block.css";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import { focusProjectCanvas } from "./utils/focusCanvas";
import { parsePaletteMetadata } from "@lib/metadata-parsers";

type PaletteBlockProps = NodeProps<Node<BlockData>> & {
  isReadOnly?: boolean;
};

interface PaletteMetadata {
  colors: string[];
}

const PaletteBlock = memo(({ id, data, selected }: PaletteBlockProps) => {
  const { dict, lang } = useI18n();
  const { setNodes, getEdges } = useReactFlow();

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

  const [showPicker, setShowPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<
    { x: number; y: number } | undefined
  >(undefined);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [title, setTitle] = useState(data.title || "");
  const metadata = useMemo(
    () => parsePaletteMetadata(data.metadata) as PaletteMetadata,
    [data.metadata],
  );
  const colors = metadata.colors;

  const updatePalette = useCallback(
    (newColors: string[]) => {
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;
      const newMetadata: PaletteMetadata = { colors: newColors };
      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        JSON.stringify(newMetadata),
        title,
        data.reactions,
      );
    },
    [id, data, currentUser, dict, title],
  );

  const addColor = useCallback(
    (color: string) => {
      if (isReadOnly) return;
      updatePalette([...colors, color]);
    },
    [colors, updatePalette, isReadOnly],
  );

  const removeColor = useCallback(
    (index: number) => {
      if (isReadOnly) return;
      const newColors = colors.filter((_, i) => i !== index);
      updatePalette(newColors);
    },
    [colors, updatePalette, isReadOnly],
  );

  const handleColorClick = useCallback(
    (color: string) => {
      navigator.clipboard.writeText(color);
      toast.success(`${dict.common.copied || "Copied"}: ${color}`);
    },
    [dict.common.copied],
  );

  const handleEditColor = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault?.();
      e.stopPropagation?.();
      if (isReadOnly) return;
      setEditingIndex(index);
      setPickerPosition({ x: e.clientX, y: e.clientY });
      setShowPicker(true);
    },
    [isReadOnly],
  );

  const onLongPress = useCallback(
    (
      e: React.PointerEvent | PointerEvent | React.TouchEvent | TouchEvent,
      x: number,
      y: number,
    ) => {
      if (isReadOnly) return;
      const target = e.target as HTMLElement;
      const colorItem = target.closest("[data-color-index]");
      if (colorItem) {
        const index = parseInt(
          colorItem.getAttribute("data-color-index") || "0",
        );
        handleEditColor(index, {
          preventDefault: () => {},
          clientX: x,
          clientY: y,
        } as unknown as React.MouseEvent);
      }
    },
    [handleEditColor, isReadOnly],
  );

  const touchHandlers = useTouchGestures({
    onLongPress,
  });

  const handleUpdateColor = useCallback(
    (color: string) => {
      if (isReadOnly) return;
      if (
        editingIndex !== null &&
        editingIndex >= 0 &&
        editingIndex < colors.length
      ) {
        const newColors = [...colors];
        newColors[editingIndex] = color;
        updatePalette(newColors);
      } else {
        addColor(color);
      }
      setShowPicker(false);
      setEditingIndex(null);
    },
    [editingIndex, colors, updatePalette, addColor, isReadOnly],
  );

  const handleBackgroundClick = useCallback(() => {
    setShowPicker(false);
    setEditingIndex(null);
  }, []);

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
      className={`block-card ${selected ? "selected" : ""} ${
        isBeingMoved ? "is-moving" : ""
      } ${isReadOnly ? "read-only" : ""} flex flex-col p-0!`}
      style={{ "--block-border-color": borderColor } as React.CSSProperties}
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

      <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
        <div className="flex items-center gap-2">
          <Palette size={16} />
          <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
            {dict.blocks.blockTypePalette || "Palette"}
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
            placeholder={dict.blocks.title || "..."}
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
              {colors.map((color, index) => (
                <div
                  key={`${color}-${index}`}
                  className="palette-color-item group"
                >
                  <div
                    className="palette-color-preview"
                    style={{ backgroundColor: color }}
                    data-color-index={index}
                    {...touchHandlers}
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
                  title={dict.blocks.addColor || "Add color"}
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
                  ? colors[editingIndex] ?? "#000000"
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

      <BlockFooter
        updatedAt={data.updatedAt}
        authorName={data.authorName}
        isContentLocked={data.isContentLocked}
        isPositionLocked={data.isPositionLocked}
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

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={true}
        className="block-handle block-handle-left z-50!"
      >
        {!isLeftSourceConnected && <div className="handle-dot" />}
      </Handle>
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

PaletteBlock.displayName = "PaletteBlock";

export default PaletteBlock;
