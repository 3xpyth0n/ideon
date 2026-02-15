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
  Lock,
  FileText,
  Link as LinkIcon,
  File as FileIcon,
  Globe,
  ExternalLink,
  Upload,
  X,
  Download,
  Github,
  Gitlab,
  GitGraph,
  Star,
  Tag,
  GitCommit,
  AlertCircle,
  GitPullRequest,
  Users,
  Check,
  Palette,
  User,
  FileCode,
  FileAudio,
  FileVideo,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import MarkdownEditor from "./MarkdownEditor";
import { createPortal } from "react-dom";
import { useI18n } from "@providers/I18nProvider";
import { useTouchGestures } from "./hooks/useTouchGestures";
import { useTouch } from "@providers/TouchProvider";
import getCaretCoordinates from "textarea-caret";
import { DEFAULT_BLOCK_WIDTH, DEFAULT_BLOCK_HEIGHT } from "./utils/constants";
import * as Y from "yjs";
import { UserPresence } from "./hooks/useProjectCanvasState";
import PaletteBlock from "./PaletteBlock";
import ContactBlock from "./ContactBlock";
import VideoBlock from "./VideoBlock";
import SnippetBlock from "./SnippetBlock";
import ChecklistBlock from "./ChecklistBlock";
import SketchBlock from "./SketchBlock";
import ProjectCoreBlock from "./ProjectCoreBlock";

import NoteBlock from "./NoteBlock";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";

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

interface GithubStats {
  stars: number;
  lastCommit: string;
  openIssues: number;
  openPulls: number;
  contributors: number;
  release: string;
  provider?: "github" | "gitlab" | "gitea" | "forgejo";
}

interface BlockMetadata {
  name?: string;
  size?: number;
  type?: string;
  lastModified?: number;
  title?: string;
  description?: string;
  image?: string;
  error?: string;
  github?: {
    url?: string;
    enabledStats: string[];
    lastStats: GithubStats | null;
    lastFetched: string;
  };
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

const githubFetchThrottle = new Map<string, number>();

const getFileIcon = (filename: string, mimeType?: string) => {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (
    mimeType?.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(
      ext || "",
    )
  ) {
    return FileImage;
  }
  if (
    mimeType?.startsWith("audio/") ||
    ["mp3", "wav", "ogg", "m4a", "flac"].includes(ext || "")
  ) {
    return FileAudio;
  }
  if (
    mimeType?.startsWith("video/") ||
    ["mp4", "mov", "avi", "webm", "mkv"].includes(ext || "")
  ) {
    return FileVideo;
  }

  switch (ext) {
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "html":
    case "css":
    case "json":
    case "py":
    case "java":
    case "c":
    case "cpp":
    case "rs":
    case "go":
    case "php":
    case "rb":
      return FileCode;
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
      return FileArchive;
    case "csv":
    case "xls":
    case "xlsx":
      return FileSpreadsheet;
    default:
      return FileIcon;
  }
};

const RemoteCursor = ({
  user,
  textarea,
}: {
  user: UserPresence;
  textarea: HTMLTextAreaElement | null;
}) => {
  if (!user || !user.cursor || !textarea) return null;

  const remoteIndex = Math.min(user.cursor.index || 0, textarea.value.length);
  const { top, left } = getCaretCoordinates(textarea, remoteIndex);

  const finalLeft = left - textarea.scrollLeft;
  const finalTop = top - textarea.scrollTop;

  const isVisible =
    finalTop >= 0 &&
    finalTop <= textarea.clientHeight &&
    finalLeft >= 0 &&
    finalLeft <= textarea.clientWidth;

  if (!isVisible) return null;

  return (
    <div
      className="block-remote-cursor pointer-events-none"
      style={{
        transform: `translate3d(${finalLeft}px, ${finalTop}px, 0)`,
        zIndex: 50,
      }}
    >
      <div className="block-remote-cursor-line-container">
        <div
          className="block-remote-cursor-line"
          style={
            { "--user-color": user.color || "#3b82f6" } as React.CSSProperties
          }
        />
        <div
          className="block-remote-cursor-label"
          style={
            { "--user-color": user.color || "#3b82f6" } as React.CSSProperties
          }
        >
          {user.displayName || user.username}
        </div>
      </div>
    </div>
  );
};

const getBlockLabel = (type: string) => {
  switch (type) {
    case "text":
      return "Text";
    case "link":
      return "Link";
    case "file":
      return "File";
    case "core":
      return "Project";
    case "github":
      return "GitHub";
    case "palette":
      return "Palette";
    case "contact":
      return "Contact";
    case "video":
      return "Video";
    case "snippet":
      return "Snippet";
    case "checklist":
      return "Checklist";
    case "note":
      return "Note";
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
    case "file":
      return FileIcon;
    case "core":
      return Globe;
    case "github":
      return Github;
    case "palette":
      return Palette;
    case "contact":
      return User;
    case "video":
      return FileVideo;
    case "snippet":
      return FileCode;
    case "checklist":
      return Check;
    case "note":
      return FileText;
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
  const initialProjectId = data.initialProjectId;

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

      if (
        blockType === "link" ||
        blockType === "github" ||
        blockType === "contact"
      ) {
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
                  isEditingLink:
                    blockType === "link" ? true : n.data.isEditingLink,
                  isEditingGithub:
                    blockType === "github" ? true : n.data.isEditingGithub,
                  isEditingContact:
                    blockType === "contact" ? true : n.data.isEditingContact,
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

  if (type === "checklist") {
    return (
      <ChecklistBlock
        {...(props as unknown as ComponentProps<typeof ChecklistBlock>)}
      />
    );
  }

  if (type === "contact") {
    return (
      <ContactBlock
        {...(props as unknown as ComponentProps<typeof ContactBlock>)}
      />
    );
  }
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [isEditingGithub, setIsEditingGithub] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [isFetchingGithub, setIsFetchingGithub] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isExpanded) {
      setShowLightbox(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateOpen(true));
      });
    } else {
      setAnimateOpen(false);
      const timer = setTimeout(() => {
        setShowLightbox(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsExpanded(false);
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isExpanded]);

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
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          // Count empty data as a try and update UI
          updateMetadata({
            ...metadataRef.current,
            title: ogData.title,
            description: ogData.description,
            image: ogData.image,
            // Clear error if success (though if empty, title might be empty, triggering loop until max retries)
            error: undefined,
          });
        }
      } catch (error) {
        console.error("Failed to fetch link metadata:", error);
      }
    },
    [updateMetadata],
  );

  const fetchGitStats = useCallback(
    async (url: string) => {
      if (!url) return;

      let cleanedUrl = url.trim();
      if (cleanedUrl.startsWith("http://"))
        cleanedUrl = cleanedUrl.replace("http://", "");
      if (cleanedUrl.startsWith("https://"))
        cleanedUrl = cleanedUrl.replace("https://", "");
      if (cleanedUrl.startsWith("www."))
        cleanedUrl = cleanedUrl.replace("www.", "");

      const lastFetch = githubFetchThrottle.get(cleanedUrl) || 0;
      if (Date.now() - lastFetch < 60000) {
        return;
      }
      githubFetchThrottle.set(cleanedUrl, Date.now());

      const currentMetadata = metadataRef.current;
      const lastFetched = currentMetadata?.github?.lastFetched;
      const lastUrl = currentMetadata?.github?.url;

      if (lastFetched && (lastUrl === url || lastUrl === cleanedUrl)) {
        const diff = Date.now() - new Date(lastFetched).getTime();
        if (diff < 60000) return;
      }

      setIsFetchingGithub(true);
      setGithubError(null);

      if (cleanedUrl !== content) {
        setContent(cleanedUrl);
        syncToYjs(cleanedUrl);
        const now = new Date().toISOString();
        const editor =
          currentUser?.displayName ||
          currentUser?.username ||
          dict.project.anonymous;
        data.onContentChange?.(
          id,
          cleanedUrl,
          now,
          editor,
          currentMetadata ? JSON.stringify(currentMetadata) : undefined,
          title,
          data.reactions,
        );
      }

      try {
        const res = await fetch(
          `/api/git/stats?url=${encodeURIComponent(cleanedUrl)}`,
        );
        let result = null;
        let error = null;
        if (res.ok) {
          result = await res.json();
        } else {
          error = (await res.json()).error;
        }

        if (result) {
          // Deep check if stats actually changed before updating metadata
          const statsChanged =
            JSON.stringify(result) !==
            JSON.stringify(currentMetadata?.github?.lastStats);

          if (statsChanged) {
            const currentEnabled = currentMetadata?.github?.enabledStats || [
              "stars",
              "release",
              "commit",
              "issues",
              "pulls",
              "contributors",
            ];
            updateMetadata({
              ...currentMetadata,
              github: {
                url,
                enabledStats: currentEnabled,
                lastStats: result.stats || result,
                lastFetched: new Date().toISOString(),
              },
            });
          }
        } else {
          console.error("Git stats error:", error);
          setGithubError(dict.blocks.githubError);
        }
      } catch (error) {
        console.error("Failed to fetch git stats:", error);
        setGithubError(dict.blocks.githubError);
      } finally {
        setIsFetchingGithub(false);
      }
    },
    [
      content,
      currentUser,
      dict.project.anonymous,
      dict.blocks.githubError,
      data.onContentChange,
      id,
      syncToYjs,
      title,
      updateMetadata,
    ],
  );

  const exitEditMode = useCallback(() => {
    if (isEditingLink) {
      setIsEditingLink(false);
      fetchLinkMetadata(content);
    }
    if (isEditingGithub) {
      setIsEditingGithub(false);
      if (content) fetchGitStats(content);
    }
    if (isEditingContact) {
      setIsEditingContact(false);
    }
  }, [
    isEditingLink,
    isEditingGithub,
    isEditingContact,
    content,
    fetchLinkMetadata,
    fetchGitStats,
  ]);

  useEffect(() => {
    if (blockType !== "github" || !content || isEditingGithub) return;

    fetchGitStats(content);

    const interval = setInterval(() => {
      fetchGitStats(content);
    }, 70000);

    return () => clearInterval(interval);
  }, [blockType, content, isEditingGithub, fetchGitStats]);

  useEffect(() => {
    if (blockType !== "link" || !content || isEditingLink) return;

    if (!metadata?.title && !metadata?.image && !metadata?.error) {
      fetchLinkMetadata(content);
    }
  }, [blockType, content, isEditingLink, fetchLinkMetadata, metadata]);

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
    if (!isEditingLink && !isEditingGithub && !isEditingContact) return;

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
  }, [isEditingLink, isEditingGithub, isEditingContact, exitEditMode]);

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

  const typingUsers = data.typingUsers;
  const isRemoteTyping = (typingUsers?.length || 0) > 0;
  const isBeingMoved = !!data.movingUserColor;

  // Force strict non-connectable in preview mode
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !initialProjectId) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/projects/${initialProjectId}/files`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const fileData = await res.json();
        const newMetadata = {
          name: fileData.name,
          size: fileData.size,
          type: fileData.type,
          lastModified: file.lastModified,
        };

        updateMetadata(newMetadata);

        const now = new Date().toISOString();
        const editor =
          currentUser?.displayName ||
          currentUser?.username ||
          dict.project.anonymous;
        const metadataString = JSON.stringify(newMetadata);
        setContent(fileData.name);
        syncToYjs(fileData.name);
        data.onContentChange?.(
          id,
          fileData.name,
          now,
          editor,
          metadataString,
          title,
          data.reactions,
        );

        // Sync metadata to yNodes
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
      } else {
        const err = await res.json();
        console.error("Upload failed:", err);
      }
    } catch (error) {
      console.error("Upload error:", error);
    }
  };

  const borderColor = isBeingMoved ? data.movingUserColor : "var(--border)";

  useEffect(() => {
    if (data.isPreviewMode) return;

    const yText = data.yText;
    if (!yText || typeof yText.observe !== "function") return;

    // We don't want to overwrite local state if we're currently editing
    if (isEditing || isEditingLink) return;

    const currentYText = yText.toString();
    if (content !== currentYText) {
      setContent(currentYText);
    }

    const observer = (event: Y.YTextEvent) => {
      if (event.transaction.local) return;
      if (isEditing || isEditingLink) return;
      setContent(yText.toString());
    };

    yText.observe(observer);
    return () => yText.unobserve(observer);
  }, [data.yText, isEditing, isEditingLink, data.isPreviewMode]);

  useEffect(() => {
    if (isEditing && contentRef.current) {
      contentRef.current.focus();
      const length = contentRef.current.value.length;
      contentRef.current.setSelectionRange(length, length);
    }
  }, [isEditing]);

  useEffect(() => {
    if ((isEditingLink || isEditingGithub) && linkInputRef.current) {
      linkInputRef.current.focus();
      const length = linkInputRef.current.value.length;
      linkInputRef.current.setSelectionRange(length, length);
    }
  }, [isEditingLink, isEditingGithub]);

  useEffect(() => {
    if (data.isEditingLink) {
      setIsEditingLink(true);
      // Reset in data so it doesn't persist
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

  useEffect(() => {
    if (data.isEditingGithub) {
      setIsEditingGithub(true);
      // Reset in data so it doesn't persist
      if (setNodes) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, isEditingGithub: false } }
              : n,
          ),
        );
      }
    }
  }, [data.isEditingGithub, id, setNodes]);

  useEffect(() => {
    if (data.isEditingContact) {
      setIsEditingContact(true);
      // Reset in data so it doesn't persist
      if (setNodes) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, isEditingContact: false } }
              : n,
          ),
        );
      }
    }
  }, [data.isEditingContact, id, setNodes]);

  const getCaretIndex = (el: HTMLTextAreaElement) => {
    return el.selectionStart || 0;
  };

  const handleCaretUpdate = (el: HTMLTextAreaElement) => {
    const onCaretMove = data.onCaretMove;
    onCaretMove?.(id, getCaretIndex(el));
  };

  const handleContentChange = (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = evt.target.value;
    setContent(newContent);
    handleCaretUpdate(evt.target);

    syncToYjs(newContent);

    const now = new Date().toISOString();
    const editor =
      currentUser?.displayName ||
      currentUser?.username ||
      dict.project.anonymous;

    const onContentChange = data.onContentChange;
    const metadataString = metadata ? JSON.stringify(metadata) : undefined;
    onContentChange?.(
      id,
      newContent,
      now,
      editor,
      metadataString,
      title,
      data.reactions,
    );
  };

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    setIsEditing(true);
    const onFocus = data.onFocus;
    onFocus?.(id, getCaretIndex(e.target));
  };

  const handleBlur = () => {
    setIsEditing(false);
    const onBlur = data.onBlur;
    onBlur?.(id);

    const now = new Date().toISOString();
    const editor =
      currentUser?.displayName ||
      currentUser?.username ||
      dict.project.anonymous;

    const onContentChange = data.onContentChange;
    const metadataString = metadata ? JSON.stringify(metadata) : undefined;
    onContentChange?.(
      id,
      content,
      now,
      editor,
      metadataString,
      title,
      data.reactions,
    );
  };

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

  const handleFileDownload = async () => {
    if (!metadata?.name || !initialProjectId) return;
    try {
      const url = `/api/projects/${initialProjectId}/files?name=${encodeURIComponent(
        metadata.name,
      )}`;
      const link = document.createElement("a");
      link.href = url;
      link.download = metadata.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Download error:", error);
    }
  };

  const handleFileDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly || !initialProjectId) return;

    if (metadata?.name) {
      try {
        await fetch(
          `/api/projects/${initialProjectId}/files?name=${encodeURIComponent(
            metadata.name,
          )}`,
          {
            method: "DELETE",
          },
        );
      } catch (error) {
        console.error("Delete physical file error:", error);
      }
    }

    updateMetadata(null);
    setContent("");
    syncToYjs("");
  };

  const renderContent = () => {
    if (blockType === "palette") {
      return <PaletteBlock {...props} isReadOnly={isReadOnly} />;
    }

    if (blockType === "contact") {
      return (
        <div
          className="h-full w-full relative group"
          onContextMenu={handleContentContextMenu}
          {...touchHandlers}
        >
          <ContactBlock
            {...props}
            isReadOnly={isReadOnly}
            isEditing={isEditingContact}
          />
          {!isReadOnly && !isEditingContact && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <span className="canvas-context-badge">
                {dict.canvas.rightClickToEdit}
              </span>
            </div>
          )}
        </div>
      );
    }

    if (blockType === "video") {
      return <VideoBlock {...props} isReadOnly={isReadOnly} />;
    }

    if (blockType === "snippet") {
      return <SnippetBlock {...props} isReadOnly={isReadOnly} />;
    }

    if (blockType === "checklist") {
      return <ChecklistBlock {...props} isReadOnly={isReadOnly} />;
    }

    if (blockType === "sketch") {
      return <SketchBlock {...props} isReadOnly={isReadOnly} />;
    }

    if (blockType === "github") {
      const rawStats = metadata?.github?.lastStats as unknown as
        | (GithubStats & { stats?: GithubStats })
        | null;
      const stats = rawStats?.stats || rawStats;
      const provider = stats?.provider || "github";

      const pullsLabel =
        provider === "gitlab" ? dict.blocks.mergeRequests : dict.blocks.pulls;

      const statsOptions = [
        { id: "stars", label: dict.blocks.stars, icon: Star },
        { id: "release", label: dict.blocks.release, icon: Tag },
        { id: "commit", label: dict.blocks.commit, icon: GitCommit },
        { id: "issues", label: dict.blocks.issues, icon: AlertCircle },
        { id: "pulls", label: pullsLabel, icon: GitPullRequest },
        { id: "contributors", label: dict.blocks.contributors, icon: Users },
      ];

      if (isEditingGithub) {
        const enabledStats = metadata?.github?.enabledStats || [
          "stars",
          "release",
          "commit",
          "issues",
          "pulls",
          "contributors",
        ];

        const toggleStat = (statId: string) => {
          const newEnabled = enabledStats.includes(statId)
            ? enabledStats.filter((id: string) => id !== statId)
            : [...enabledStats, statId];

          updateMetadata({
            ...metadata,
            github: {
              lastStats: null,
              lastFetched: "",
              ...(metadata?.github || {}),
              enabledStats: newEnabled,
            },
          });
        };

        return (
          <div className="github-edit-container overflow-y-auto nowheel nodrag">
            <div className="github-input-wrapper">
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
                  setGithubError(null);
                }}
                onBlur={() => {
                  if (content) fetchGitStats(content);
                  setIsEditingGithub(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (content) fetchGitStats(content);
                    setIsEditingGithub(false);
                  }
                }}
                placeholder={dict.blocks.githubPlaceholder}
                className="github-input"
                readOnly={isReadOnly}
              />
              {githubError && (
                <div className="github-error-container">
                  <p className="github-error-message">{githubError}</p>
                  <p className="github-error-hint">
                    {dict.blocks.githubUrlHint}{" "}
                    https://github.com/owner-name/repo-name
                  </p>
                </div>
              )}
            </div>

            <div className="github-stats-list">
              {statsOptions.map((opt) => (
                <div
                  key={opt.id}
                  className={`github-stat-item ${
                    enabledStats.includes(opt.id) ? "active" : ""
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => !isReadOnly && toggleStat(opt.id)}
                >
                  <div className="github-stat-item-info">
                    <opt.icon size={14} className="github-stat-icon" />
                    <span className="github-stat-label">{opt.label}</span>
                  </div>
                  {enabledStats.includes(opt.id) && (
                    <Check size={14} className="github-check-icon" />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      }

      const enabledStats = metadata?.github?.enabledStats || [
        "stars",
        "release",
        "commit",
        "issues",
        "pulls",
        "contributors",
      ];
      const repoUrl = content;
      const repoName = repoUrl?.split("/").slice(-2).join("/");

      const ProviderIcon =
        provider === "gitlab"
          ? Gitlab
          : provider === "gitea" || provider === "forgejo"
            ? GitGraph
            : Github;

      return (
        <div
          className="github-widget group relative"
          onContextMenu={handleContentContextMenu}
          {...touchHandlers}
          onClick={() =>
            repoUrl &&
            window.open(
              repoUrl.startsWith("http") ? repoUrl : `https://${repoUrl}`,
              "_blank",
            )
          }
        >
          {!isReadOnly && !isEditingGithub && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <span className="canvas-context-badge">
                {dict.canvas.rightClickToEdit}
              </span>
            </div>
          )}
          <div className="github-header">
            <ProviderIcon size={20} className="github-logo" />
            <div className="github-title-container">
              <h4 className="github-repo-name">
                {repoName || dict.blocks.gitRepository}
              </h4>
              <span className="github-repo-url">{repoUrl}</span>
            </div>
          </div>

          <div className="github-stats-grid">
            {isFetchingGithub && !stats ? (
              <div className="github-loading">
                <div className="github-spinner" />
              </div>
            ) : (
              statsOptions
                .filter((opt) => enabledStats.includes(opt.id))
                .map((opt) => {
                  let value = "N/A";
                  if (stats) {
                    switch (opt.id) {
                      case "stars":
                        value = stats.stars?.toString() || "0";
                        break;
                      case "release":
                        value = stats.release || "None";
                        break;
                      case "commit":
                        value =
                          stats.lastCommit && stats.lastCommit !== "N/A"
                            ? new Date(stats.lastCommit).toLocaleDateString()
                            : "N/A";
                        break;
                      case "issues":
                        value = stats.openIssues?.toString() || "0";
                        break;
                      case "pulls":
                        value = stats.openPulls?.toString() || "0";
                        break;
                      case "contributors":
                        value = stats.contributors?.toString() || "0";
                        break;
                    }
                  }
                  return (
                    <div key={opt.id} className="github-stat-card">
                      <div className="github-stat-card-header">
                        <opt.icon size={10} />
                        <span>{opt.label}</span>
                      </div>
                      <span className="github-stat-value">{value}</span>
                    </div>
                  );
                })
            )}
          </div>

          {metadata?.github?.lastFetched && (
            <div className="github-footer">
              {dict.blocks.lastUpdated}:{" "}
              {formatDate(metadata.github.lastFetched)}
            </div>
          )}
        </div>
      );
    }

    if (blockType === "link") {
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
                src={`/api/proxy/image?url=${encodeURIComponent(
                  metadata.image,
                )}`}
                alt={metadata.title || "Link preview"}
                className="w-full h-full object-cover"
                crossOrigin="anonymous"
                onError={() => setPreviewImageError(true)}
              />
              {faviconUrl && !faviconError && (
                <div className="absolute top-2 left-2 w-6 h-6 rounded bg-black/50 backdrop-blur-sm p-1">
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
                <div className="absolute top-2 left-2 w-6 h-6 rounded bg-black/50 backdrop-blur-sm p-1">
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
    }

    if (blockType === "file") {
      const isImage =
        metadata?.type?.startsWith("image/") ||
        ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(
          metadata?.name?.split(".").pop()?.toLowerCase() || "",
        );

      const imageUrl =
        metadata?.tempUrl ||
        (metadata?.name && initialProjectId
          ? `/api/projects/${initialProjectId}/files?name=${encodeURIComponent(
              metadata.name,
            )}`
          : null);

      const isUploading = metadata?.status === "uploading";
      const Icon = getFileIcon(metadata?.name || "", metadata?.type as string);
      // Layout logic based on dimensions
      const isLargeBlock = (width ?? 0) >= 500 && (height ?? 0) >= 400;
      const isVerticalLayout = (width ?? 0) >= 400 || (height ?? 0) >= 300;
      const shouldUseVerticalLayout = isImage && imageUrl && isVerticalLayout;

      return (
        <div
          className={`block-file-container flex flex-col gap-2 h-full cursor-default select-none relative ${
            isUploading ? "opacity-70" : ""
          }`}
        >
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 z-20 rounded">
              <Loader2 className="animate-spin text-white" size={24} />
            </div>
          )}
          {!metadata ? (
            <div
              className={`block-file-upload-zone flex-1 flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded transition-colors ${
                isReadOnly
                  ? "border-white/5 cursor-default"
                  : "border-white/10 hover:border-white/20 cursor-pointer"
              }`}
              onClick={() => !isReadOnly && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden-input"
                onChange={handleFileUpload}
                disabled={isReadOnly}
              />
              <Upload size={32} className="opacity-20" />
              <span className="text-xs opacity-40 text-center px-4">
                {dict.blocks.clickToUpload}
              </span>
            </div>
          ) : (
            <div
              className={`block-file-widget flex-1 min-w-0 ${
                shouldUseVerticalLayout
                  ? "flex flex-col gap-2"
                  : "flex items-center gap-3"
              }`}
            >
              {isImage && imageUrl && !previewImageError ? (
                <div
                  role="button"
                  tabIndex={0}
                  className={`block-file-thumbnail nodrag ${
                    isLargeBlock
                      ? "flex-1 min-h-0 w-full"
                      : shouldUseVerticalLayout
                        ? "w-full aspect-video"
                        : "h-12 w-16"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsExpanded(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsExpanded(true);
                    }
                  }}
                >
                  <img
                    src={imageUrl as string}
                    alt={metadata.name}
                    className={`w-full h-full select-none nodrag ${
                      isLargeBlock ? "object-contain" : "object-cover"
                    }`}
                    draggable={false}
                    crossOrigin="anonymous"
                    onError={() => setPreviewImageError(true)}
                  />
                </div>
              ) : (
                <div className="block-file-icon-container p-3 rounded bg-white/5 flex-shrink-0">
                  <Icon size={32} className="opacity-60" />
                </div>
              )}
              <div
                className={`block-file-info min-w-0 ${
                  shouldUseVerticalLayout ? "w-full px-2 pb-2" : "flex-1"
                }`}
              >
                <div className="flex items-center justify-between gap-2 w-full">
                  <h4
                    className="block-file-name truncate font-bold text-sm flex-1 text-left"
                    title={metadata.name || content}
                  >
                    {metadata.name || content}
                  </h4>
                  <span className="block-file-size text-xs opacity-40 shrink-0 whitespace-nowrap text-right ml-2 leading-none">
                    {metadata.size
                      ? `${(metadata.size / 1024).toFixed(1)} KB`
                      : "Unknown size"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="block-content relative min-h-0 flex-1 overflow-visible">
        <textarea
          ref={contentRef}
          value={content}
          onChange={handleContentChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyUp={(e) => handleCaretUpdate(e.currentTarget)}
          onClick={(e) => handleCaretUpdate(e.currentTarget)}
          placeholder={dict.blocks.contentPlaceholder || "Start noting..."}
          className={`block-description editing nodrag nowheel ${
            isEditing
              ? "opacity-100 z-10"
              : "opacity-0 -z-10 pointer-events-none absolute inset-0"
          }`}
          spellCheck={false}
          autoFocus={isEditing}
          readOnly={isReadOnly}
        />

        {!isEditing && (
          <div
            className={`block-description whitespace-pre-wrap relative cursor-text h-full w-full markdown-content ${
              isReadOnly ? "cursor-default" : ""
            }`}
            onClick={() => !isReadOnly && setIsEditing(true)}
          >
            {content ? (
              <MarkdownEditor
                content={content}
                isReadOnly={true}
                className="block-description whitespace-pre-wrap relative cursor-text h-full w-full markdown-content"
              />
            ) : (
              <span className="opacity-30 italic">
                {dict.blocks.contentPlaceholder || "Start noting..."}
              </span>
            )}
          </div>
        )}

        {isEditing &&
          typingUsers?.map((u: UserPresence) => (
            <RemoteCursor key={u.id} user={u} textarea={contentRef.current} />
          ))}

        {!isEditing && isRemoteTyping && isHovered && (
          <div className="block-typing-indicator">
            <div
              className="block-typing-indicator-bubble"
              style={
                {
                  "--user-color": typingUsers![0].color || "#3b82f6",
                } as React.CSSProperties
              }
            >
              {typingUsers![0].username}{" "}
              {dict.blocks.isTyping || "is typing..."}
            </div>
          </div>
        )}
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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

      <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit]">
        <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
          <div className="flex items-center gap-2">
            <Icon
              size={14}
              className={`block-type-icon ${
                blockType === "text" || !blockType ? "text" : blockType
              }`}
            />
            <span className="text-tiny uppercase tracking-wider opacity-50 font-bold">
              {dict.common[
                `blockType${blockType.charAt(0).toUpperCase()}${blockType.slice(
                  1,
                )}` as keyof typeof dict.common
              ] || blockType}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {blockType === "file" && metadata && (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFileDownload();
                  }}
                  className="p-1 rounded hover:bg-white/10 opacity-40 hover:opacity-100 transition-all"
                  title={dict.blocks.download || "Download"}
                >
                  <Download size={14} />
                </button>
                {!isReadOnly && (
                  <button
                    onClick={handleFileDelete}
                    className="p-1 rounded hover:bg-white/10 opacity-40 hover:opacity-100 transition-all text-red-400"
                    title={dict.common.delete || "Delete"}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            {blockType !== "file" && (
              <div className="flex items-center gap-2">
                <input
                  value={title}
                  onChange={handleTitleChange}
                  className="block-title"
                  placeholder="..."
                  readOnly={isReadOnly}
                />
              </div>
            )}
          </div>
        </div>

        <div className="block-content flex-1 flex flex-col min-h-0">
          {renderContent()}
        </div>

        <div className="block-author-container mt-2 pt-3 px-4 pb-3 shrink-0">
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

      <BlockReactions
        reactions={data.reactions}
        onReact={handleReact}
        onRemoveReaction={handleRemoveReaction}
        currentUserId={currentUser?.id}
        isReadOnly={isReadOnly}
      />

      {/* Connection Handles */}
      <Handle
        id="left-target"
        type="source"
        position={Position.Left}
        isConnectable={isConnectable}
        className={`block-handle block-handle-left !z-50 !top-[40%] ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        {!isLeftTargetConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={isConnectable}
        className={`block-handle block-handle-left !z-50 !top-[60%] ${
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
        className={`block-handle block-handle-right !z-50 !top-[40%] ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        {!isRightSourceConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="right-target"
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className={`block-handle block-handle-right !z-50 !top-[60%] ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        {!isRightTargetConnected && <div className="handle-dot" />}
      </Handle>

      <Handle
        id="top-target"
        type="source"
        position={Position.Top}
        isConnectable={isConnectable}
        className={`block-handle block-handle-top !z-50 !left-[40%] ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        {!isTopTargetConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={isConnectable}
        className={`block-handle block-handle-top !z-50 !left-[60%] ${
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
        className={`block-handle block-handle-bottom !z-50 !left-[40%] ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        {!isBottomSourceConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="bottom-target"
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className={`block-handle block-handle-bottom !z-50 !left-[60%] ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        {!isBottomTargetConnected && <div className="handle-dot" />}
      </Handle>

      {/* Lightbox Portal */}
      {mounted &&
        showLightbox &&
        blockType === "file" &&
        metadata?.name &&
        initialProjectId &&
        createPortal(
          <div
            className={`lightbox-overlay ${animateOpen ? "open" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setIsExpanded(false);
            }}
          >
            <div className="lightbox-content">
              <img
                src={`/api/projects/${initialProjectId}/files?name=${encodeURIComponent(
                  metadata.name,
                )}`}
                alt={metadata.name}
                className="lightbox-image"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className="lightbox-close-button"
                onClick={() => setIsExpanded(false)}
              >
                <X size={24} />
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export const CanvasBlock = memo(CanvasBlockComponent);
export default CanvasBlock;
