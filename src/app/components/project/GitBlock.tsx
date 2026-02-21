"use client";
import { memo, useState, useEffect, useRef, useCallback } from "react";
import { Handle, Position, NodeResizer, useReactFlow } from "@xyflow/react";
import {
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
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { useTouchGestures } from "./hooks/useTouchGestures";
import { useTouch } from "@providers/TouchProvider";
import { CanvasBlockProps } from "./CanvasBlock";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import { BlockFooter } from "./BlockFooter";

interface GitStats {
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
    lastStats: GitStats | null;
    lastFetched: string;
  };
  [key: string]: unknown;
}

const gitFetchThrottle = new Map<string, number>();

const GitBlock = (props: CanvasBlockProps) => {
  const { id, data, selected } = props;
  const { dict, lang } = useI18n();
  const [title, setTitle] = useState(data.title || "");
  const isLocked = data.isLocked;
  const isPreviewMode = data.isPreviewMode;

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const { setNodes } = useReactFlow();

  const { rippleRef } = useTouch();

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

  const [isEditingGit, setIsEditingGit] = useState(false);

  const handleContentContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isReadOnly) return;

      e.preventDefault();
      e.stopPropagation();

      setIsEditingGit(true);

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === id) {
            return {
              ...n,
              selected: true,
            };
          }
          return { ...n, selected: false };
        }),
      );
    },
    [id, isReadOnly, setNodes],
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

  useEffect(() => {
    if (data.title !== undefined) setTitle(data.title);
  }, [data.title]);

  useEffect(() => {
    if (!isEditingGit && data.content !== content) {
      setContent(data.content);
    }
  }, [data.content, content, isEditingGit]);

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

  const metadataRef = useRef(metadata);
  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);

  // Sync metadata from props (real-time updates)
  useEffect(() => {
    try {
      const incomingMetadata = data.metadata
        ? typeof data.metadata === "string"
          ? JSON.parse(data.metadata)
          : data.metadata
        : null;

      if (JSON.stringify(incomingMetadata) !== JSON.stringify(metadata)) {
        setMetadata(incomingMetadata);
      }
    } catch {
      // Ignore parsing errors
    }
  }, [data.metadata, metadata]);

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

  const [gitError, setGitError] = useState<string | null>(null);
  const [isFetchingGit, setIsFetchingGit] = useState(false);

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

      const lastFetch = gitFetchThrottle.get(cleanedUrl) || 0;
      if (Date.now() - lastFetch < 60000) {
        return;
      }
      gitFetchThrottle.set(cleanedUrl, Date.now());

      const currentMetadata = metadataRef.current;
      const lastFetched = currentMetadata?.github?.lastFetched;
      const lastUrl = currentMetadata?.github?.url;

      if (lastFetched && (lastUrl === url || lastUrl === cleanedUrl)) {
        const diff = Date.now() - new Date(lastFetched).getTime();
        if (diff < 60000) return;
      }

      setIsFetchingGit(true);
      setGitError(null);

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
                url: cleanedUrl,
                enabledStats: currentEnabled,
                lastStats: result,
                lastFetched: new Date().toISOString(),
              },
            });
          }
        } else {
          setGitError(error || "Failed to fetch stats");
        }
      } catch (error) {
        console.error("Failed to fetch git stats:", error);
        setGitError("Network error");
      } finally {
        setIsFetchingGit(false);
      }
    },
    [
      content,
      currentUser,
      dict.project.anonymous,
      data,
      id,
      title,
      syncToYjs,
      updateMetadata,
    ],
  );

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
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
      e.target.value,
      data.reactions,
    );
  };

  // Resize Handlers
  const handleResize = useCallback(
    (
      _: unknown,
      params: { width: number; height: number; x?: number; y?: number },
    ) => {
      data.onResize?.(id, params);
    },
    [data, id],
  );

  const handleResizeEnd = useCallback(
    (
      _: unknown,
      params: { width: number; height: number; x?: number; y?: number },
    ) => {
      data.onResizeEnd?.(id, params);
    },
    [data, id],
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

  const renderContent = () => {
    const rawStats = metadata?.github?.lastStats as unknown as
      | (GitStats & { stats?: GitStats })
      | null;
    const stats = rawStats?.stats || rawStats;
    const repoUrl = content;

    const inferProvider = (url: string) => {
      if (!url) return undefined;
      if (url.includes("gitlab")) return "gitlab";
      if (url.includes("github")) return "github";
      return undefined;
    };

    const provider = stats?.provider || inferProvider(repoUrl);

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

    if (isEditingGit) {
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
        <div className="git-edit-container overflow-y-auto nowheel nodrag">
          <div className="git-input-wrapper">
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
                setGitError(null);
              }}
              onBlur={() => {
                if (content) fetchGitStats(content);
                setIsEditingGit(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (content) fetchGitStats(content);
                  setIsEditingGit(false);
                }
              }}
              placeholder={dict.blocks.gitPlaceholder}
              className="git-input"
              readOnly={isReadOnly}
            />
            {gitError && (
              <div className="git-error-container">
                <p className="git-error-message">{gitError}</p>
                <p className="git-error-hint">
                  {dict.blocks.gitUrlHint} https://git.example.com/owner/repo
                </p>
              </div>
            )}
          </div>

          <div className="git-stats-list">
            {statsOptions.map((opt) => (
              <div
                key={opt.id}
                className={`git-stat-item ${
                  enabledStats.includes(opt.id) ? "active" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => !isReadOnly && toggleStat(opt.id)}
              >
                <div className="git-stat-item-info">
                  <opt.icon size={14} className="git-stat-icon" />
                  <span className="git-stat-label">{opt.label}</span>
                </div>
                {enabledStats.includes(opt.id) && (
                  <Check size={14} className="git-check-icon" />
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
    const repoName = repoUrl?.split("/").slice(-2).join("/");

    const ProviderIcon =
      provider === "gitlab"
        ? Gitlab
        : provider === "github"
          ? Github
          : GitGraph;

    return (
      <div
        className="git-widget group relative"
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
        {!isReadOnly && !isEditingGit && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <span className="canvas-context-badge">
              {dict.canvas.rightClickToEdit}
            </span>
          </div>
        )}
        <div className="git-header">
          <ProviderIcon size={20} className="git-logo" />
          <div className="git-title-container">
            <h4 className="git-repo-name">
              {repoName || dict.blocks.gitRepository}
            </h4>
            <span className="git-repo-url">{repoUrl}</span>
          </div>
        </div>

        <div className="git-stats-grid">
          {isFetchingGit && !stats ? (
            <div className="git-loading">
              <div className="git-spinner" />
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
                  <div key={opt.id} className="git-stat-card">
                    <div className="git-stat-card-header">
                      <opt.icon size={10} />
                      <span>{opt.label}</span>
                    </div>
                    <span className="git-stat-value">{value}</span>
                  </div>
                );
              })
          )}
        </div>

        {metadata?.github?.lastFetched && (
          <div className="git-footer">
            {dict.blocks.lastUpdated}: {formatDate(metadata.github.lastFetched)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`block-card block-type-git ${selected ? "selected" : ""} ${
        isReadOnly ? "read-only" : ""
      } flex flex-col !p-0 relative w-full h-full`}
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
            <GitGraph size={14} className="block-type-icon git" />
            <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
              {dict.blocks.blockTypeGit || "GIT REPO"}
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
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-left !z-50 ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        <div className="handle-dot" />
      </Handle>

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-right !z-50 ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        <div className="handle-dot" />
      </Handle>

      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-top !z-50 ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        <div className="handle-dot" />
      </Handle>

      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={!isReadOnly}
        className={`block-handle block-handle-bottom !z-50 ${
          isReadOnly ? "!opacity-0 !pointer-events-none" : ""
        }`}
      >
        <div className="handle-dot" />
      </Handle>
    </div>
  );
};

export default memo(GitBlock);
