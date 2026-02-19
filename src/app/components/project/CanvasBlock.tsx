"use client";
import {
  memo,
  useState,
  useEffect,
  useRef,
  useCallback,
  ComponentProps,
} from "react";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  NodeResizer,
  useReactFlow,
} from "@xyflow/react";
import {
  FileText,
  Link as LinkIcon,
  Globe,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useTouchGestures } from "./hooks/useTouchGestures";
import { useTouch } from "@providers/TouchProvider";
import { DEFAULT_BLOCK_WIDTH, DEFAULT_BLOCK_HEIGHT } from "./utils/constants";
import * as Y from "yjs";
import { UserPresence } from "./hooks/useProjectCanvasState";
import ProjectCoreBlock from "./ProjectCoreBlock";

import NoteBlock from "./NoteBlock";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import { BlockFooter } from "./BlockFooter";

export type BlockData = {
  title?: string;
  content: string;
  updatedAt: string;
  lastEditor: string;
  authorName?: string;
  ownerId?: string;
  authorColor?: string;
  blockType:
    | "text"
    | "link"
    | "file"
    | "core"
    | "github"
    | "palette"
    | "contact"
    | "video"
    | "snippet"
    | "checklist"
    | "sketch";
  label?: string;
  metadata?: string;
  isLocked?: boolean;
  isSummary?: boolean;
  isPreviewMode?: boolean;
  isEditingLink?: boolean;
  isEditingGithub?: boolean;
  isEditingContact?: boolean;
  status?: string;
  rationale?: string;
  intent?: string;
  reactions?: {
    emoji: string;
    count: number;
    users: (string | { id: string; username: string })[];
  }[];
  onContentChange?: (
    blockId: string,
    content: string,
    updatedAt: string,
    lastEditor: string,
    metadata?: string,
    title?: string,
    reactions?: {
      emoji: string;
      count: number;
      users: (string | { id: string; username: string })[];
    }[],
  ) => void;
  onFocus?: (blockId: string, index: number) => void;
  onBlur?: (blockId: string) => void;
  onCaretMove?: (blockId: string, index: number) => void;
  onResize?: (
    blockId: string,
    params: {
      width: number;
      height: number;
      x?: number;
      y?: number;
    },
  ) => void;
  onResizeEnd?: (
    blockId: string,
    params: {
      width: number;
      height: number;
      x?: number;
      y?: number;
    },
  ) => void;
  typingUsers?: UserPresence[];
  movingUserColor?: string;
  projectOwnerId?: string | null;
  initialProjectId?: string;
  currentUser?: { id: string; username: string; displayName?: string | null };
  yText?: Y.Text;
};

export interface BlockMetadata {
  name?: string;
  size?: number;
  type?: string;
  lastModified?: number;
  title?: string;
  description?: string;
  image?: string;
  error?: string;
  [key: string]: unknown;
}

export type CanvasBlockProps = NodeProps<
  Node<
    BlockData,
    | "text"
    | "link"
    | "file"
    | "github"
    | "palette"
    | "contact"
    | "video"
    | "snippet"
    | "checklist"
    | "sketch"
  >
>;

const getBlockLabel = (type: string) => {
  switch (type) {
    case "text":
      return "Text";
    case "link":
      return "Link";
    case "core":
      return "Project";
    default:
      return "Block";
  }
};

const getBlockIconComponent = (type: string) => {
  switch (type) {
    case "text":
      return FileText;
    case "link":
      return LinkIcon;
    case "core":
      return Globe;
    default:
      return FileText;
  }
};

const CanvasBlockComponent = (props: CanvasBlockProps) => {
  const { id, data, selected, type, width, height } = props;
  const { dict, lang } = useI18n();
  const blockType = data.blockType;
  const [title, setTitle] = useState(data.title || "");
  const isLocked = data.isLocked;
  const isPreviewMode = data.isPreviewMode;

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const { setNodes, getNode, getEdges } = useReactFlow();

  const { rippleRef } = useTouch();

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;

  const isReadOnly =
    isPreviewMode || (isLocked ? !isOwner && !isProjectOwner : false);

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
  });

  const handleContentContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isReadOnly) return;

      if (blockType === "link") {
        e.preventDefault();
        e.stopPropagation();

        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === id) {
              return {
                ...n,
                selected: true,
                data: {
                  ...n.data,
                  isEditingLink: true,
                },
              };
            }
            return { ...n, selected: false };
          }),
        );
      }
    },
    [blockType, id, isReadOnly, setNodes],
  );

  const onLongPress = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      handleContentContextMenu(e as unknown as React.MouseEvent);
    },
    [handleContentContextMenu],
  );

  const touchHandlers = useTouchGestures({
    rippleRef,
    onLongPress,
    stopPropagation: true,
  });

  const [content, setContent] = useState(data.content);
  const Icon = getBlockIconComponent(blockType);

  useEffect(() => {
    if (data.title !== undefined) setTitle(data.title);
  }, [data.title]);

  // Render loading state for summary blocks
  if (data.isSummary) {
    return (
      <div
        className="react-flow__node-default rounded-lg border border-border bg-card shadow-sm flex items-center justify-center relative transition-opacity duration-300"
        style={{
          width: width || DEFAULT_BLOCK_WIDTH,
          height: height || 100,
        }}
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground animate-pulse">
          <div className="rounded-full bg-muted p-3">
            <Icon className="h-6 w-6 opacity-50" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs font-medium opacity-70">
              Loading {getBlockLabel(blockType)}...
            </span>
          </div>
        </div>
        {/* Hidden handles to maintain connections */}
        <Handle
          type="target"
          position={Position.Left}
          id="left-target"
          style={{ opacity: 0 }}
        />
        <Handle
          type="source"
          position={Position.Left}
          id="left"
          style={{ opacity: 0 }}
        />
        <Handle
          type="target"
          position={Position.Right}
          id="right-target"
          style={{ opacity: 0 }}
        />
        <Handle
          type="source"
          position={Position.Right}
          id="right"
          style={{ opacity: 0 }}
        />
        <Handle
          type="target"
          position={Position.Top}
          id="top-target"
          style={{ opacity: 0 }}
        />
        <Handle
          type="source"
          position={Position.Top}
          id="top"
          style={{ opacity: 0 }}
        />
        <Handle
          type="target"
          position={Position.Bottom}
          id="bottom-target"
          style={{ opacity: 0 }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          style={{ opacity: 0 }}
        />
      </div>
    );
  }

  // Render specialized blocks
  if ((type as string) === "core") {
    return (
      <ProjectCoreBlock
        {...(props as unknown as ComponentProps<typeof ProjectCoreBlock>)}
      />
    );
  }

  if (type === "text") {
    return (
      <NoteBlock {...(props as unknown as ComponentProps<typeof NoteBlock>)} />
    );
  }

  const [isEditingLink, setIsEditingLink] = useState(false);

  const [metadata, setMetadata] = useState<BlockMetadata | null>(() => {
    try {
      if (!data.metadata) return null;
      return typeof data.metadata === "string"
        ? JSON.parse(data.metadata)
        : data.metadata;
    } catch {
      return null;
    }
  });

  const [previewImageError, setPreviewImageError] = useState(false);
  const [faviconError, setFaviconError] = useState(false);

  useEffect(() => {
    setPreviewImageError(false);
    setFaviconError(false);
  }, [content, data.metadata]);

  const metadataRef = useRef(metadata);
  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);

  const blockRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const syncToYjs = useCallback(
    (newContent: string) => {
      const yText = data.yText;
      if (!yText) return;

      const currentYText = yText.toString();
      if (newContent === currentYText) return;

      yText.doc?.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, newContent);
      }, yText.doc.clientID);
    },
    [data.yText],
  );

  const updateMetadata = useCallback(
    (newMetadata: BlockMetadata | null) => {
      setMetadata(newMetadata);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;
      const metadataString = newMetadata
        ? JSON.stringify(newMetadata)
        : undefined;
      data.onContentChange?.(
        id,
        content,
        now,
        editor,
        metadataString,
        title,
        data.reactions,
      );

      if (setNodes) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    metadata: metadataString,
                    title: title,
                  },
                }
              : n,
          ),
        );
      }
    },
    [currentUser, dict.project.anonymous, data, id, content, title, setNodes],
  );

  const linkRetries = useRef(0);

  useEffect(() => {
    linkRetries.current = 0;
  }, [content]);

  const fetchLinkMetadata = useCallback(
    async (url: string) => {
      if (!url) return;

      // Validate domain format (http optional, domain + TLD required)
      const URL_REGEX = new RegExp(
        "^(https?://)?([\\da-z.-]+)\\.([a-z.]{2,6})([/\\w .-]*)/?$",
        "i",
      );

      if (!URL_REGEX.test(url)) {
        updateMetadata({
          ...metadataRef.current,
          title: "Invalid Link",
          description: "The URL format is invalid",
          image: "",
          error: "invalid_format",
        });
        return;
      }

      if (linkRetries.current >= 3) {
        updateMetadata({
          ...metadataRef.current,
          title: "Link Unavailable",
          description: "Could not retrieve link metadata",
          image: "",
          error: "max_retries",
        });
        return;
      }

      linkRetries.current += 1;

      try {
        const res = await fetch("/api/links/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (res.ok) {
          const ogData = await res.json();
          updateMetadata({
            ...metadataRef.current,
            title: ogData.title,
            description: ogData.description,
            image: ogData.image,
            error: undefined,
          });
        }
      } catch (error) {
        console.error("Failed to fetch link metadata:", error);
      }
    },
    [updateMetadata],
  );

  const exitEditMode = useCallback(() => {
    if (isEditingLink) {
      setIsEditingLink(false);
      fetchLinkMetadata(content);
    }
  }, [isEditingLink, content, fetchLinkMetadata]);

  useEffect(() => {
    if (blockType !== "link" || !content || isEditingLink || isReadOnly) return;

    if (!metadata?.title && !metadata?.image && !metadata?.error) {
      fetchLinkMetadata(content);
    }
  }, [
    blockType,
    content,
    isEditingLink,
    fetchLinkMetadata,
    metadata,
    isReadOnly,
  ]);

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
        content,
        now,
        editor,
        metadata ? JSON.stringify(metadata) : undefined,
        newTitle,
        data.reactions,
      );
    },
    [id, data, currentUser, dict.project.anonymous, metadata, content],
  );

  useEffect(() => {
    if (!selected) {
      exitEditMode();
    }
  }, [selected, exitEditMode]);

  useEffect(() => {
    if (!isEditingLink) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        exitEditMode();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        blockRef.current &&
        !blockRef.current.contains(e.target as globalThis.Node)
      ) {
        exitEditMode();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEditingLink, exitEditMode]);

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

  const typingUsers = data.typingUsers;
  const isRemoteTyping = (typingUsers?.length || 0) > 0;
  const isBeingMoved = !!data.movingUserColor;

  const isConnectable = !isReadOnly && !isPreviewMode;

  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title]);

  useEffect(() => {
    try {
      if (!data.metadata) {
        setMetadata(null);
        return;
      }
      const parsed =
        typeof data.metadata === "string"
          ? JSON.parse(data.metadata)
          : data.metadata;
      setMetadata(parsed);
    } catch {
      setMetadata(null);
    }
  }, [data.metadata]);

  const borderColor = isBeingMoved ? data.movingUserColor : "var(--border)";

  useEffect(() => {
    if (data.isPreviewMode) return;

    const yText = data.yText;
    if (!yText || typeof yText.observe !== "function") return;

    if (isEditingLink) return;

    const currentYText = yText.toString();
    if (content !== currentYText) {
      setContent(currentYText);
    }

    const observer = (event: Y.YTextEvent) => {
      if (event.transaction.local) return;
      if (isEditingLink) return;
      setContent(yText.toString());
    };

    yText.observe(observer);
    return () => yText.unobserve(observer);
  }, [data.yText, isEditingLink, data.isPreviewMode]);

  useEffect(() => {
    if (isEditingLink && linkInputRef.current) {
      linkInputRef.current.focus();
      const length = linkInputRef.current.value.length;
      linkInputRef.current.setSelectionRange(length, length);
    }
  }, [isEditingLink]);

  useEffect(() => {
    if (data.isEditingLink) {
      setIsEditingLink(true);
      if (setNodes) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, isEditingLink: false } }
              : n,
          ),
        );
      }
    }
  }, [data.isEditingLink, id, setNodes]);

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
                style: { ...n.style, width: finalWidth, height: finalHeight },
              }
            : n,
        ),
      );

      const onResize = data.onResize;
      onResize?.(id, {
        width: finalWidth,
        height: finalHeight,
        x: finalX,
        y: finalY,
      });
    },
    [id, data, getNode, setNodes],
  );

  const handleResizeEnd = useCallback(
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

      const onResizeEnd = data.onResizeEnd;
      onResizeEnd?.(id, {
        width: finalWidth,
        height: finalHeight,
        x: finalX,
        y: finalY,
      });
    },
    [id, data, getNode],
  );

  const getDomain = (url: string) => {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      return u.hostname;
    } catch {
      return "";
    }
  };

  const renderContent = () => {
    if (isEditingLink) {
      return (
        <div className="block-link-edit-container flex items-center justify-center h-full w-full px-4 nodrag">
          <input
            ref={linkInputRef}
            type="text"
            value={content}
            onChange={(e) => {
              const val = e.target.value;
              setContent(val);
              syncToYjs(val);
              const now = new Date().toISOString();
              const editor =
                currentUser?.displayName ||
                currentUser?.username ||
                dict.project.anonymous;
              data.onContentChange?.(
                id,
                val,
                now,
                editor,
                metadata ? JSON.stringify(metadata) : undefined,
                title,
                data.reactions,
              );
            }}
            onBlur={() => {
              setIsEditingLink(false);
              fetchLinkMetadata(content);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setIsEditingLink(false);
                fetchLinkMetadata(content);
              }
            }}
            placeholder={dict.blocks.linkPlaceholder}
            className="link-input"
            readOnly={isReadOnly}
          />
        </div>
      );
    }

    const domain = getDomain(content);
    const faviconUrl = domain
      ? `/api/proxy/image?url=${encodeURIComponent(
          `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        )}`
      : null;

    return (
      <div
        className="block-link-widget flex-1 flex flex-col min-h-0 overflow-hidden rounded bg-white/5 transition-colors cursor-pointer group relative"
        onContextMenu={handleContentContextMenu}
        {...touchHandlers}
        onClick={() =>
          content &&
          window.open(
            content.startsWith("http") ? content : `https://${content}`,
            "_blank",
          )
        }
      >
        {!isReadOnly && !isEditingLink && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <span className="canvas-context-badge">
              {dict.canvas.rightClickToEdit}
            </span>
          </div>
        )}
        {metadata?.image && !previewImageError ? (
          <div className="block-link-preview w-full aspect-video overflow-hidden relative flex-shrink-0">
            <img
              src={`/api/proxy/image?url=${encodeURIComponent(metadata.image)}`}
              alt={metadata.title || "Link preview"}
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
              onError={() => setPreviewImageError(true)}
            />
            {faviconUrl && !faviconError && (
              <div className="absolute top-2 left-2 w-6 h-6">
                <img
                  src={faviconUrl}
                  alt="favicon"
                  className="w-full h-full object-contain"
                  crossOrigin="anonymous"
                  onError={() => setFaviconError(true)}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="block-link-placeholder w-full aspect-video flex items-center justify-center bg-white/5 relative flex-shrink-0">
            {metadata?.error ? (
              <AlertCircle size={48} className="opacity-20 text-red-500" />
            ) : (
              <Globe size={48} className="opacity-20" />
            )}
            {faviconUrl && !faviconError && (
              <div className="absolute top-2 left-2 w-6 h-6">
                <img
                  src={faviconUrl}
                  alt="favicon"
                  className="w-full h-full object-contain"
                  crossOrigin="anonymous"
                  onError={() => setFaviconError(true)}
                />
              </div>
            )}
          </div>
        )}
        <div className="block-link-info p-4">
          <div className="flex items-center gap-2 mb-1 overflow-hidden">
            {faviconUrl && !faviconError && (
              <img
                src={faviconUrl}
                alt="favicon"
                className="w-4 h-4 min-w-[16px] object-contain opacity-80"
                crossOrigin="anonymous"
                onError={() => setFaviconError(true)}
              />
            )}
            <h4
              className={`block-link-title line-clamp-1 font-bold text-sm ${
                metadata?.error ? "text-red-400" : ""
              }`}
            >
              {metadata?.title || content || "Untitled Link"}
            </h4>
          </div>
          <p className="block-link-description line-clamp-2 text-xs opacity-60">
            {metadata?.description || content}
          </p>
          <div className="flex items-center gap-1 mt-3 text-[10px] opacity-40">
            <ExternalLink size={10} />
            <span className="truncate">{content}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={blockRef}
      className={`block-card block-type-${blockType} ${
        selected ? "selected" : ""
      } ${isRemoteTyping ? "remote-typing" : ""} ${
        isBeingMoved ? "is-moving" : ""
      } ${
        isReadOnly ? "read-only" : ""
      } flex flex-col !p-0 relative w-full h-full`}
      style={
        {
          "--block-border-color": borderColor,
        } as React.CSSProperties
      }
    >
      <NodeResizer
        minWidth={250}
        minHeight={180}
        isVisible={selected && !isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit] px-2">
        <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
          <div className="flex items-center gap-2">
            <Icon
              size={14}
              className={`block-type-icon ${
                blockType === "text" || !blockType ? "text" : blockType
              }`}
            />
            <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
              {dict.common[
                `blockType${blockType.charAt(0).toUpperCase()}${blockType.slice(
                  1,
                )}` as keyof typeof dict.common
              ] || blockType}
            </span>
          </div>

          <div className="flex items-center gap-2">
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
        </div>

        <div className="block-content flex-1 flex flex-col min-h-0">
          {renderContent()}
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
      />

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={isConnectable}
        className={`block-handle block-handle-left !z-50 ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        {!isLeftSourceConnected && <div className="handle-dot" />}
      </Handle>

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className={`block-handle block-handle-right !z-50 ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        {!isRightSourceConnected && <div className="handle-dot" />}
      </Handle>

      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={isConnectable}
        className={`block-handle block-handle-top !z-50 ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        {!isTopSourceConnected && <div className="handle-dot" />}
      </Handle>

      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className={`block-handle block-handle-bottom !z-50 ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        {!isBottomSourceConnected && <div className="handle-dot" />}
      </Handle>
    </div>
  );
};

export const CanvasBlock = memo(CanvasBlockComponent);
export default CanvasBlock;
