"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { AlertCircle, Layers } from "lucide-react";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  useReactFlow,
  useEdges,
} from "@xyflow/react";
import { useI18n } from "@providers/I18nProvider";
import { useTheme } from "@providers/ThemeProvider";
import { toast } from "sonner";
import { type BlockData, type SubCanvasBlockMetadata } from "./CanvasBlock";
import { BlockFooter } from "./BlockFooter";
import { BlockTitleInput } from "./BlockTitleInput";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import { useSubCanvasNavigation } from "./subcanvas/SubCanvasProvider";
import {
  clampSubCanvasResize,
  resolveCommittedTitle,
} from "./subcanvas/subCanvasUtils";
import { parseOptionalJsonRecord } from "@lib/metadata-parsers";
import "./sub-canvas-block.css";

type SubCanvasBlockProps = NodeProps<Node<BlockData>>;

const SubCanvasBlock = memo(({ id, data, selected }: SubCanvasBlockProps) => {
  const { dict, lang } = useI18n();
  const { theme } = useTheme();
  const { setNodes, getViewport } = useReactFlow();
  const { pushCanvas, activeDepth, maxDepth, updateFrameTitle } =
    useSubCanvasNavigation();
  const edges = useEdges();

  const [zoom, setZoom] = useState(() => getViewport().zoom);

  useEffect(() => {
    // Poll viewport zoom — useViewport hook re-renders on every pan/zoom event,
    // so we subscribe lazily via a lightweight interval to avoid re-renders on
    // every canvas pointer-move. 100 ms is imperceptible to the user.
    const id = setInterval(() => {
      setZoom(getViewport().zoom);
    }, 100);
    return () => clearInterval(id);
  }, [getViewport]);

  const subCanvasMeta = parseOptionalJsonRecord(
    data.metadata,
  ) as SubCanvasBlockMetadata | null;
  const thumbnailDataUrl =
    theme === "dark"
      ? subCanvasMeta?.thumbnailDarkDataUrl ??
        subCanvasMeta?.thumbnailDataUrl ??
        subCanvasMeta?.thumbnailLightDataUrl ??
        null
      : subCanvasMeta?.thumbnailLightDataUrl ??
        subCanvasMeta?.thumbnailDataUrl ??
        subCanvasMeta?.thumbnailDarkDataUrl ??
        null;

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

  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title, title]);

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
    [id, data, currentUser, dict.project.anonymous, isReadOnly],
  );

  const handleResize = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const clamped = clampSubCanvasResize(params.width, params.height);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                width: Math.round(clamped.width),
                height: Math.round(clamped.height),
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
      const clamped = clampSubCanvasResize(params.width, params.height);
      data.onResizeEnd?.(id, {
        width: Math.round(clamped.width),
        height: Math.round(clamped.height),
        x: Math.round(params.x),
        y: Math.round(params.y),
      });
    },
    [data, id],
  );

  const handleBodyDoubleClick = useCallback(() => {
    // Viewers (read-only) navigate through sub-canvases without mutation
    // affordances; they are never blocked by the creation-depth guard.
    if (!isReadOnly && activeDepth >= maxDepth) {
      toast.error(dict.blocks.subCanvasMaxDepth);
      return;
    }
    pushCanvas(id, title, getViewport(), !isReadOnly);
  }, [
    activeDepth,
    maxDepth,
    id,
    title,
    pushCanvas,
    getViewport,
    dict,
    isReadOnly,
  ]);

  const handleTitleCommit = useCallback(() => {
    const { title: resolved, changed } = resolveCommittedTitle(
      title,
      data.title || "",
    );
    if (!changed) {
      // Whitespace-only reset: restore previous title to the input.
      setTitle(data.title || "");
      return;
    }
    setTitle(resolved);
    updateFrameTitle(id, resolved);

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
      resolved,
      data.reactions,
    );
  }, [title, data, currentUser, dict.project.anonymous, updateFrameTitle, id]);

  const isHandleConnected = (handleId: string) =>
    edges.some(
      (e) =>
        (e.source === id && e.sourceHandle === handleId) ||
        (e.target === id && e.targetHandle === handleId),
    );

  const isLeftConnected = isHandleConnected("left");
  const isRightConnected = isHandleConnected("right");
  const isTopConnected = isHandleConnected("top");
  const isBottomConnected = isHandleConnected("bottom");

  return (
    <div
      className={`block-card ${selected ? "selected" : ""} ${
        isBeingMoved ? "is-moving" : ""
      } ${isReadOnly ? "read-only" : ""} sub-canvas-block`}
      style={{ "--block-border-color": borderColor } as React.CSSProperties}
    >
      <CustomNodeResizer
        minWidth={160}
        minHeight={120}
        isVisible={!isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="sub-canvas-block-main">
        <div className="sub-canvas-block-shell">
          <div className="sub-canvas-block-header">
            <div className="sub-canvas-block-type-pill">
              <Layers size={14} />
              <span>{dict.blocks.blockTypeSubcanvas}</span>
            </div>

            {subCanvasMeta?.thumbnailError && (
              <span
                className="sub-canvas-block-thumbnail-error"
                title={dict.blocks.subCanvasThumbnailError}
                aria-label={dict.blocks.subCanvasThumbnailError}
              >
                <AlertCircle size={12} />
              </span>
            )}

            <BlockTitleInput
              value={title}
              onChange={handleTitleChange}
              onBlur={handleTitleCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
              maxLength={100}
              className="sub-canvas-block-title nodrag"
              placeholder={dict.blocks.title || "..."}
              readOnly={isReadOnly}
            />
          </div>

          <div
            className="sub-canvas-block-body"
            onDoubleClick={handleBodyDoubleClick}
          >
            {zoom < 0.3 ? (
              /* Low-zoom mode: title only, centered, no thumbnail or placeholder */
              <span className="sub-canvas-block-low-zoom-title">
                {title || dict.blocks.title || ""}
              </span>
            ) : thumbnailDataUrl ? (
              /* Thumbnail available and zoom sufficient — show preview */
              <img
                src={thumbnailDataUrl}
                alt={title || dict.blocks.blockTypeSubcanvas}
                className="sub-canvas-block-thumbnail"
                draggable={false}
                data-subcanvas-thumbnail="true"
              />
            ) : (
              /* No thumbnail yet — show placeholder */
              <span className="sub-canvas-block-empty-label">
                {dict.blocks.subCanvasEmpty}
              </span>
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
      </div>

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
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-left z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        {!isLeftConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-right z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        {!isRightConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-top z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        {!isTopConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-bottom z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        {!isBottomConnected && <div className="handle-dot" />}
      </Handle>
    </div>
  );
});

SubCanvasBlock.displayName = "SubCanvasBlock";

export default SubCanvasBlock;
