"use client";

import { memo, useState, useCallback, useEffect } from "react";
import * as Y from "yjs";
import { Video, Lock } from "lucide-react";
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

type VideoBlockProps = NodeProps<Node<BlockData>> & {
  isReadOnly?: boolean;
};

const VideoBlock = memo(({ id, data, selected }: VideoBlockProps) => {
  const { dict, lang } = useI18n();
  const { setNodes, getNode, getEdges } = useReactFlow();
  const [url, setUrl] = useState(data.content || "");
  const [isEditing, setIsEditing] = useState(false);

  const syncToYjs = useCallback(
    (text: string) => {
      if (!data.yText) return;
      if (data.yText.toString() === text) return;

      data.yText.delete(0, data.yText.length);
      data.yText.insert(0, text);
    },
    [data.yText],
  );

  // Sync content from data if it changes externally
  useEffect(() => {
    if (data.content !== undefined && data.content !== url) {
      setUrl(data.content);
    }
  }, [data.content]);

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

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newUrl = e.target.value;
      setUrl(newUrl);
      syncToYjs(newUrl);

      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.common.anonymous;

      data.onContentChange?.(
        id,
        newUrl,
        now,
        editor,
        data.metadata,
        data.title,
      );
    },
    [id, data, currentUser, dict, syncToYjs],
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
          <Video size={16} />
          <span className="text-tiny uppercase tracking-wider opacity-50 font-bold">
            {dict.common.blockTypeVideo || "Video"}
          </span>
        </div>
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
            {dict.common.noVideo || "No valid video URL"}
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

VideoBlock.displayName = "VideoBlock";

export default VideoBlock;
