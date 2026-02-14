"use client";

import { memo, useState, useCallback, useEffect } from "react";
import * as Y from "yjs";
import { Video, Lock } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useTouchGestures } from "./hooks/useTouchGestures";
import { useTouch } from "@providers/TouchProvider";
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

type VideoBlockProps = NodeProps<Node<BlockData>> & {
  isReadOnly?: boolean;
};

const VideoBlock = memo(({ id, data, selected }: VideoBlockProps) => {
  const { dict, lang } = useI18n();
  const { rippleRef } = useTouch();
  const { setNodes, getNode, getEdges } = useReactFlow();
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

    // We don't want to overwrite local state if we're currently editing
    if (isEditing) return;

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

      data.onContentChange?.(id, newUrl, now, editor, data.metadata, title);
    },
    [id, data, currentUser, dict, syncToYjs, title],
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
      } ${isReadOnly ? "read-only" : ""} flex flex-col !p-0`}
      style={{ "--block-border-color": borderColor } as React.CSSProperties}
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
            <Video size={16} />
            <span className="text-tiny uppercase tracking-wider opacity-50 font-bold">
              {dict.blocks.blockTypeVideo || "Video"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={title}
              onChange={handleTitleChange}
              className="block-title"
              placeholder="..."
              readOnly={isReadOnly}
            />
            {!isReadOnly && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="text-[10px] opacity-50 hover:opacity-100 uppercase font-bold tracking-wider"
              >
                {isEditing
                  ? dict.common.done || "Done"
                  : dict.common.edit || "Edit"}
              </button>
            )}
          </div>
        </div>

        <div className="block-content flex-1 flex flex-col min-h-0 relative">
          {isEditing ? (
            <div className="flex items-center justify-center h-full w-full px-4">
              <input
                type="text"
                value={url}
                onChange={handleUrlChange}
                placeholder="Paste YouTube or Loom URL..."
                className="link-input nodrag"
                readOnly={isReadOnly}
                autoFocus
              />
            </div>
          ) : embedUrl ? (
            <div className="w-full h-full bg-black/20">
              <iframe
                src={embedUrl}
                frameBorder="0"
                allowFullScreen
                className="w-full h-full pointer-events-auto"
                style={{ pointerEvents: selected ? "none" : "auto" }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full opacity-30 italic">
              {dict.blocks.noVideo || "No valid video URL"}
            </div>
          )}
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

VideoBlock.displayName = "VideoBlock";

export default VideoBlock;
