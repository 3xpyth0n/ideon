"use client";

import {
  ReactFlow,
  Controls,
  ReactFlowProvider,
  ControlButton,
  Panel,
  Background,
  BackgroundVariant,
  SelectionMode,
  ConnectionMode,
  useViewport,
  Node,
  Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { getAvatarUrl } from "@lib/utils";
import CanvasBlock, { BlockData } from "./CanvasBlock";
import ProjectCoreBlock from "./ProjectCoreBlock";
import PaletteBlock from "./PaletteBlock";
import ContactBlock from "./ContactBlock";
import VideoBlock from "./VideoBlock";
import SnippetBlock from "./SnippetBlock";
import ChecklistBlock from "./ChecklistBlock";
import CanvasEdge from "./CanvasEdge";
import { InviteUserModal } from "./InviteUserModal";
import { TransferBlockModal } from "./TransferBlockModal";
import { ProjectCanvasErrorBoundary } from "./ProjectCanvasErrorBoundary";
import { useI18n } from "@providers/I18nProvider";
import { Button } from "@components/ui/Button";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { useUser } from "@providers/UserProvider";
import {
  useState,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import {
  Plus,
  Minus,
  Maximize,
  FileCode,
  ArrowLeft,
  Check,
  RefreshCw,
  FileText,
  Link as LinkIcon,
  File as FileIcon,
  Github,
  Palette,
  User,
  Video,
  ListTodo,
  Undo2,
  Redo2,
  Figma,
  Share2,
} from "lucide-react";
import { DecisionHistory } from "./DecisionHistory";
import { ShareModal } from "./ShareModal";
import { DownloadButton } from "./DownloadButton";
import { CommandPalette, type Command } from "./CommandPalette";

import { Modal } from "@components/ui/Modal";
import { CustomConnectionLine } from "./CustomConnectionLine";
import {
  useProjectCanvasState,
  UserPresence,
} from "./hooks/useProjectCanvasState";
import { DEFAULT_VIEWPORT } from "./utils/constants";

const FIXED_EXTENT: [[number, number], [number, number]] = [
  [-5000, -4000],
  [8000, 5000],
];
import { ProjectCanvasProps } from "./utils/types";

const RemoteCursors = ({
  activeUsers,
  currentUserId,
}: {
  activeUsers: UserPresence[];
  currentUserId?: string;
}) => {
  const { x: vX, y: vY, zoom } = useViewport();

  return (
    <>
      {activeUsers.map((user) => {
        if (!user.cursor || user.id === currentUserId) return null;
        const x = user.cursor.x * zoom + vX;
        const y = user.cursor.y * zoom + vY;

        if (isNaN(x) || isNaN(y)) return null;

        return (
          <div
            key={user.id}
            className="remote-cursor"
            style={
              {
                "--cursor-x": `${x}px`,
                "--cursor-y": `${y}px`,
                "--user-color": user.color || "#000",
              } as React.CSSProperties
            }
          >
            {!user.isTyping && (
              <>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="remote-cursor-svg"
                >
                  <path d="M0 0L14 14L7 14L0 21V0Z" fill="currentColor" />
                </svg>
                <div className="remote-cursor-name">
                  {user.displayName || user.username}
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
};

const blockTypes = {
  text: CanvasBlock,
  link: CanvasBlock,
  file: CanvasBlock,
  github: CanvasBlock,
  palette: PaletteBlock,
  contact: ContactBlock,
  video: VideoBlock,
  snippet: SnippetBlock,
  checklist: ChecklistBlock,
  core: ProjectCoreBlock,
};

const linkTypes = {
  connection: CanvasEdge,
};

function ProjectCanvasContent({ initialProjectId }: ProjectCanvasProps) {
  const { dict } = useI18n();
  const { user } = useUser();
  const [currentUser, setCurrentUser] = useState<UserPresence | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLocalSynced, setIsLocalSynced] = useState(false);

  useEffect(() => {
    if (user) {
      setCurrentUser({
        id: user.id,
        username: user.username || "Guest",
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        color: user.color || undefined,
      });
    }
  }, [user]);

  const [yjsData, setYjsData] = useState<{
    yDoc: Y.Doc;
    provider: WebsocketProvider;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !initialProjectId) return;

    const doc = new Y.Doc();
    const wsProvider = new WebsocketProvider(
      `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
        window.location.host
      }/yjs`,
      `project-${initialProjectId}`,
      doc,
      { connect: true, params: {} },
    );

    const indexeddbProvider = new IndexeddbPersistence(
      `project-${initialProjectId}`,
      doc,
    );

    indexeddbProvider.on("synced", () => {
      setIsLocalSynced(true);
    });

    setYjsData({ yDoc: doc, provider: wsProvider });

    return () => {
      wsProvider.destroy();
      indexeddbProvider.destroy();
      doc.destroy();
      setIsLocalSynced(false);
    };
  }, [initialProjectId]);

  const { yDoc, provider } = yjsData || { yDoc: null, provider: null };

  useEffect(() => {
    if (!provider) return;
    const onStatus = ({ status }: { status: string }) => {
      setIsConnected(status === "connected");
    };
    provider.on("status", onStatus);
    return () => provider.off("status", onStatus);
  }, [provider]);

  const yBlocks = useMemo(() => {
    if (!yDoc) return null;
    return yDoc.getMap("blocks") as Y.Map<Node<BlockData>>;
  }, [yDoc]);

  const yLinks = useMemo(() => {
    if (!yDoc) return null;
    return yDoc.getMap("links") as Y.Map<Edge>;
  }, [yDoc]);

  const yContents = useMemo(() => {
    if (!yDoc) return null;
    return yDoc.getMap("contents") as Y.Map<Y.Text>;
  }, [yDoc]);

  const {
    blocks,
    setBlocks: _setBlocks,
    onBlocksChange,
    links,
    setLinks: _setLinks,
    isLoading,
    blockToDelete,
    setBlockToDelete,
    blocksToDelete,
    setBlocksToDelete,
    zoom,
    contextMenu,
    setContextMenu,
    isInviteModalOpen,
    setIsInviteModalOpen,
    transferBlock,
    setTransferBlock,
    isPreviewMode,
    setIsPreviewMode: _setIsPreviewMode,
    selectedStateId,
    setSelectedStateId: _setSelectedStateId,
    isInitialized: _isInitialized,
    handleFitView,
    handleZoomIn,
    handleZoomOut,
    onViewportChange,
    onMove,
    handleDeleteState,
    handleRenameState,
    handleSaveState,
    onLinksChange,
    onBlockDragStart,
    onBlockDrag,
    onBlockDragStop,
    onConnect,
    handleDeleteBlock: _handleDeleteBlock,
    handleToggleLock,
    handleTransferBlock,
    confirmDelete,
    onKeyDown,
    onPointerMove,
    onPointerLeave,
    handlePreview,
    handleApplyState,
    onBlockContextMenu,
    onPaneContextMenu,
    onPaneClick,
    onBlockClick,
    onLinkClick,
    handleCreateBlock,
    activeUsers,
    shareCursor,
    setShareCursor,
    projectOwnerId,
    undo,
    redo,
    canUndo,
    canRedo,
    hasSeenOnboarding,
  } = useProjectCanvasState(
    initialProjectId,
    currentUser,
    yBlocks,
    yLinks,
    yContents,
    provider?.awareness || null,
    isLocalSynced,
  );

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const commands = useMemo<Command[]>(() => {
    if (isPreviewMode) return [];

    const createCommands: Command[] = [
      {
        id: "create-text",
        label: dict.common.newBlock || "New Note",
        icon: <FileText size={18} />,
        keywords: ["text", "note", "markdown"],
        action: () => handleCreateBlock(undefined, undefined, "text"),
        category: "create",
      },
      {
        id: "create-link",
        label: dict.common.newLink || "New Link",
        icon: <LinkIcon size={18} />,
        keywords: ["link", "url", "website", "bookmark"],
        action: () => handleCreateBlock(undefined, undefined, "link"),
        category: "create",
      },
      {
        id: "create-file",
        label: dict.common.newFile || "New File",
        icon: <FileIcon size={18} />,
        keywords: ["file", "upload", "document", "image"],
        action: () => handleCreateBlock(undefined, undefined, "file"),
        category: "create",
      },
      {
        id: "create-github",
        label: dict.common.newGithub || "New GitHub",
        icon: <Github size={18} />,
        keywords: ["github", "repo", "git", "issue", "pr"],
        action: () => handleCreateBlock(undefined, undefined, "github"),
        category: "create",
      },
      {
        id: "create-palette",
        label: dict.common.newPalette || "New Palette",
        icon: <Palette size={18} />,
        keywords: ["palette", "color", "design", "theme"],
        action: () => handleCreateBlock(undefined, undefined, "palette"),
        category: "create",
      },
      {
        id: "create-contact",
        label: dict.common.newContact || "New Contact",
        icon: <User size={18} />,
        keywords: ["contact", "person", "user", "phone", "email"],
        action: () => handleCreateBlock(undefined, undefined, "contact"),
        category: "create",
      },
      {
        id: "create-video",
        label: dict.common.newVideo || "New Video",
        icon: <Video size={18} />,
        keywords: ["video", "youtube", "loom", "media"],
        action: () => handleCreateBlock(undefined, undefined, "video"),
        category: "create",
      },
      {
        id: "create-snippet",
        label: dict.common.newSnippet || "New Snippet",
        icon: <FileCode size={18} />,
        keywords: ["snippet", "code", "dev", "script"],
        action: () => handleCreateBlock(undefined, undefined, "snippet"),
        category: "create",
      },
      {
        id: "create-checklist",
        label: dict.common.newChecklist || "New Checklist",
        icon: <ListTodo size={18} />,
        keywords: ["checklist", "todo", "task", "list"],
        action: () => handleCreateBlock(undefined, undefined, "checklist"),
        category: "create",
      },
    ];

    const navigateCommands: Command[] = [
      {
        id: "nav-home",
        label: dict.common.fitView || "Fit View",
        icon: <Maximize size={18} />,
        keywords: ["home", "reset", "fit", "view"],
        action: () => handleFitView(),
        category: "navigate",
      },
    ];

    return [...createCommands, ...navigateCommands];
  }, [dict, handleCreateBlock, handleFitView, isPreviewMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const isValidConnection = useCallback(
    (connection: { source: string; target: string }) => {
      return connection.source !== connection.target;
    },
    [],
  );

  const isTyping = useMemo(() => {
    if (!currentUser) return false;
    return activeUsers.some((u) => u.id === currentUser.id && u.isTyping);
  }, [activeUsers, currentUser]);

  const contextMenuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (contextMenu && contextMenuRef.current) {
      const menu = contextMenuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 10;

      let adjustedTop = contextMenu.top;
      let adjustedLeft = contextMenu.left;

      // Vertical repositioning: if it would overflow bottom, show it above the click point
      if (adjustedTop + rect.height > viewportHeight - margin) {
        adjustedTop = adjustedTop - rect.height;
      }

      // Horizontal repositioning: if it would overflow right, show it to the left of the click point
      if (adjustedLeft + rect.width > viewportWidth - margin) {
        adjustedLeft = adjustedLeft - rect.width;
      }

      // Final clamping to ensure it's still within viewport bounds with margin
      adjustedTop = Math.max(
        margin,
        Math.min(adjustedTop, viewportHeight - rect.height - margin),
      );
      adjustedLeft = Math.max(
        margin,
        Math.min(adjustedLeft, viewportWidth - rect.width - margin),
      );

      menu.style.setProperty("--menu-top", `${adjustedTop}px`);
      menu.style.setProperty("--menu-left", `${adjustedLeft}px`);
      menu.style.opacity = "1";
    }
  }, [contextMenu]);

  const contextMenuBlock = useMemo(() => {
    if (!contextMenu?.id) return null;
    return blocks.find((n: Node<BlockData>) => n.id === contextMenu.id);
  }, [contextMenu?.id, blocks]);

  const isCoreOnly = useMemo(() => {
    return blocks.length === 1 && blocks[0].type === "core";
  }, [blocks]);

  const blocksWithPreview = useMemo(() => {
    return blocks.map((block) => ({
      ...block,
      data: {
        ...block.data,
        isPreviewMode,
      },
    }));
  }, [blocks, isPreviewMode]);

  return (
    <>
      <svg
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          pointerEvents: "none",
        }}
      >
        <defs>
          <marker
            id="connection-arrow"
            viewBox="0 0 20 10"
            refX="19"
            refY="5"
            markerWidth="16"
            markerHeight="8"
            orient="auto"
          >
            <path d="M 0 0 L 19 5 L 0 10 L 4 5 Z" fill="var(--text-main)" />
          </marker>
        </defs>
      </svg>
      <div
        className={`project-canvas-container ${
          isPreviewMode ? "preview-mode" : ""
        }`}
        onKeyDown={onKeyDown}
        tabIndex={0}
      >
        {isLoading && (
          <div className="loading-overlay">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        <ReactFlow
          nodes={blocksWithPreview}
          edges={links}
          onNodesChange={isPreviewMode ? undefined : onBlocksChange}
          onEdgesChange={isPreviewMode ? undefined : onLinksChange}
          onNodeDragStart={isPreviewMode ? undefined : onBlockDragStart}
          onNodeDrag={isPreviewMode ? undefined : onBlockDrag}
          onNodeDragStop={isPreviewMode ? undefined : onBlockDragStop}
          onConnect={isPreviewMode ? undefined : onConnect}
          isValidConnection={isValidConnection}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onBlockContextMenu}
          onPaneClick={onPaneClick}
          onNodeClick={onBlockClick}
          onEdgeClick={onLinkClick}
          onMove={onMove}
          onViewportChange={onViewportChange}
          nodeTypes={blockTypes}
          edgeTypes={linkTypes}
          connectionLineComponent={CustomConnectionLine}
          defaultViewport={DEFAULT_VIEWPORT}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={30}
          translateExtent={FIXED_EXTENT}
          minZoom={0.1}
          maxZoom={4}
          deleteKeyCode={null}
          selectionOnDrag={!isPreviewMode}
          selectionMode={SelectionMode.Partial}
          selectionKeyCode={isPreviewMode ? null : "Shift"}
          nodesDraggable={!isPreviewMode}
          nodesConnectable={!isPreviewMode}
          elementsSelectable={!isPreviewMode}
          edgesReconnectable={!isPreviewMode}
          panOnScroll
          panOnDrag={true}
          multiSelectionKeyCode="Control"
          fitView
          className="project-canvas"
        >
          <div
            className={`canvas-cursor-overlay ${
              isTyping ? "hide-native-cursor" : ""
            }`}
          />
          <Panel
            position="top-left"
            className="pointer-events-none !m-0"
            style={{ width: "100%", height: "100%", zIndex: 1500 }}
          >
            <RemoteCursors
              activeUsers={activeUsers}
              currentUserId={currentUser?.id}
            />
          </Panel>
          <Background
            variant={BackgroundVariant.Dots}
            gap={25}
            size={1.5}
            color="var(--text-muted)"
            className="opacity-20"
          />
          {!hasSeenOnboarding && isCoreOnly && !isPreviewMode && (
            <Panel
              position="bottom-center"
              className="onboarding-panel"
              role="status"
              aria-label="Magic Paste Onboarding Hint"
            >
              <div className="onboarding-content">
                <div className="onboarding-icons">
                  <Github size={20} />
                  <div className="separator" />
                  <Figma size={20} />
                  <div className="separator" />
                  <FileIcon size={20} />
                </div>
                <div className="onboarding-text">
                  <h3>Magic Paste</h3>
                  <p>{dict.common.onboardingHint}</p>
                </div>
              </div>
            </Panel>
          )}
          <Panel position="top-left" className="!m-6" style={{ zIndex: 2000 }}>
            {!isPreviewMode && (
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold tracking-[0.2em] opacity-40 select-none">
                  {dict.common.shareCursor}
                </span>
                <input
                  type="checkbox"
                  className="theme-checkbox"
                  checked={shareCursor}
                  onChange={(e) => {
                    e.stopPropagation();
                    setShareCursor(e.target.checked);
                  }}
                />
              </div>
            )}
          </Panel>

          <Panel
            position="top-right"
            className="flex items-center gap-2 !m-6"
            style={{ zIndex: 2000 }}
          >
            {isPreviewMode && (
              <div className="preview-mode-banner">
                <span className="preview-mode-text">
                  {dict.common.previewMode}
                </span>
                <div className="preview-mode-actions">
                  <button
                    onClick={() => handlePreview(null)}
                    className="preview-action-btn preview-return-btn"
                    title={dict.common.returnToPresent}
                  >
                    <ArrowLeft size={14} />
                    <span className="preview-btn-text">
                      {dict.common.return}
                    </span>
                  </button>
                  {currentUser?.id === projectOwnerId && (
                    <button
                      onClick={() =>
                        selectedStateId && handleApplyState(selectedStateId)
                      }
                      className="preview-action-btn preview-apply-btn"
                      title={dict.common.apply}
                      disabled={!selectedStateId}
                    >
                      <Check size={14} />
                      <span className="preview-btn-text">
                        {dict.common.apply}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              {!isPreviewMode && (
                <div className="flex gap-2 mr-2">
                  {activeUsers.map((u) => (
                    <div
                      key={u.id}
                      className="user-presence-item relative flex-shrink-0"
                    >
                      <div
                        className="user-presence-avatar"
                        style={{ borderColor: u.color || "#000" }}
                      >
                        <img
                          src={getAvatarUrl(u.avatarUrl, u.username)}
                          alt={u.displayName || u.username}
                          className="user-presence-avatar-img"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      <div
                        className="user-presence-tooltip"
                        style={
                          {
                            "--user-color": u.color || "#000",
                          } as React.CSSProperties
                        }
                      >
                        {u.displayName || u.username}
                        <div className="user-presence-tooltip-arrow" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setIsInviteModalOpen(true)}
                  className="btn-primary"
                  disabled={isPreviewMode}
                >
                  {dict.common.invite.toUpperCase()}
                </Button>
                {currentUser?.id === projectOwnerId && (
                  <Button
                    onClick={() => setIsShareModalOpen(true)}
                    className="btn-secondary !px-3"
                    disabled={isPreviewMode}
                    title={dict.common.share || "Share"}
                  >
                    <Share2 size={16} />
                  </Button>
                )}
                <DecisionHistory
                  projectId={initialProjectId!}
                  onPreview={handlePreview}
                  onApply={handleApplyState}
                  onSave={handleSaveState}
                  onDelete={handleDeleteState}
                  onRename={handleRenameState}
                  isPreviewing={isPreviewMode}
                  selectedStateId={selectedStateId}
                  projectOwnerId={projectOwnerId}
                  currentUserId={currentUser?.id}
                />
              </div>
            </div>
          </Panel>

          <div className="zoom-indicator">
            <div className="flex items-center gap-2">
              <div
                className={`w-1.5 h-1.5 ${
                  isConnected ? "statusDotConnected" : "statusDotDisconnected"
                }`}
              />
              <span className="text-[10px] font-bold opacity-40 tabular-nums">
                {zoom}%
              </span>
            </div>
          </div>

          <Controls
            showInteractive={false}
            showZoom={false}
            showFitView={false}
            position="bottom-right"
          >
            <ControlButton
              onClick={undo}
              disabled={!canUndo || isPreviewMode}
              title={dict.common.undo || "Undo"}
            >
              <Undo2 />
            </ControlButton>
            <ControlButton
              onClick={redo}
              disabled={!canRedo || isPreviewMode}
              title={dict.common.redo || "Redo"}
            >
              <Redo2 />
            </ControlButton>
            <ControlButton onClick={handleZoomIn} title={dict.common.zoomIn}>
              <Plus />
            </ControlButton>
            <ControlButton onClick={handleZoomOut} title={dict.common.zoomOut}>
              <Minus />
            </ControlButton>
            <ControlButton onClick={handleFitView} title={dict.common.fitView}>
              <Maximize />
            </ControlButton>
            <DownloadButton />
          </Controls>

          {contextMenu && (
            <div
              ref={contextMenuRef}
              className="context-menu"
              style={
                {
                  "--menu-top": `${contextMenu.top}px`,
                  "--menu-left": `${contextMenu.left}px`,
                  opacity: 1,
                } as React.CSSProperties
              }
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {contextMenu.type === "pane" ? (
                <>
                  {!isPreviewMode && (
                    <>
                      <button
                        onClick={() =>
                          handleCreateBlock(undefined, undefined, "text")
                        }
                        className="context-menu-item"
                      >
                        {dict.common.newBlock || "New Note"}
                      </button>
                      <button
                        onClick={() =>
                          handleCreateBlock(undefined, undefined, "link")
                        }
                        className="context-menu-item"
                      >
                        {dict.common.newLink || "New Link"}
                      </button>
                      <button
                        onClick={() =>
                          handleCreateBlock(undefined, undefined, "file")
                        }
                        className="context-menu-item"
                      >
                        {dict.common.newFile || "New File"}
                      </button>
                      <button
                        onClick={() =>
                          handleCreateBlock(undefined, undefined, "github")
                        }
                        className="context-menu-item"
                      >
                        {dict.common.newGithub || "New GitHub"}
                      </button>
                      <button
                        onClick={() =>
                          handleCreateBlock(undefined, undefined, "palette")
                        }
                        className="context-menu-item"
                      >
                        {dict.common.newPalette || "New Palette"}
                      </button>
                      <button
                        onClick={() =>
                          handleCreateBlock(undefined, undefined, "contact")
                        }
                        className="context-menu-item"
                      >
                        {dict.common.newContact || "New Contact"}
                      </button>
                      <button
                        onClick={() =>
                          handleCreateBlock(undefined, undefined, "video")
                        }
                        className="context-menu-item"
                      >
                        {dict.common.newVideo || "New Video"}
                      </button>
                      <button
                        onClick={() =>
                          handleCreateBlock(undefined, undefined, "snippet")
                        }
                        className="context-menu-item"
                      >
                        {dict.common.newSnippet || "New Snippet"}
                      </button>
                      <button
                        onClick={() =>
                          handleCreateBlock(undefined, undefined, "checklist")
                        }
                        className="context-menu-item"
                      >
                        {dict.common.newChecklist || "New Checklist"}
                      </button>
                      <div className="context-menu-separator" />
                    </>
                  )}
                </>
              ) : (
                (() => {
                  const block = contextMenuBlock;
                  if (!block || !currentUser) return null;
                  const isOwner =
                    currentUser.id &&
                    (block.data as BlockData)?.ownerId === currentUser.id;
                  const isProjectOwner =
                    currentUser.id && projectOwnerId === currentUser.id;
                  const canManage = isOwner || isProjectOwner;
                  const isLocked = !!(block.data as BlockData).isLocked;

                  return (
                    <>
                      {canManage && (
                        <>
                          <button
                            onClick={() => handleToggleLock(block.id)}
                            className="context-menu-item"
                          >
                            {isLocked
                              ? dict.common.unlock || "Unlock"
                              : dict.common.lock || "Lock"}
                          </button>
                          <button
                            onClick={() => {
                              setTransferBlock(block);
                              setContextMenu(null);
                            }}
                            className="context-menu-item"
                          >
                            {dict.common.transferOwnership ||
                              "Transfer Ownership"}
                          </button>
                          <div className="context-menu-separator" />
                          <button
                            onClick={() => {
                              if (contextMenuBlock) {
                                const skipConfirm =
                                  typeof window !== "undefined" &&
                                  localStorage.getItem(
                                    "ideon_skip_delete_confirm",
                                  ) === "true";

                                if (skipConfirm) {
                                  _handleDeleteBlock(contextMenuBlock.id);
                                } else {
                                  setBlockToDelete(contextMenuBlock.id);
                                }
                                setContextMenu(null);
                              }
                            }}
                            className="context-menu-item text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            {dict.common.delete || "Delete"}
                          </button>
                        </>
                      )}
                      {!canManage && (
                        <div className="px-3 py-2 text-xs text-gray-500">
                          {dict.common.viewOnly || "View Only"}
                        </div>
                      )}
                    </>
                  );
                })()
              )}
            </div>
          )}
        </ReactFlow>

        <InviteUserModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          projectId={initialProjectId!}
        />

        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          projectId={initialProjectId!}
          isOwner={currentUser?.id === projectOwnerId}
        />

        {transferBlock && (
          <TransferBlockModal
            isOpen={!!transferBlock}
            onClose={() => setTransferBlock(null)}
            blockId={transferBlock.id}
            projectId={initialProjectId!}
            currentOwnerId={transferBlock.data.ownerId}
            onTransfer={async (blockId, newOwnerId) => {
              handleTransferBlock(blockId, {
                id: newOwnerId,
                username: "",
                displayName: "",
              });
              setTransferBlock(null);
            }}
          />
        )}

        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          commands={commands}
        />

        <Modal
          isOpen={!!blockToDelete || blocksToDelete.length > 0}
          onClose={() => {
            setBlockToDelete(null);
            setBlocksToDelete([]);
          }}
          title={dict.common.confirmDelete}
          className="max-w-md"
        >
          <p className="modal-description">
            {blocksToDelete.length > 0
              ? dict.common.deleteBlocksWarning.replace(
                  "{count}",
                  blocksToDelete.length.toString(),
                )
              : dict.common.deleteBlockWarning}
          </p>

          <div className="flex items-center gap-2 mt-4 mb-2">
            <input
              type="checkbox"
              id="dont-ask-again"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="dont-ask-again" className="text-sm opacity-80">
              {dict.common.dontAskAgain}
            </label>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              onClick={() => {
                setBlockToDelete(null);
                setBlocksToDelete([]);
              }}
              className="btn-ghost"
            >
              {dict.common.cancel}
            </Button>
            <Button
              onClick={() => {
                if (dontAskAgain) {
                  localStorage.setItem("ideon_skip_delete_confirm", "true");
                }
                confirmDelete();
              }}
              className="btn-danger"
            >
              {dict.common.delete}
            </Button>
          </div>
        </Modal>
      </div>
    </>
  );
}

export default function ProjectCanvas(props: ProjectCanvasProps) {
  return (
    <ProjectCanvasErrorBoundary>
      <ReactFlowProvider>
        <ProjectCanvasContent {...props} />
      </ReactFlowProvider>
    </ProjectCanvasErrorBoundary>
  );
}
