"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Frame } from "lucide-react";
import { type NodeProps, type Node, useReactFlow } from "@xyflow/react";
import { useI18n } from "@providers/I18nProvider";
import { BlockData } from "./CanvasBlock";
import { BlockTitleInput } from "./BlockTitleInput";
import CustomNodeResizer from "./CustomNodeResizer";
import ColorPicker from "./ColorPicker";
import { parseFrameMetadata } from "@lib/metadata-parsers";
import "./frame-block.css";

type FrameBlockProps = NodeProps<Node<BlockData>>;

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  if (clean.length !== 6) return `rgba(59,130,246,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const FrameBlock = memo(({ id, data, selected }: FrameBlockProps) => {
  const { dict } = useI18n();
  const { setNodes } = useReactFlow();

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const isPreviewMode = data.isPreviewMode;
  const isLocked = data.isLocked;
  const isProjectOwner = !!(
    currentUser?.id && projectOwnerId === currentUser.id
  );
  const isOwner = !!(currentUser?.id && ownerId === currentUser.id);
  const isViewer = data.userRole === "viewer";
  const isReadOnly =
    isPreviewMode ||
    isViewer ||
    (isLocked ? !isOwner && !isProjectOwner : false);

  const frameMetadata = useMemo(
    () => parseFrameMetadata(data.metadata),
    [data.metadata],
  );

  const [title, setTitle] = useState(data.title || "");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerPos, setColorPickerPos] = useState<
    { x: number; y: number } | undefined
  >();
  const colorSwatchRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title, title]);

  const getEditor = useCallback(
    () =>
      currentUser?.displayName ||
      currentUser?.username ||
      dict.project.anonymous,
    [currentUser, dict.project.anonymous],
  );

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isReadOnly) return;
      const newTitle = e.target.value;
      setTitle(newTitle);
      data.onContentChange?.(
        id,
        data.content,
        new Date().toISOString(),
        getEditor(),
        data.metadata,
        newTitle,
        data.reactions,
      );
    },
    [id, data, isReadOnly, getEditor],
  );

  const handleColorSwatchClick = useCallback(() => {
    if (isReadOnly) return;
    if (colorSwatchRef.current) {
      const rect = colorSwatchRef.current.getBoundingClientRect();
      setColorPickerPos({ x: rect.left + rect.width / 2, y: rect.top });
    }
    setShowColorPicker(true);
  }, [isReadOnly]);

  const handleColorSelect = useCallback(
    (newColor: string) => {
      setShowColorPicker(false);
      data.onContentChange?.(
        id,
        data.content,
        new Date().toISOString(),
        getEditor(),
        JSON.stringify({ ...frameMetadata, color: newColor }),
        title,
        data.reactions,
      );
    },
    [id, data, frameMetadata, title, getEditor],
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
      data.onResizeEnd?.(id, params);
    },
    [data, id],
  );

  const { color } = frameMetadata;

  return (
    <div
      className={`frame-block${selected ? " selected" : ""}${
        isReadOnly ? " read-only" : ""
      }`}
      style={
        {
          "--frame-color": color,
          "--frame-bg": hexToRgba(color, 0.06),
          "--frame-border": hexToRgba(color, selected ? 0.55 : 0.3),
        } as React.CSSProperties
      }
    >
      <CustomNodeResizer
        minWidth={200}
        minHeight={120}
        isVisible={!isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
        <div className="flex items-center gap-2">
          <Frame size={14} className="opacity-50" />
          <span className="text-xs uppercase tracking-wider opacity-50 font-bold">
            {dict.blocks.blockTypeFrame || "Frame"}
          </span>
          {!isReadOnly && (
            <button
              ref={colorSwatchRef}
              className="frame-block-color-swatch nodrag"
              style={{ backgroundColor: color }}
              onClick={handleColorSwatchClick}
              title={dict.blocks.currentColor || "Change color"}
            />
          )}
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
          <BlockTitleInput
            value={title}
            onChange={handleTitleChange}
            placeholder={dict.blocks.title || "..."}
            readOnly={isReadOnly}
          />
        </div>
      </div>

      <div className="frame-block-body handle-drag-target" />

      {showColorPicker && (
        <ColorPicker
          initialColor={color}
          onSelect={handleColorSelect}
          onClose={() => setShowColorPicker(false)}
          position={colorPickerPos}
        />
      )}
    </div>
  );
});

FrameBlock.displayName = "FrameBlock";

export default FrameBlock;
