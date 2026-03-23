"use client";

import { memo, useState, useCallback, useRef, useEffect } from "react";
import { PenTool } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { BlockFooter } from "./BlockFooter";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import { BlockData } from "./CanvasBlock";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import { useTheme } from "@providers/ThemeProvider";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { ExcalidrawModal, type SketchModalResult } from "./ExcalidrawModal";

type SketchBlockProps = NodeProps<Node<BlockData>>;

interface SketchPersistedData {
  excalidrawElements?: ExcalidrawElement[];
  excalidrawFiles?: BinaryFiles;
  excalidrawSvg?: string;
  excalidrawSvgLight?: string;
  excalidrawSvgDark?: string;
}

function getThemeSvg(meta: SketchPersistedData, theme: "light" | "dark") {
  if (theme === "dark") {
    return (
      meta.excalidrawSvgDark ?? meta.excalidrawSvg ?? meta.excalidrawSvgLight
    );
  }
  return (
    meta.excalidrawSvgLight ?? meta.excalidrawSvg ?? meta.excalidrawSvgDark
  );
}

function parseSketchMeta(
  metadata?: string | Record<string, unknown> | null,
): SketchPersistedData {
  if (!metadata) return {};
  if (typeof metadata !== "string") return metadata as SketchPersistedData;
  try {
    const parsed = JSON.parse(metadata);
    if (typeof parsed === "string") {
      try {
        return JSON.parse(parsed) as SketchPersistedData;
      } catch {
        return {};
      }
    }
    return parsed as SketchPersistedData;
  } catch {
    return {};
  }
}

const SketchBlock = memo((props: SketchBlockProps) => {
  const { id, data, selected } = props;
  const { dict, lang } = useI18n();
  const { theme } = useTheme();
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

  const [title, setTitle] = useState(data.title || "");
  const [modalOpen, setModalOpen] = useState(false);
  const [svgDataUri, setSvgDataUri] = useState<string | undefined>(() =>
    getThemeSvg(parseSketchMeta(data.metadata), theme),
  );

  const sketchDataRef = useRef<SketchPersistedData>(
    parseSketchMeta(data.metadata),
  );

  const dataRef = useRef(data);
  const titleRef = useRef(title);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title, title]);

  useEffect(() => {
    const parsed = parseSketchMeta(data.metadata);
    sketchDataRef.current = parsed;
    setSvgDataUri(getThemeSvg(parsed, theme));
  }, [data.metadata, theme]);

  const handleModalClose = useCallback(
    (result: SketchModalResult | null) => {
      setModalOpen(false);
      if (!result) return;

      const svg = theme === "dark" ? result.svgDark : result.svgLight;
      setSvgDataUri(svg);
      sketchDataRef.current = {
        excalidrawElements: result.elements as ExcalidrawElement[],
        excalidrawFiles: result.files,
        excalidrawSvg: svg,
        excalidrawSvgLight: result.svgLight,
        excalidrawSvgDark: result.svgDark,
      };

      const currentData = dataRef.current;
      const now = new Date().toISOString();
      const editor =
        currentData.currentUser?.displayName ||
        currentData.currentUser?.username ||
        dict.project.anonymous;

      currentData.onContentChange?.(
        id,
        currentData.content,
        now,
        editor,
        {
          excalidrawElements: result.elements,
          excalidrawFiles: result.files,
          excalidrawSvgLight: result.svgLight,
          excalidrawSvgDark: result.svgDark,
        },
        titleRef.current,
        currentData.reactions,
      );
    },
    [dict.project.anonymous, id, theme],
  );

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
        JSON.stringify(sketchDataRef.current),
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
      data.onResizeEnd?.(id, params);
    },
    [data, id],
  );

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
    canReact,
  });

  const isBeingMoved = !!data.movingUserColor;
  const borderColor = isBeingMoved ? data.movingUserColor : "var(--border)";

  const edges = getEdges();
  const isHandleConnected = (handleId: string) =>
    edges.some(
      (e) =>
        (e.source === id && e.sourceHandle === handleId) ||
        (e.target === id && e.targetHandle === handleId),
    );

  return (
    <>
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
      <div
        className={`block-card ${selected ? "selected" : ""} ${
          isBeingMoved ? "is-moving" : ""
        } ${isReadOnly ? "read-only" : ""} flex flex-col p-0! select-none`}
        style={{ "--block-border-color": borderColor } as React.CSSProperties}
      >
        <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit]">
          <div className="block-header flex items-center justify-between pt-4 px-4 mb-2 handle-drag-target">
            <div className="flex items-center gap-2">
              <PenTool size={16} />
              <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
                {dict.blocks.blockTypeSketch}
              </span>
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

          <div
            className={`sketch-content flex-1 min-h-0 relative nowheel nodrag${
              !isReadOnly ? " sketch-clickable" : ""
            }`}
            onClick={!isReadOnly ? () => setModalOpen(true) : undefined}
          >
            {svgDataUri ? (
              <>
                <img
                  src={svgDataUri}
                  alt=""
                  className="sketch-thumbnail"
                  draggable={false}
                />
                {!isReadOnly && (
                  <div className="sketch-edit-overlay">
                    <div className="sketch-edit-badge">
                      <PenTool size={13} />
                      <span>{dict.common.edit}</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="sketch-placeholder">
                <PenTool size={32} />
                <span>{dict.common.edit}</span>
              </div>
            )}
          </div>

          <BlockFooter
            updatedAt={data.updatedAt}
            authorName={data.authorName}
            isLocked={isLocked}
            dict={dict}
            lang={lang}
          />
        </div>

        <Handle
          id="left"
          type="source"
          position={Position.Left}
          isConnectable={true}
          className="block-handle block-handle-left z-50!"
        >
          {!isHandleConnected("left") && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="right"
          type="source"
          position={Position.Right}
          isConnectable={true}
          className="block-handle block-handle-right z-50!"
        >
          {!isHandleConnected("right") && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="top"
          type="source"
          position={Position.Top}
          isConnectable={true}
          className="block-handle block-handle-top z-50!"
        >
          {!isHandleConnected("top") && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="bottom"
          type="source"
          position={Position.Bottom}
          isConnectable={true}
          className="block-handle block-handle-bottom z-50!"
        >
          {!isHandleConnected("bottom") && <div className="handle-dot" />}
        </Handle>
      </div>

      <BlockReactions
        reactions={data.reactions}
        onReact={handleReact}
        onRemoveReaction={handleRemoveReaction}
        currentUserId={currentUser?.id}
        isReadOnly={isReadOnly}
        canReact={canReact}
      />

      {modalOpen && (
        <ExcalidrawModal
          elements={sketchDataRef.current.excalidrawElements}
          files={sketchDataRef.current.excalidrawFiles}
          theme={theme}
          onClose={handleModalClose}
        />
      )}
    </>
  );
});

SketchBlock.displayName = "SketchBlock";

export default SketchBlock;
