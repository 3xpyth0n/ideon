"use client";
import { memo, useState, useEffect, useRef, useCallback } from "react";
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
import ReactMarkdown from "react-markdown";
import { createPortal } from "react-dom";
import { useI18n } from "@providers/I18nProvider";
import getCaretCoordinates from "textarea-caret";
import { DEFAULT_BLOCK_WIDTH, DEFAULT_BLOCK_HEIGHT } from "./utils/constants";
import * as Y from "yjs";
import { UserPresence } from "./hooks/useProjectCanvasState";
import PaletteBlock from "./PaletteBlock";
import ContactBlock from "./ContactBlock";
import VideoBlock from "./VideoBlock";
import SnippetBlock from "./SnippetBlock";
import ChecklistBlock from "./ChecklistBlock";

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
    | "checklist";
  metadata?: string;
  isLocked?: boolean;
  isPreviewMode?: boolean;
  isEditingLink?: boolean;
  isEditingGithub?: boolean;
  isEditingContact?: boolean;
  status?: string;
  rationale?: string;
  intent?: string;
  onContentChange?: (
    blockId: string,
    content: string,
    updatedAt: string,
    lastEditor: string,
    metadata?: string,
    title?: string,
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

const CanvasBlockComponent = (props: CanvasBlockProps) => {
  const { id, data, selected } = props;
  const { dict, lang } = useI18n();
  const { setNodes, getNode, getEdges } = useReactFlow();

  const isLocked = data.isLocked;
  const isPreviewMode = data.isPreviewMode;
  const ownerId = data.ownerId;
  const projectOwnerId = data.projectOwnerId;
  const initialProjectId = data.initialProjectId;
  const currentUser = data.currentUser;
  const blockType = data.blockType || "text";

  const [title, setTitle] = useState(data.title || "");
  const [content, setContent] = useState(data.content || "");
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
      return data.metadata ? JSON.parse(data.metadata) : null;
    } catch (_e) {
      return null;
    }
  });

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
      });
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
        dict.common.anonymous;
      const metadataString = newMetadata
        ? JSON.stringify(newMetadata)
        : undefined;
      data.onContentChange?.(id, content, now, editor, metadataString, title);

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
    [currentUser, dict.common.anonymous, data, id, content, title, setNodes],
  );

  const linkRetries = useRef(0);

  useEffect(() => {
    linkRetries.current = 0;
  }, [content]);

  const fetchLinkMetadata = useCallback(
    async (url: string) => {
      if (!url) return;

      // Simple regex to validate domain format (e.g. example.com)
      // Allow http/https optional, domain required, TLD required (2+ chars)
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
          // If we got empty data, it counts as a try.
          // If we have retried enough, the next call will hit the limit.
          // We update metadata regardless to ensure UI reflects the attempt (even if empty)
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
          dict.common.anonymous;
        data.onContentChange?.(
          id,
          cleanedUrl,
          now,
          editor,
          currentMetadata ? JSON.stringify(currentMetadata) : undefined,
          title,
        );
      }

      try {
        const response = await fetch("/api/git/stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: cleanedUrl }),
        });
        if (response.ok) {
          const result = await response.json();

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
                lastStats: result,
                lastFetched: new Date().toISOString(),
              },
            });
          }
        } else {
          setGithubError(dict.common.githubError);
        }
      } catch (error) {
        console.error("Failed to fetch git stats:", error);
        setGithubError(dict.common.githubError);
      } finally {
        setIsFetchingGithub(false);
      }
    },
    [
      content,
      currentUser,
      dict.common.anonymous,
      dict.common.githubError,
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
        dict.common.anonymous;
      data.onContentChange?.(
        id,
        content,
        now,
        editor,
        metadata ? JSON.stringify(metadata) : undefined,
        newTitle,
      );
    },
    [id, data, currentUser, dict.common.anonymous, metadata, content],
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

  const typingUsers = data.typingUsers;
  const isRemoteTyping = (typingUsers?.length || 0) > 0;
  const isBeingMoved = !!data.movingUserColor;

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;

  const isReadOnly =
    isPreviewMode || (isLocked ? !isOwner && !isProjectOwner : false);

  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title]);

  useEffect(() => {
    try {
      setMetadata(data.metadata ? JSON.parse(data.metadata) : null);
    } catch (_e) {
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
          dict.common.anonymous;
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
    const yText = data.yText;
    if (!yText) return;

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
  }, [data.yText, isEditing, isEditingLink]);

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
      dict.common.anonymous;

    const onContentChange = data.onContentChange;
    const metadataString = metadata ? JSON.stringify(metadata) : undefined;
    onContentChange?.(id, newContent, now, editor, metadataString, title);
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
      dict.common.anonymous;

    const onContentChange = data.onContentChange;
    const metadataString = metadata ? JSON.stringify(metadata) : undefined;
    onContentChange?.(id, content, now, editor, metadataString, title);
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

  const getBlockIcon = () => {
    switch (blockType) {
      case "link":
        return <LinkIcon size={14} className="block-type-icon link" />;
      case "file":
        return <FileIcon size={14} className="block-type-icon file" />;
      case "github":
        return <Github size={14} className="block-type-icon github" />;
      case "palette":
        return <Palette size={14} className="block-type-icon palette" />;
      case "contact":
        return <User size={14} className="block-type-icon contact" />;
      case "video":
        return <FileVideo size={14} className="block-type-icon video" />;
      case "snippet":
        return <FileCode size={14} className="block-type-icon snippet" />;
      case "checklist":
        return <Check size={14} className="block-type-icon checklist" />;
      default:
        return <FileText size={14} className="block-type-icon text" />;
    }
  };

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
        <ContactBlock
          {...props}
          isReadOnly={isReadOnly}
          isEditing={isEditingContact}
        />
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

    if (blockType === "github") {
      const stats = metadata?.github?.lastStats;
      const provider = stats?.provider || "github";

      const pullsLabel =
        provider === "gitlab" ? dict.common.mergeRequests : dict.common.pulls;

      const statsOptions = [
        { id: "stars", label: dict.common.stars, icon: Star },
        { id: "release", label: dict.common.release, icon: Tag },
        { id: "commit", label: dict.common.commit, icon: GitCommit },
        { id: "issues", label: dict.common.issues, icon: AlertCircle },
        { id: "pulls", label: pullsLabel, icon: GitPullRequest },
        { id: "contributors", label: dict.common.contributors, icon: Users },
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
                    dict.common.anonymous;
                  data.onContentChange?.(
                    id,
                    val,
                    now,
                    editor,
                    metadata ? JSON.stringify(metadata) : undefined,
                    title,
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
                placeholder={dict.common.githubPlaceholder}
                className="github-input"
                readOnly={isReadOnly}
              />
              {githubError && (
                <div className="github-error-container">
                  <p className="github-error-message">{githubError}</p>
                  <p className="github-error-hint">
                    {dict.common.githubUrlHint}{" "}
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
          className="github-widget"
          onClick={() =>
            repoUrl &&
            window.open(
              repoUrl.startsWith("http") ? repoUrl : `https://${repoUrl}`,
              "_blank",
            )
          }
        >
          <div className="github-header">
            <ProviderIcon size={20} className="github-logo" />
            <div className="github-title-container">
              <h4 className="github-repo-name">
                {repoName || dict.common.gitRepository}
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
              {dict.common.lastUpdated}:{" "}
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
                  dict.common.anonymous;
                data.onContentChange?.(
                  id,
                  val,
                  now,
                  editor,
                  metadata ? JSON.stringify(metadata) : undefined,
                  title,
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
              placeholder={dict.common.linkPlaceholder}
              className="link-input"
              readOnly={isReadOnly}
            />
          </div>
        );
      }

      const domain = getDomain(content);
      const faviconUrl = domain
        ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
        : null;

      return (
        <div
          className="block-link-widget flex-1 flex flex-col min-h-0 overflow-hidden rounded bg-white/5 transition-colors cursor-pointer"
          onClick={() =>
            content &&
            window.open(
              content.startsWith("http") ? content : `https://${content}`,
              "_blank",
            )
          }
        >
          {metadata?.image ? (
            <div className="block-link-preview w-full aspect-video overflow-hidden relative flex-shrink-0">
              <img
                src={metadata.image}
                alt={metadata.title || "Link preview"}
                className="w-full h-full object-cover"
              />
              {faviconUrl && (
                <div className="absolute top-2 left-2 w-6 h-6 rounded bg-black/50 backdrop-blur-sm p-1">
                  <img
                    src={faviconUrl}
                    alt="favicon"
                    className="w-full h-full object-contain"
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
              {faviconUrl && (
                <div className="absolute top-2 left-2 w-6 h-6 rounded bg-black/50 backdrop-blur-sm p-1">
                  <img
                    src={faviconUrl}
                    alt="favicon"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
            </div>
          )}
          <div className="block-link-info p-4">
            <div className="flex items-center gap-2 mb-1 overflow-hidden">
              {faviconUrl && (
                <img
                  src={faviconUrl}
                  alt="favicon"
                  className="w-4 h-4 min-w-[16px] object-contain opacity-80"
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
                {dict.common.clickToUpload}
              </span>
            </div>
          ) : (
            <div className="block-file-widget flex-1 flex items-center gap-3 min-w-0">
              {isImage && imageUrl ? (
                <div
                  role="button"
                  tabIndex={0}
                  className="block-file-thumbnail nodrag"
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
                    className="w-full h-full object-cover select-none nodrag"
                    draggable={false}
                  />
                </div>
              ) : (
                <div className="block-file-icon-container p-3 rounded bg-white/5 flex-shrink-0">
                  <Icon size={32} className="opacity-60" />
                </div>
              )}
              <div className="block-file-info flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="block-file-name truncate font-bold text-sm">
                    {metadata.name || content}
                  </h4>
                </div>
                <p className="block-file-size text-[10px] opacity-40 mt-1">
                  {metadata.size
                    ? `${(metadata.size / 1024).toFixed(1)} KB`
                    : "Unknown size"}
                </p>
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
          placeholder={dict.common.contentPlaceholder || "Start noting..."}
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
              <ReactMarkdown>{content}</ReactMarkdown>
            ) : (
              <span className="opacity-30 italic">
                {dict.common.contentPlaceholder || "Start noting..."}
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
              {dict.common.isTyping || "is typing..."}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (
      (blockType === "link" ||
        blockType === "github" ||
        blockType === "contact") &&
      !isReadOnly
    ) {
      e.preventDefault();
      if (blockType === "link") setIsEditingLink(true);
      if (blockType === "github") setIsEditingGithub(true);
      if (blockType === "contact") setIsEditingContact(true);
    }
  };

  return (
    <div
      ref={blockRef}
      className={`block-card block-type-${blockType} ${
        selected ? "selected" : ""
      } ${isRemoteTyping ? "remote-typing" : ""} ${
        isBeingMoved ? "is-moving" : ""
      } ${isReadOnly ? "read-only" : ""} flex flex-col !p-0`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
      style={
        {
          "--block-border-color": borderColor,
        } as React.CSSProperties
      }
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
          {getBlockIcon()}
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
                title={dict.common.download || "Download"}
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
            <div className="flex items-center gap-2 opacity-50">
              <input
                value={title}
                onChange={handleTitleChange}
                className="block-title text-[10px] font-bold tracking-widest text-right focus:opacity-100 transition-opacity"
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

      {/* Connection Handles */}
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
