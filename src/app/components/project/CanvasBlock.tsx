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
  useReactFlow,
} from "@xyflow/react";
import {
  FileText,
  Link as LinkIcon,
  Globe,
  ExternalLink,
  Loader2,
  AlertCircle,
  Check,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useTouchGestures } from "./hooks/useTouchGestures";
import { useTouch } from "@providers/TouchProvider";
import { DEFAULT_BLOCK_WIDTH } from "./utils/constants";
import * as Y from "yjs";
import { UserPresence } from "./hooks/useProjectCanvasState";
import ProjectCoreBlock from "./ProjectCoreBlock";
import CustomNodeResizer from "./CustomNodeResizer";

import NoteBlock from "./NoteBlock";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import { BlockFooter } from "./BlockFooter";

export type BlockData = {
  title?: string;
  content: string;
  yText?: Y.Text;
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
    | "kanban"
    | "sketch"
    | "shell";
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
  userRole?: "creator" | "owner" | "editor" | "viewer";
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
  metadataUrl?: string;
  hasFetchedMetadata?: boolean;
  disablePublicMetadataFetch?: boolean;
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
    | "shell"
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

const HIDE_OG_PREVIEW_BELOW_HEIGHT = 260;

const CanvasBlockComponent = (props: CanvasBlockProps) => {
  const { id, data, selected, type, width, height } = props;
  const { dict, lang } = useI18n();
  const blockType = data.blockType;
  const [title, setTitle] = useState(data.title || "");
  const isLocked = data.isLocked;
  const isPreviewMode = data.isPreviewMode;

  const currentUser = data.currentUser;
  const userRole = data.userRole;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const { setNodes, getEdges } = useReactFlow();

  const { rippleRef } = useTouch();

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;
  const isViewer = userRole === "viewer";

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

  const [isEditingLink, setIsEditingLink] = useState(false);

  useEffect(() => {
    if (!isEditingLink && data.content !== content) {
      setContent(data.content);
    }
  }, [data.content, content, isEditingLink]);

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
  const fetchedMetadataUrlsRef = useRef<Set<string>>(new Set());
  const metadataFetchInFlightRef = useRef<string | null>(null);

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
    },
    [currentUser, dict.project.anonymous, data, id, content, title],
  );

  const linkRetries = useRef(0);

  useEffect(() => {
    linkRetries.current = 0;
  }, [content]);

  const fetchLinkMetadata = useCallback(
    async (url: string, options?: { forceRoot?: boolean }) => {
      if (!url) return;

      if (metadataRef.current?.disablePublicMetadataFetch) {
        return;
      }

      const fetchKey = options?.forceRoot ? `root:${url}` : `main:${url}`;
      if (metadataFetchInFlightRef.current === fetchKey) {
        return;
      }
      if (!options?.forceRoot && fetchedMetadataUrlsRef.current.has(url)) {
        return;
      }

      // Validate URL format while allowing private hosts (localhost, intranet, IPs).
      let validatedUrl: string | null = null;
      try {
        const withProtocol = url.startsWith("http") ? url : `https://${url}`;
        const parsed = new URL(withProtocol);
        if (/^https?:$/.test(parsed.protocol)) {
          validatedUrl = parsed.toString();
        }
      } catch {
        validatedUrl = null;
      }

      if (!validatedUrl) {
        updateMetadata({
          ...metadataRef.current,
          title: "Invalid Link",
          description: "The URL format is invalid",
          image: "",
          error: "invalid_format",
          metadataUrl: url,
          hasFetchedMetadata: true,
        });
        fetchedMetadataUrlsRef.current.add(url);
        return;
      }

      if (linkRetries.current >= 3) {
        fetchedMetadataUrlsRef.current.add(url);
        updateMetadata({
          ...metadataRef.current,
          metadataUrl: url,
          hasFetchedMetadata: true,
          error: undefined,
          image: "",
        });
        return;
      }

      linkRetries.current += 1;
      metadataFetchInFlightRef.current = fetchKey;

      const normalizeValue = (value: unknown) => {
        if (typeof value !== "string") return undefined;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      };

      const fetchPreview = async (targetUrl: string) => {
        const res = await fetch("/api/links/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl }),
        });

        if (!res.ok) return null;

        const ogData = (await res.json()) as {
          title?: string;
          description?: string;
          image?: string;
        };

        return {
          title: normalizeValue(ogData.title),
          description: normalizeValue(ogData.description),
          image: normalizeValue(ogData.image),
        };
      };

      const buildRootUrl = (rawUrl: string) => {
        const parsed = new URL(
          rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`,
        );
        return `${parsed.protocol}//${parsed.hostname}/`;
      };

      try {
        const primaryTarget = options?.forceRoot
          ? buildRootUrl(url)
          : validatedUrl;
        let preview = await fetchPreview(primaryTarget);

        const shouldTryRootFallback =
          !options?.forceRoot && (!preview || !preview.image);

        if (shouldTryRootFallback) {
          const rootUrl = buildRootUrl(url);
          if (rootUrl !== primaryTarget) {
            const rootPreview = await fetchPreview(rootUrl);
            if (rootPreview) {
              preview = {
                title: preview?.title || rootPreview.title,
                description: preview?.description || rootPreview.description,
                image: rootPreview.image || preview?.image,
              };
            }
          }
        }

        updateMetadata({
          ...metadataRef.current,
          title: preview?.title,
          description: preview?.description,
          image: preview?.image || "",
          error: undefined,
          metadataUrl: url,
          hasFetchedMetadata: true,
        });
        if (!options?.forceRoot) {
          fetchedMetadataUrlsRef.current.add(url);
        }
      } catch (error) {
        console.error("Failed to fetch link metadata:", error);
        updateMetadata({
          ...metadataRef.current,
          error: undefined,
          image: "",
          metadataUrl: url,
          hasFetchedMetadata: true,
        });
        if (!options?.forceRoot) {
          fetchedMetadataUrlsRef.current.add(url);
        }
      } finally {
        metadataFetchInFlightRef.current = null;
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

    const hasMetadataForCurrentUrl = metadata?.metadataUrl === content;
    const isPublicMetadataDisabled = !!metadata?.disablePublicMetadataFetch;

    if (
      !isPublicMetadataDisabled &&
      metadata?.error !== "invalid_format" &&
      (!hasMetadataForCurrentUrl || !metadata?.hasFetchedMetadata)
    ) {
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
                style: {
                  ...n.style,
                  width: Math.round(params.width),
                  height: Math.round(params.height),
                },
              }
            : n,
        ),
      );

      const onResize = data.onResize;
      onResize?.(id, {
        width: Math.round(params.width),
        height: Math.round(params.height),
        x: Math.round(params.x),
        y: Math.round(params.y),
      });
    },
    [id, data, setNodes],
  );

  const handleResizeEnd = useCallback(
    (
      _evt: unknown,
      params?: { width: number; height: number; x: number; y: number },
    ) => {
      if (!params) return;

      const onResizeEnd = data.onResizeEnd;
      onResizeEnd?.(id, {
        width: Math.round(params.width),
        height: Math.round(params.height),
        x: Math.round(params.x),
        y: Math.round(params.y),
      });
    },
    [id, data],
  );

  const getDomain = (url: string) => {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      return u.hostname;
    } catch {
      return "";
    }
  };

  const isPublicMetadataDisabled = !!metadata?.disablePublicMetadataFetch;
  const showInvalidState = metadata?.error === "invalid_format";

  const handleMetadataToggle = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const nextDisabled = !metadataRef.current?.disablePublicMetadataFetch;
      const nextMetadata = {
        ...metadataRef.current,
        disablePublicMetadataFetch: nextDisabled,
        metadataUrl: content,
        hasFetchedMetadata: nextDisabled,
        error:
          metadataRef.current?.error === "invalid_format"
            ? "invalid_format"
            : undefined,
      } as BlockMetadata;

      updateMetadata(nextMetadata);

      if (!nextDisabled) {
        fetchedMetadataUrlsRef.current.delete(content);
        linkRetries.current = 0;
        fetchLinkMetadata(content);
      }
    },
    [content, fetchLinkMetadata, updateMetadata],
  );

  const renderContent = () => {
    if (isEditingLink) {
      return (
        <div className="block-link-edit-container flex flex-col items-stretch justify-center h-full w-full px-4 gap-3 nodrag">
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
          <div
            className="flex items-center gap-2"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <button
              type="button"
              className={`checklist-checkbox ${
                isPublicMetadataDisabled ? "checked" : ""
              }`}
              onClick={handleMetadataToggle}
              disabled={isReadOnly}
              aria-label={dict.blocks.disablePublicMetadataFetch}
            >
              {isPublicMetadataDisabled && <Check size={11} />}
            </button>
            <span className="text-[11px] opacity-60">
              {dict.blocks.disablePublicMetadataFetch}
            </span>
          </div>
        </div>
      );
    }

    const domain = getDomain(content);
    const faviconUrl = domain
      ? `/api/proxy/image?url=${encodeURIComponent(
          `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        )}`
      : null;

    const normalizeText = (value?: string) =>
      (value || "").trim().toLowerCase();
    const normalizedContent = normalizeText(content);

    const fallbackTitle =
      domain.replace(/^www\./i, "") || content || "Untitled Link";
    const metadataTitle = (metadata?.title || "").trim();
    const metadataDescription = (metadata?.description || "").trim();

    const linkTitle =
      !isPublicMetadataDisabled &&
      metadataTitle &&
      normalizeText(metadataTitle) !== normalizedContent
        ? metadataTitle
        : fallbackTitle;

    const linkDescription =
      !isPublicMetadataDisabled && metadataDescription
        ? metadataDescription
        : "";

    const shouldShowDescription =
      !!linkDescription &&
      normalizeText(linkDescription) !== normalizeText(linkTitle) &&
      normalizeText(linkDescription) !== normalizedContent;

    const isCompactHeight =
      typeof height === "number" && height < HIDE_OG_PREVIEW_BELOW_HEIGHT;
    const hasPreviewImage = !!metadata?.image && !previewImageError;
    const shouldShowPreviewImage =
      !isPublicMetadataDisabled && hasPreviewImage && !isCompactHeight;
    const shouldShowPreviewPlaceholder =
      !isPublicMetadataDisabled && !hasPreviewImage;

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
        {shouldShowPreviewImage && (
          <div className="block-link-preview w-full aspect-video overflow-hidden relative shrink-0">
            <img
              src={`/api/proxy/image?url=${encodeURIComponent(
                metadata.image as string,
              )}`}
              alt={metadata?.title || "Link preview"}
              className="w-full h-full object-cover"
              crossOrigin="anonymous"
              onError={() => setPreviewImageError(true)}
            />
          </div>
        )}
        {shouldShowPreviewPlaceholder && (
          <div className="block-link-placeholder w-full aspect-video flex items-center justify-center bg-white/5 relative shrink-0">
            {showInvalidState ? (
              <AlertCircle size={48} className="opacity-20 text-red-500" />
            ) : (
              <Globe size={48} className="opacity-20" />
            )}
          </div>
        )}
        <div className="block-link-info p-4">
          <div className="flex items-center gap-2 mb-1 overflow-hidden">
            {faviconUrl && !faviconError && (
              <img
                src={faviconUrl}
                alt="favicon"
                className="w-4 h-4 min-w-4 object-contain opacity-80"
                crossOrigin="anonymous"
                onError={() => setFaviconError(true)}
              />
            )}
            <h4
              className={`block-link-title line-clamp-1 font-bold text-sm ${
                showInvalidState ? "text-red-400" : ""
              }`}
            >
              {linkTitle}
            </h4>
          </div>
          {shouldShowDescription && (
            <p className="block-link-description line-clamp-2 text-xs opacity-60">
              {linkDescription}
            </p>
          )}
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
      } flex flex-col p-0! relative w-full h-full`}
      style={
        {
          "--block-border-color": borderColor,
        } as React.CSSProperties
      }
    >
      <CustomNodeResizer
        nodeId={id}
        minWidth={250}
        minHeight={180}
        isVisible={!isReadOnly}
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

          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
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
        canReact={canReact}
      />

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={isConnectable}
        className={`block-handle block-handle-left z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        {!isLeftSourceConnected && <div className="handle-dot" />}
      </Handle>

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className={`block-handle block-handle-right z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        {!isRightSourceConnected && <div className="handle-dot" />}
      </Handle>

      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={isConnectable}
        className={`block-handle block-handle-top z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        {!isTopSourceConnected && <div className="handle-dot" />}
      </Handle>

      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className={`block-handle block-handle-bottom z-50! ${
          isReadOnly ? "opacity-0! pointer-events-none!" : ""
        }`}
      >
        {!isBottomSourceConnected && <div className="handle-dot" />}
      </Handle>
    </div>
  );
};

export const CanvasBlock = memo(CanvasBlockComponent);
export default CanvasBlock;
