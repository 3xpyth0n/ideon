"use client";

import { memo, useState, useCallback, useEffect } from "react";
import * as Y from "yjs";
import { Video } from "lucide-react";
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
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import { focusProjectCanvas } from "./utils/focusCanvas";

type VideoBlockProps = NodeProps<Node<BlockData>> & {
  isReadOnly?: boolean;
};

const VideoBlock = memo(({ id, data, selected }: VideoBlockProps) => {
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

  const [url, setUrl] = useState(data.content || "");
  const [title, setTitle] = useState(data.title || "");
  const [isEditing, setIsEditing] = useState(false);

  const syncToYjs = useCallback(
    (text: string) => {
      if (!data.yText) return;
      if (data.yText.toString() === text) return;

      data.yText.doc?.transact(() => {
        data.yText?.delete(0, data.yText.length);
        data.yText?.insert(0, text);
      }, data.yText.doc.clientID);
    },
    [data.yText],
  );

  // Sync content from data if it changes externally
  useEffect(() => {
    if (data.content !== undefined && data.content !== url) {
      setUrl(data.content);
    }
  }, [data.content]);

  // Sync title
  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title]);

  useEffect(() => {
    const yText = data.yText;
    if (!yText) return;

    // We don't want to overwrite local state if we're currently editing or read-only
    if (isEditing || isReadOnly) return;

    const currentYText = yText.toString();
    if (url !== currentYText) {
      setUrl(currentYText);
    }

    const observer = (event: Y.YTextEvent) => {
      if (event.transaction.local) return;
      if (isEditing) return;
      setUrl(yText.toString());
    };

    yText.observe(observer);
    return () => yText.unobserve(observer);
  }, [data.yText, isEditing, url]);

  const handleContentContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isReadOnly) return;
      e.preventDefault();
      e.stopPropagation();
      setIsEditing(true);
    },
    [isReadOnly],
  );

  const onLongPress = useCallback(
    (e: React.PointerEvent | PointerEvent | React.TouchEvent | TouchEvent) => {
      handleContentContextMenu(e as unknown as React.MouseEvent);
    },
    [handleContentContextMenu],
  );

  const touchHandlers = useTouchGestures({
    onLongPress,
    stopPropagation: true,
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
        data.reactions,
      );
    },
    [id, data, currentUser, dict],
  );

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newUrl = e.target.value;
      setUrl(newUrl);
      syncToYjs(newUrl);

      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;

      data.onContentChange?.(
        id,
        newUrl,
        now,
        editor,
        data.metadata,
        title,
        data.reactions,
      );
    },
    [id, data, currentUser, dict, syncToYjs, title],
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

  const getEmbedUrl = (inputUrl: string) => {
    if (!inputUrl) return null;

    // YouTube
    const youtubeRegex = new RegExp(
      '(?:youtube\\.com/(?:[^/]+/.+/|(?:v|e(?:mbed)?)/|.*[?&]v=)|youtu\\.be/)([^"&?/\\s]{11})',
    );
    const youtubeMatch = inputUrl.match(youtubeRegex);
    if (youtubeMatch && youtubeMatch[1]) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }

    // Loom
    const loomRegex = /loom\.com\/(?:share|embed)\/([a-f0-9]+)/;
    const loomMatch = inputUrl.match(loomRegex);
    if (loomMatch && loomMatch[1]) {
      return `https://www.loom.com/embed/${loomMatch[1]}`;
    }

    return null;
  };

  const embedUrl = getEmbedUrl(url);

  return (
    <div
      className={`block-card block-type-video ${selected ? "selected" : ""} ${
        isBeingMoved ? "is-moving" : ""
      } ${isReadOnly ? "read-only" : ""} flex flex-col p-0!`}
      style={{ "--block-border-color": borderColor } as React.CSSProperties}
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
            <Video size={16} />
            <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
              {dict.blocks.blockTypeVideo || "Video"}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <input
              value={title}
              onChange={handleTitleChange}
              className="block-title nodrag"
              placeholder={dict.blocks.title || "..."}
              readOnly={isReadOnly}
            />
          </div>
        </div>

        <div
          className="block-content flex-1 flex flex-col min-h-0 relative group"
          onContextMenu={handleContentContextMenu}
        >
          {!isReadOnly && !isEditing && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <span className="canvas-context-badge">
                {dict.canvas?.rightClickToEdit || "Right click to edit"}
              </span>
            </div>
          )}
          {isEditing ? (
            <div className="flex items-center justify-center h-full w-full px-4 relative">
              <input
                type="text"
                value={url}
                onChange={handleUrlChange}
                placeholder="Paste YouTube or Loom URL..."
                className="link-input nodrag"
                readOnly={isReadOnly}
                autoFocus
                onBlur={() => setIsEditing(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.target as HTMLElement)?.blur?.();
                    setIsEditing(false);
                    focusProjectCanvas();
                  }
                }}
              />
            </div>
          ) : embedUrl ? (
            <div className="w-full h-full bg-black/20 relative">
              <iframe
                src={embedUrl}
                frameBorder="0"
                allowFullScreen
                className="w-full h-full pointer-events-auto"
                style={{
                  pointerEvents: selected || isEditing ? "none" : "auto",
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full opacity-30 italic">
              {dict.blocks.noVideo || "No valid video URL"}
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

VideoBlock.displayName = "VideoBlock";

export default VideoBlock;
