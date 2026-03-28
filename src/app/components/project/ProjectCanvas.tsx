"use client";

import {
  ReactFlow,
  Controls,
  ReactFlowProvider,
  ControlButton,
  Panel,
  ConnectionMode,
  useReactFlow as useReactFlowHook,
  Node,
  Edge,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";

import { getAvatarUrl } from "@lib/utils";
import CanvasBlock, { BlockData } from "./CanvasBlock";
import { YDocContext } from "./YDocContext";
import ProjectCoreBlock from "./ProjectCoreBlock";
import PaletteBlock from "./PaletteBlock";
import ContactBlock from "./ContactBlock";
import VideoBlock from "./VideoBlock";
import SnippetBlock from "./SnippetBlock";
import ChecklistBlock from "./ChecklistBlock";
import SketchBlock from "./SketchBlock";
import GitBlock from "./GitBlock";
import FileBlock from "./FileBlock";
import KanbanBlock from "./KanbanBlock";
import FolderBlock from "./FolderBlock";
import VercelBlock from "./VercelBlock";
import ShellBlock from "./ShellBlock";
import CanvasEdge from "./CanvasEdge";
import { ProjectAccessModal } from "./ProjectAccessModal";
import CommandPalette from "./CommandPalette";
import AddBlockModal from "./AddBlockModal";
import { TransferBlockModal } from "./TransferBlockModal";
import { ProjectCanvasErrorBoundary } from "./ProjectCanvasErrorBoundary";
import { useI18n } from "@providers/I18nProvider";
import { Button } from "@components/ui/Button";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
import { useUser } from "@providers/UserProvider";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clientLogger } from "../../../lib/clientLogger";
import { getMessage } from "../../../lib/getMessage";
import { classifyIndexedDbError } from "../../../lib/classifyIndexedDbError";
import {
  useState,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useCallback,
  memo,
} from "react";
import {
  Plus,
  Minus,
  Maximize,
  ArrowLeft,
  Check,
  RefreshCw,
  File as FileIcon,
  Undo2,
  Redo2,
  Share2,
  Loader2,
  Menu,
} from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { SiFigma } from "react-icons/si";
import { DecisionHistory } from "./DecisionHistory";
import { ShareModal } from "./ShareModal";
import { DownloadButton } from "./DownloadButton";
import { SyncIndicator } from "./SyncIndicator";
import { useAutoSnapshot, AutoSnapshotIntent } from "@/hooks/useAutoSnapshot";
import HelperLines from "./HelperLines";

import { Modal } from "@components/ui/Modal";
import {
  useProjectCanvasState,
  UserPresence,
} from "./hooks/useProjectCanvasState";
import { focusProjectCanvas } from "./utils/focusCanvas";
import { DEFAULT_VIEWPORT } from "./utils/constants";
import {
  getSelectedNoteBlockIdForShortcut,
  shouldIgnoreNodeContextMenuShortcut,
  type NoteModeShortcutHandler,
  type NoteModeShortcutKey,
} from "./utils/interaction";
import { useTouchGestures } from "./hooks/useTouchGestures";
import { useCanvasTouchViewport } from "./hooks/useCanvasTouchViewport";
const FIXED_EXTENT: [[number, number], [number, number]] = [
  [-5000, -4000],
  [8000, 5000],
];
import { ProjectCanvasProps } from "./utils/types";
import { UserMapProvider } from "./UserMapContext";
import type { CursorPosition } from "./hooks/useProjectCanvasRealtime";
import { DraftsProvider } from "./DraftsContext";

/**
 * Imperative remote cursors — bypasses React rendering entirely.
 * Reads cursor positions from a ref (updated by awareness) and viewport
 * from useReactFlow().getViewport() inside a rAF loop. Uses JS lerp
 * interpolation for smooth cursor movement (no CSS transitions).
 */
/** Ease-out cursor interpolation: fast catch-up, gentle braking */
const LERP_MIN = 0.12;
const LERP_MAX = 0.45;
const LERP_DIST_SCALE = 200;
const SNAP_THRESHOLD = 0.3;

const RemoteCursors = memo(function RemoteCursors({
  presenceUsers,
  currentUserId,
  remoteCursorsRef,
}: {
  presenceUsers: UserPresence[];
  currentUserId?: string;
  remoteCursorsRef: React.RefObject<Map<string, CursorPosition>>;
}) {
  const { getViewport } = useReactFlowHook();
  const cursorElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const displayedRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const rafRef = useRef<number | null>(null);

  const remoteUsers = useMemo(
    () => presenceUsers.filter((u) => u.id !== currentUserId),
    [presenceUsers, currentUserId],
  );

  const setCursorRef = useCallback(
    (userId: string, el: HTMLDivElement | null) => {
      if (el) cursorElsRef.current.set(userId, el);
      else {
        cursorElsRef.current.delete(userId);
        displayedRef.current.delete(userId);
      }
    },
    [],
  );

  useEffect(() => {
    if (remoteUsers.length === 0) {
      rafRef.current = null;
      return;
    }

    let running = true;

    const animate = () => {
      if (!running) return;
      const vp = getViewport();
      const cursors = remoteCursorsRef.current;

      cursorElsRef.current.forEach((el, userId) => {
        const pos = cursors?.get(userId);
        if (!pos) {
          el.style.display = "none";
          return;
        }

        const targetX = pos.x * vp.zoom + vp.x;
        const targetY = pos.y * vp.zoom + vp.y;
        if (isNaN(targetX) || isNaN(targetY)) {
          el.style.display = "none";
          return;
        }

        let displayed = displayedRef.current.get(userId);
        if (!displayed) {
          displayed = { x: targetX, y: targetY };
          displayedRef.current.set(userId, displayed);
        }

        const dx = targetX - displayed.x;
        const dy = targetY - displayed.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < SNAP_THRESHOLD) {
          displayed.x = targetX;
          displayed.y = targetY;
        } else {
          // Distance-based lerp: fast when far, slow braking when close
          const t =
            LERP_MIN +
            (LERP_MAX - LERP_MIN) * Math.min(1, dist / LERP_DIST_SCALE);
          displayed.x += dx * t;
          displayed.y += dy * t;
        }

        el.style.display = "";
        el.style.transform = `translate3d(${displayed.x}px, ${displayed.y}px, 0)`;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [remoteUsers, getViewport, remoteCursorsRef]);

  if (remoteUsers.length === 0) return null;

  return (
    <>
      {remoteUsers.map((user) => (
        <div
          key={user.id}
          ref={(el) => setCursorRef(user.id, el)}
          className="remote-cursor"
          style={
            {
              display: "none",
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
      ))}
    </>
  );
});

const blockTypes = {
  text: CanvasBlock,
  link: CanvasBlock,
  file: FileBlock,
  github: GitBlock,
  palette: PaletteBlock,
  contact: ContactBlock,
  video: VideoBlock,
  snippet: SnippetBlock,
  checklist: ChecklistBlock,
  kanban: KanbanBlock,
  sketch: SketchBlock,
  folder: FolderBlock,
  vercel: VercelBlock,
  shell: ShellBlock,
  core: ProjectCoreBlock,
};

const linkTypes = {
  connection: CanvasEdge,
};

function ProjectCanvasContent({ initialProjectId }: ProjectCanvasProps) {
  const { dict } = useI18n();
  const { user } = useUser();
  const { getViewport, setViewport, screenToFlowPosition } = useReactFlowHook();
  const router = useRouter();
  const flowContainerRef = useRef<HTMLDivElement>(null);
  const lastClickRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  const lastNodeClickRef = useRef<{ id: string; time: number } | null>(null);
  const [currentUser, setCurrentUser] = useState<UserPresence | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [isLocalSynced, setIsLocalSynced] = useState(false);
  const [isRemoteSynced, setIsRemoteSynced] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isAccessValidated, setIsAccessValidated] = useState(false);

  const routerRef = useRef(router);
  const dictRef = useRef(dict);
  // Track the last pointer type ("touch" | "pen" | "mouse") so we can
  // suppress the browser context menu for non-mouse input.
  const pointerTypeRef = useRef<string>("");

  useEffect(() => {
    dictRef.current = dict;
  }, [dict]);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    // Validate access on mount to prevent cached access
    const validateAccess = async () => {
      try {
        const res = await fetch(`/api/projects/${initialProjectId}`);
        if (!res.ok) {
          throw new Error("Access denied");
        }
        const data = await res.json();
        setCurrentUserRole(data.role);
        setIsAccessValidated(true);
      } catch {
        toast.error(dictRef.current.common.accessRevoked || "Access revoked");
        routerRef.current.push("/home");
      }
    };

    validateAccess();

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setIsAccessValidated(false);
        validateAccess();
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [initialProjectId]);

  useEffect(() => {
    if (user) {
      setCurrentUser({
        id: user.id,
        username: user.username || "Guest",
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        color: user.color || undefined,
        vimMode: user.vimMode || false,
      });
    }
  }, [user]);

  const [yjsData, setYjsData] = useState<{
    yDoc: Y.Doc;
    provider: WebsocketProvider;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !initialProjectId) return;

    let doc: Y.Doc | null = new Y.Doc();
    let wsProvider: WebsocketProvider | null = null;
    let indexeddbProvider: IndexeddbPersistence | null = null;

    try {
      clientLogger.debug("yjs:init:start");

      try {
        const update = Y.encodeStateAsUpdate(doc!);
        const docSizeBytes = (update && (update as Uint8Array).byteLength) || 0;
        clientLogger.debug("yjs:doc:estimated_size_bytes", { docSizeBytes });
      } catch (e) {
        clientLogger.debug("yjs:doc:size_estimate_failed", String(e));
      }

      wsProvider = new WebsocketProvider(
        `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
          window.location.host
        }/yjs`,
        `project-${initialProjectId}`,
        doc,
        { connect: true },
      );

      wsProvider.on("sync", (data: boolean) => {
        let size = 0;
        try {
          const u = Y.encodeStateAsUpdate(doc!);
          size = (u && (u as Uint8Array).byteLength) || 0;
        } catch {
          void 0;
        }
        clientLogger.debug("yjs:sync", {
          synced: Boolean(data),
          docSizeBytes: size,
        });
        setIsRemoteSynced(Boolean(data));
      });

      wsProvider.on("status", (event: { status: string }) => {
        clientLogger.info("yjs:status", { status: event.status });
        setIsSocketConnected(event.status === "connected");
      });

      wsProvider.on("connection-close", (event: { code?: number } | null) => {
        clientLogger.warn("yjs:connection-close", {
          code: event?.code ?? null,
        });
        if (event?.code === 4003) {
          wsProvider?.disconnect();
          toast.error(dictRef.current.common.accessRevoked || "Access revoked");
          routerRef.current.push("/home");
        }
      });

      try {
        indexeddbProvider = new IndexeddbPersistence(
          `project-${initialProjectId}`,
          doc!,
        );
        indexeddbProvider.on("synced", () => {
          setIsLocalSynced(true);
          clientLogger.debug("indexeddb:synced");
        });
      } catch (err) {
        const classified = classifyIndexedDbError(err);
        clientLogger.error("indexeddb:init:error", {
          reason: classified.reason,
          hint: classified.hint,
          message: getMessage(err),
        });

        try {
          if (navigator?.storage?.estimate) {
            navigator.storage
              .estimate()
              .then((estimate: { usage?: number; quota?: number }) => {
                clientLogger.debug("indexeddb:storage:estimate", {
                  usage: estimate?.usage ?? null,
                  quota: estimate?.quota ?? null,
                  usageRatio:
                    estimate?.usage && estimate?.quota
                      ? estimate.usage / estimate.quota
                      : null,
                });
              })
              .catch((e) =>
                clientLogger.debug(
                  "indexeddb:storage:estimate:error",
                  String(e),
                ),
              );
          }
        } catch (e) {
          clientLogger.debug("indexeddb:storage:estimate:error", String(e));
        }
      }

      setYjsData({ yDoc: doc!, provider: wsProvider });
      clientLogger.debug("yjs:init:complete");

      const checkInterval = setInterval(() => {
        try {
          setIsSocketConnected(Boolean(wsProvider?.wsconnected));
        } catch {
          void 0;
        }
      }, 3000);

      return () => {
        clearInterval(checkInterval);
        try {
          wsProvider?.on("sync", () => {});
          wsProvider?.on("status", () => {});
          wsProvider?.on("connection-close", () => {});
          wsProvider?.destroy?.();
        } catch {
          void 0;
        }
        try {
          indexeddbProvider?.destroy?.();
        } catch {
          void 0;
        }
        try {
          doc?.destroy?.();
        } catch {
          void 0;
        }
      };
    } catch (err) {
      clientLogger.error("yjs:init:failed", {
        message: getMessage(err),
      });
      try {
        doc?.destroy?.();
      } catch {
        void 0;
      }
    }
  }, [initialProjectId]);

  const { yDoc, provider } = yjsData || { yDoc: null, provider: null };

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

  const handleSaveStateRef = useRef<
    | ((
        intent?: string,
        overrideBlocks?: Node<BlockData>[],
        overrideLinks?: Edge[],
        options?: { isAuto?: boolean },
      ) => Promise<boolean | { success: boolean; unchanged?: boolean }>)
    | null
  >(null);

  const { triggerAutoSnapshot } = useAutoSnapshot({
    handleSaveStateRef,
    isPreviewMode: false,
    isReadOnly: currentUserRole === "viewer",
    isRemoteSynced,
  });

  const onGraphMutationCallback = useCallback(
    (intent: string) => {
      triggerAutoSnapshot(intent as AutoSnapshotIntent);
    },
    [triggerAutoSnapshot],
  );

  const {
    blocks,
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
    selectedStateId,
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
    deleteLinks: _deleteLinks,
    handleToggleLock,
    handleTransferBlock,
    confirmDelete,
    onKeyDown,
    onPointerMove,
    onPointerLeave,
    handlePreview,
    handleApplyState,
    onBlockContextMenu,
    onEdgeContextMenu,
    onPaneContextMenu,
    onPaneClick: originalOnPaneClick,
    onLinkClick,
    handleCreateBlock,
    handleDuplicateBlock,
    onExternalDragEnter,
    onExternalDragLeave,
    onExternalDragOver,
    handleExternalDrop,
    isExternalDropActive,
    dropImportProgress,
    remoteCursorsRef,
    presenceUsers,
    draftsByBlock,
    getDraftsForBlock,
    writeDraft,
    deleteDraft,
    shareCursor,
    setShareCursor,
    projectOwnerId,
    undo,
    redo,
    canUndo,
    canRedo,
    hasSeenOnboarding,
    helperLines,
  } = useProjectCanvasState(
    initialProjectId,
    currentUser,
    currentUserRole || undefined,
    yBlocks,
    yLinks,
    yContents,
    yDoc,
    provider?.awareness || null,
    isLocalSynced,
    isRemoteSynced,
    onGraphMutationCallback,
  );

  useEffect(() => {
    handleSaveStateRef.current = handleSaveState;
  }, [handleSaveState]);

  const isReadOnly = isPreviewMode || currentUserRole === "viewer";

  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isAddBlockOpen, setIsAddBlockOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMobileTopbar, setIsMobileTopbar] = useState(false);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [newBlockId, setNewBlockId] = useState<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<{
    sourceNodeId: string;
    handleId: string | null;
    position: { x: number; y: number };
  } | null>(null);
  const mobileActionsRef = useRef<HTMLDivElement>(null);
  const noteModeShortcutHandlersRef = useRef(
    new Map<string, NoteModeShortcutHandler>(),
  );

  const registerNoteModeShortcutHandler = useCallback(
    (blockId: string, handler: NoteModeShortcutHandler | null) => {
      if (handler) {
        noteModeShortcutHandlersRef.current.set(blockId, handler);
      } else {
        noteModeShortcutHandlersRef.current.delete(blockId);
      }
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 870px)");
    const update = () => setIsMobileTopbar(media.matches);

    update();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (!isMobileTopbar) {
      setIsMobileActionsOpen(false);
    }
  }, [isMobileTopbar]);

  useEffect(() => {
    if (!isMobileActionsOpen) return;

    const closeOnOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof globalThis.Node)) return;
      if (mobileActionsRef.current?.contains(target)) return;
      setIsMobileActionsOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileActionsOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutside, true);
    document.addEventListener("touchstart", closeOnOutside, true);
    window.addEventListener("keydown", closeOnEscape, true);

    return () => {
      document.removeEventListener("mousedown", closeOnOutside, true);
      document.removeEventListener("touchstart", closeOnOutside, true);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [isMobileActionsOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pendingConnection) {
        setPendingConnection(null);
        window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        const target = e.target as HTMLElement | null;
        const activeElement =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : target;
        const shortcutKey = e.key.toLowerCase();
        const isEditing =
          !!activeElement &&
          (["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName) ||
            activeElement.isContentEditable);

        if (!isEditing) {
          if (shortcutKey === "p" || shortcutKey === "e") {
            const noteBlockId = getSelectedNoteBlockIdForShortcut({
              blocks,
              activeElement,
            });
            const shortcutResult = noteBlockId
              ? noteModeShortcutHandlersRef.current.get(noteBlockId)?.(
                  shortcutKey as NoteModeShortcutKey,
                )
              : undefined;

            if (shortcutResult === "handled") {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }

          if (shortcutKey === "p") {
            e.preventDefault();
            e.stopPropagation();
            setIsPaletteOpen((v) => !v);
          } else if (shortcutKey === "a") {
            e.preventDefault();
            e.stopPropagation();
            setIsAddBlockOpen((v) => !v);
          } else if (shortcutKey === "h") {
            e.preventDefault();
            e.stopPropagation();
            setIsHistoryOpen((v) => !v);
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [blocks, pendingConnection]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  useEffect(() => {
    if (
      !currentUser ||
      !projectOwnerId ||
      currentUser.id !== projectOwnerId ||
      !initialProjectId
    )
      return;

    const fetchRequests = async () => {
      try {
        const res = await fetch(`/api/projects/${initialProjectId}/requests`);
        if (res.ok) {
          const requests = await res.json();
          // Filter for pending requests
          const pending = Array.isArray(requests)
            ? requests.filter((r: { status: string }) => r.status === "pending")
                .length
            : 0;
          setPendingRequestsCount(pending);
        }
      } catch (e) {
        clientLogger.error("Failed to fetch requests count", e);
      }
    };

    fetchRequests();
  }, [initialProjectId, currentUser, projectOwnerId]);

  // Listen for pending requests updates via WebSocket
  useEffect(() => {
    if (
      !yDoc ||
      !currentUser ||
      !projectOwnerId ||
      currentUser.id !== projectOwnerId
    )
      return;

    const metaMap = yDoc.getMap("meta");

    const handleMetaUpdate = () => {
      const count = metaMap.get("pendingRequestsCount");
      if (typeof count === "number") {
        setPendingRequestsCount(count);
      }
    };

    metaMap.observe(handleMetaUpdate);

    // Check if value already exists
    const currentCount = metaMap.get("pendingRequestsCount");
    if (typeof currentCount === "number") {
      setPendingRequestsCount(currentCount);
    }

    return () => {
      metaMap.unobserve(handleMetaUpdate);
    };
  }, [yDoc, currentUser, projectOwnerId]);

  const onConnectWithSnapshot = useCallback(
    (...args: Parameters<typeof onConnect>) => {
      onConnect(...args);
      triggerAutoSnapshot("Connection created");
    },
    [onConnect, triggerAutoSnapshot],
  );

  const onConnectStart = useCallback(
    (
      _: unknown,
      { nodeId, handleId }: { nodeId: string | null; handleId: string | null },
    ) => {
      if (!nodeId) return;
      setPendingConnection({
        sourceNodeId: nodeId,
        handleId,
        position: { x: 0, y: 0 },
      });
    },
    [],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!pendingConnection) return;

      const target = event.target as HTMLElement;
      const isPane =
        target.classList.contains("react-flow__pane") ||
        target.closest(".react-flow__pane");
      const isNode = !!target.closest(".react-flow__node");
      const isEdge = !!target.closest(".react-flow__edge");

      if (isPane && !isNode && !isEdge) {
        let clientX = 0;
        let clientY = 0;

        if ("clientX" in event) {
          clientX = event.clientX;
          clientY = event.clientY;
        } else {
          const touch = event.touches?.[0] || event.changedTouches?.[0];
          if (touch) {
            clientX = touch.clientX;
            clientY = touch.clientY;
          }
        }

        const flowPos = screenToFlowPosition({ x: clientX, y: clientY });

        setPendingConnection((prev) =>
          prev ? { ...prev, position: flowPos } : null,
        );
        setIsAddBlockOpen(true);
      } else {
        setPendingConnection(null);
      }
    },
    [pendingConnection, screenToFlowPosition],
  );

  const onLongPress = useCallback(
    (
      e: React.PointerEvent | PointerEvent | React.TouchEvent | TouchEvent,
      x: number,
      y: number,
    ) => {
      if (isReadOnly) return;

      // Clear any existing selection to prevent text selection on long press
      if (window.getSelection) {
        window.getSelection()?.removeAllRanges();
      }

      const target = e.target as HTMLElement;
      const nodeElement = target.closest(".react-flow__node");
      const edgeElement = target.closest(".react-flow__edge");

      if (nodeElement) {
        const nodeId = nodeElement.getAttribute("data-id");
        if (nodeId) {
          const node = (blocks as Node<BlockData>[]).find(
            (n) => n.id === nodeId,
          );
          if (node) {
            onBlockContextMenu(
              {
                preventDefault: () => {},
                clientX: x,
                clientY: y,
              } as unknown as React.MouseEvent,
              node,
            );
          }
        }
      } else if (edgeElement) {
        // Do nothing for edges on long press, they use double tap
        return;
      } else {
        return;
      }
    },
    [isReadOnly, blocks, onBlockContextMenu, onPaneContextMenu],
  );

  const handlePaneClick = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      // button 2 is right click
      if ("button" in event && event.button === 2) return;

      originalOnPaneClick();

      const now = Date.now();
      const clientX =
        "clientX" in event
          ? event.clientX
          : (event as React.TouchEvent).touches?.[0]?.clientX;
      const clientY =
        "clientY" in event
          ? event.clientY
          : (event as React.TouchEvent).touches?.[0]?.clientY;

      if (lastClickRef.current) {
        const timeDiff = now - lastClickRef.current.time;
        const dist = Math.sqrt(
          Math.pow(clientX - lastClickRef.current.x, 2) +
            Math.pow(clientY - lastClickRef.current.y, 2),
        );

        if (timeDiff < 400 && dist < 20) {
          onPaneContextMenu(event as React.MouseEvent);
          lastClickRef.current = null;
          return;
        }
      }
      lastClickRef.current = { time: now, x: clientX, y: clientY };
    },
    [onPaneContextMenu, originalOnPaneClick],
  );

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Clear context menu as per original onBlockClick
      originalOnPaneClick();

      if (shouldIgnoreNodeContextMenuShortcut(event.target)) {
        lastNodeClickRef.current = null;
        return;
      }

      const now = Date.now();
      if (lastNodeClickRef.current && lastNodeClickRef.current.id === node.id) {
        const diff = now - lastNodeClickRef.current.time;
        if (diff < 400) {
          onBlockContextMenu(event, node as Node<BlockData>);
          lastNodeClickRef.current = null;
          return;
        }
      }
      lastNodeClickRef.current = { id: node.id, time: now };
    },
    [onBlockContextMenu, originalOnPaneClick],
  );

  const touchHandlers = useTouchGestures({
    onLongPress,
    onDoubleTap: (e, x, y) => {
      if (isReadOnly) return;

      // Using elementFromPoint for more reliable hit testing for edges/pane
      const elementAtPoint = document.elementFromPoint(x, y);
      const target = (elementAtPoint || e.target) as HTMLElement;

      const edgeElement = target.closest(".react-flow__edge");

      if (edgeElement) {
        const edgeId = edgeElement.getAttribute("data-id");
        if (edgeId) {
          const edge = (links as Edge[]).find((l) => l.id === edgeId);
          if (edge) {
            onEdgeContextMenu(
              {
                preventDefault: () => {},
                clientX: x,
                clientY: y,
              } as unknown as React.MouseEvent,
              edge,
            );
            return;
          }
        }
      }

      onPaneContextMenu({
        preventDefault: () => {},
        clientX: x,
        clientY: y,
      } as unknown as React.MouseEvent);
    },
    allowLongPress: false,
  });

  const canvasTouchViewportHandlers = useCanvasTouchViewport({
    disabled: isReadOnly,
    minZoom: 0.1,
    maxZoom: 4,
    getViewport,
    setViewport,
    onPaneDoubleTap: (x, y) => {
      onPaneContextMenu({
        preventDefault: () => {},
        clientX: x,
        clientY: y,
      } as unknown as React.MouseEvent);
    },
  });

  useEffect(() => {
    const container = flowContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();

        const { x, y, zoom } = getViewport();
        const delta = -e.deltaY;
        const sensitivity = 0.01; // Boosted
        const factor = Math.pow(2, delta * sensitivity);
        const nextZoom = Math.min(Math.max(zoom * factor, 0.1), 4);

        if (nextZoom === zoom) return;

        const rect = container.getBoundingClientRect();
        const centerX = e.clientX - rect.left;
        const centerY = e.clientY - rect.top;

        const flowX = (centerX - x) / zoom;
        const flowY = (centerY - y) / zoom;

        const nextX = centerX - flowX * nextZoom;
        const nextY = centerY - flowY * nextZoom;

        setViewport({ x: nextX, y: nextY, zoom: nextZoom }, { duration: 0 });
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [getViewport, setViewport]);

  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const handleEdgeLabelSubmit = useCallback(
    (edgeId: string, label: string) => {
      _setLinks((eds) =>
        eds.map((edge) => {
          if (edge.id === edgeId) {
            return {
              ...edge,
              data: { ...edge.data, label, isEditing: false },
            };
          }
          return edge;
        }),
      );
    },
    [_setLinks],
  );

  const handleEdgeLabelCancel = useCallback(
    (edgeId: string) => {
      _setLinks((eds) =>
        eds.map((edge) => {
          if (edge.id === edgeId) {
            return {
              ...edge,
              data: { ...edge.data, isEditing: false },
            };
          }
          return edge;
        }),
      );
    },
    [_setLinks],
  );

  const onLinkDoubleClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (isReadOnly) return;
      _setLinks((eds) =>
        eds.map((e) => {
          if (e.id === edge.id) {
            return {
              ...e,
              data: {
                ...e.data,
                isEditing: true,
                onLabelSubmit: handleEdgeLabelSubmit,
                onLabelCancel: handleEdgeLabelCancel,
              },
            };
          }
          return e;
        }),
      );
    },
    [isReadOnly, _setLinks, handleEdgeLabelSubmit, handleEdgeLabelCancel],
  );

  const isValidConnection = useCallback(
    (connection: { source: string; target: string }) => {
      if (connection.source === connection.target) {
        return false;
      }

      const sourceBlock = blocks.find(
        (block) => block.id === connection.source,
      );
      const targetBlock = blocks.find(
        (block) => block.id === connection.target,
      );

      if (sourceBlock?.type === "folder" && targetBlock?.type === "core") {
        return false;
      }

      return true;
    },
    [blocks],
  );

  const isTyping = useMemo(() => {
    if (!currentUser) return false;
    return presenceUsers.some((u) => u.id === currentUser.id && u.isTyping);
  }, [presenceUsers, currentUser]);

  const contextMenuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (contextMenu && contextMenuRef.current) {
      const menu = contextMenuRef.current;
      const parent = menu.parentElement;
      if (!parent) return;

      const rect = menu.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 10;

      let adjustedTop = contextMenu.top;
      let adjustedLeft = contextMenu.left;

      // Vertical repositioning
      if (adjustedTop + rect.height > viewportHeight - margin) {
        adjustedTop = adjustedTop - rect.height;
      }

      // Horizontal repositioning
      if (adjustedLeft + rect.width > viewportWidth - margin) {
        adjustedLeft = adjustedLeft - rect.width;
      }

      // Final clamping to viewport bounds
      adjustedTop = Math.max(
        margin,
        Math.min(adjustedTop, viewportHeight - rect.height - margin),
      );
      adjustedLeft = Math.max(
        margin,
        Math.min(adjustedLeft, viewportWidth - rect.width - margin),
      );

      // Pass 1: Set position relative to parent
      const finalTop = adjustedTop - parentRect.top;
      const finalLeft = adjustedLeft - parentRect.left;

      menu.style.setProperty("--menu-top", `${finalTop}px`);
      menu.style.setProperty("--menu-left", `${finalLeft}px`);
      menu.style.opacity = "1";

      // Pass 2: Detect and fix layout shift (closed-loop correction)
      const actualRect = menu.getBoundingClientRect();
      const errorX = actualRect.left - adjustedLeft;
      const errorY = actualRect.top - adjustedTop;

      if (Math.abs(errorX) > 1 || Math.abs(errorY) > 1) {
        menu.style.setProperty("--menu-top", `${finalTop - errorY}px`);
        menu.style.setProperty("--menu-left", `${finalLeft - errorX}px`);
      }
    }
  }, [contextMenu]);

  const contextMenuBlock = useMemo(() => {
    if (!contextMenu?.id) return null;
    return blocks.find((n: Node<BlockData>) => n.id === contextMenu.id);
  }, [contextMenu?.id, blocks]);

  const isCoreOnly = useMemo(() => {
    return blocks.length === 1 && blocks[0].type === "core";
  }, [blocks]);

  // --- Hide children of collapsed folders ---
  const getVisibleBlockIds = (
    allBlocks: Node<BlockData>[],
    allLinks: Edge[],
  ) => {
    // Build parent->children map
    const childrenMap = new Map<string, string[]>();
    allLinks.forEach((edge) => {
      if (edge.type === "connection" && edge.source && edge.target) {
        if (!childrenMap.has(edge.source)) childrenMap.set(edge.source, []);
        childrenMap.get(edge.source)!.push(edge.target);
      }
    });

    // Find all collapsed folders
    const collapsedFolders = new Set<string>();
    allBlocks.forEach((block) => {
      if (block.type === "folder") {
        let meta: Record<string, unknown> = {};
        const metadata = block.data?.metadata;
        try {
          if (typeof metadata === "string") {
            meta = JSON.parse(metadata);
          } else if (metadata) {
            meta = metadata;
          }
        } catch {
          // ignore invalid json
        }
        if (meta && (meta as { isCollapsed?: boolean }).isCollapsed)
          collapsedFolders.add(block.id);
      }
    });

    // Recursively collect all descendants of a folder
    const collectDescendants = (id: string, acc: Set<string>) => {
      const children = childrenMap.get(id);
      if (!children) return;
      for (const childId of children) {
        acc.add(childId);
        collectDescendants(childId, acc);
      }
    };

    // Exclude all descendants of collapsed folders
    const hidden = new Set<string>();
    for (const folderId of collapsedFolders) {
      collectDescendants(folderId, hidden);
    }

    // Visible blocks are those not in hidden
    return new Set(allBlocks.map((b) => b.id).filter((id) => !hidden.has(id)));
  };

  const visibleBlockIds = useMemo(
    () => getVisibleBlockIds(blocks, links),
    [blocks, links],
  );

  const blocksWithPreview = useMemo(() => {
    return blocks
      .filter((block) => !block.hidden && visibleBlockIds.has(block.id))
      .map((block) => ({
        ...block,
        className:
          block.id === newBlockId
            ? "block-just-created"
            : block.className || "",
        data: {
          ...block.data,
          isPreviewMode,
          currentUser: currentUser || undefined,
          registerNoteModeShortcutHandler,
          userRole: currentUserRole || undefined,
        },
      }));
  }, [
    blocks,
    isPreviewMode,
    currentUser,
    currentUserRole,
    newBlockId,
    registerNoteModeShortcutHandler,
    visibleBlockIds,
  ]);

  // Focus newly created / duplicated block.
  useEffect(() => {
    if (!newBlockId) return;
    const id = newBlockId;

    const timer = setTimeout(() => {
      try {
        // Ensure the node is present in the DOM, then place keyboard focus
        // back on the canvas container so the block is selected.
        const blockEl = document.querySelector(
          `[data-id="${id}"]`,
        ) as HTMLElement | null;
        if (blockEl) {
          try {
            blockEl.scrollIntoView({ block: "center", inline: "center" });
          } catch {
            // ignore
          }
        }

        focusProjectCanvas();
      } catch {
        // ignore
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [newBlockId, blocks]);

  if (!isAccessValidated) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <YDocContext.Provider value={yDoc}>
      <>
        <svg className="absolute w-0 h-0 pointer-events-none">
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
          } ${isExternalDropActive ? "drop-active" : ""}`}
          onKeyDown={onKeyDown}
          onDragEnter={onExternalDragEnter}
          onDragLeave={onExternalDragLeave}
          onDragOver={onExternalDragOver}
          onDrop={handleExternalDrop}
          tabIndex={0}
          ref={flowContainerRef}
          onPointerDownCapture={(e) => {
            pointerTypeRef.current = e.pointerType;
            canvasTouchViewportHandlers.onPointerDownCapture(e);
          }}
          onPointerMoveCapture={
            canvasTouchViewportHandlers.onPointerMoveCapture
          }
          onPointerUpCapture={canvasTouchViewportHandlers.onPointerUpCapture}
          onPointerCancelCapture={
            canvasTouchViewportHandlers.onPointerCancelCapture
          }
          {...touchHandlers}
        >
          {isLoading && (
            <div className="loading-overlay">
              <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {isExternalDropActive && !dropImportProgress.isImporting && (
            <div className="drop-import-hover-overlay">
              <div className="drop-import-hover-card">
                <FileIcon className="drop-import-hover-icon" />
                <div className="drop-import-hover-text">
                  <p>{dict.canvas.dropHoverTitle}</p>
                  <p>{dict.canvas.dropHoverDescription}</p>
                </div>
              </div>
            </div>
          )}

          {dropImportProgress.isImporting && (
            <div className="drop-import-progress-overlay">
              <div className="drop-import-progress-card">
                <Loader2 className="drop-import-progress-spinner" />
                <div className="drop-import-progress-text">
                  <p>{dict.canvas.dropImportLoadingTitle}</p>
                  <p>
                    {dropImportProgress.total > 0
                      ? (
                          dict.canvas.dropImportLoadingProgress ||
                          "{processed}/{total} files processed"
                        )
                          .replace(
                            "{processed}",
                            String(dropImportProgress.processed),
                          )
                          .replace("{total}", String(dropImportProgress.total))
                      : dict.canvas.dropImportLoadingScanning ||
                        "Preparing import..."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <UserMapProvider activeUsers={presenceUsers}>
            <DraftsProvider
              value={{
                draftsByBlock,
                getDraftsForBlock,
                writeDraft,
                deleteDraft,
              }}
            >
              <ReactFlow
                nodes={blocksWithPreview}
                edges={links.filter(
                  (edge) =>
                    !blocks.find((b) => b.id === edge.source && b.hidden) &&
                    !blocks.find((b) => b.id === edge.target && b.hidden) &&
                    visibleBlockIds.has(edge.source) &&
                    visibleBlockIds.has(edge.target),
                )}
                onNodesChange={isPreviewMode ? undefined : onBlocksChange}
                onEdgesChange={isPreviewMode ? undefined : onLinksChange}
                onNodeDragStart={isPreviewMode ? undefined : onBlockDragStart}
                onNodeDrag={isPreviewMode ? undefined : onBlockDrag}
                onNodeDragStop={isPreviewMode ? undefined : onBlockDragStop}
                onConnect={isPreviewMode ? undefined : onConnectWithSnapshot}
                onConnectStart={isPreviewMode ? undefined : onConnectStart}
                onConnectEnd={isPreviewMode ? undefined : onConnectEnd}
                isValidConnection={isValidConnection}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
                onPaneContextMenu={(e) => {
                  if (
                    pointerTypeRef.current === "touch" ||
                    pointerTypeRef.current === "pen"
                  ) {
                    e.preventDefault();
                    return;
                  }
                  onPaneContextMenu(e);
                }}
                onNodeContextMenu={onBlockContextMenu}
                onEdgeContextMenu={onEdgeContextMenu}
                onPaneClick={handlePaneClick}
                onNodeClick={handleNodeClick}
                onEdgeClick={onLinkClick}
                onEdgeDoubleClick={onLinkDoubleClick}
                onMove={onMove}
                onViewportChange={onViewportChange}
                zoomOnPinch={true}
                zoomOnDoubleClick={false}
                nodeTypes={blockTypes}
                edgeTypes={linkTypes}
                defaultViewport={DEFAULT_VIEWPORT}
                connectionMode={ConnectionMode.Loose}
                connectionRadius={30}
                translateExtent={FIXED_EXTENT}
                minZoom={0.1}
                maxZoom={4}
                deleteKeyCode={null}
                disableKeyboardA11y
                selectionOnDrag={!isReadOnly}
                selectionKeyCode={null}
                nodesDraggable={!isReadOnly}
                nodesConnectable={!isReadOnly}
                elementsSelectable={true}
                edgesReconnectable={!isReadOnly}
                panOnScroll
                panOnDrag={true}
                multiSelectionKeyCode="Control"
                fitView
                onlyRenderVisibleElements={true}
                className={`project-canvas ${isReadOnly ? "read-only" : ""}`}
                proOptions={{ hideAttribution: true }}
              >
                <div
                  className={`canvas-cursor-overlay ${
                    isTyping ? "hide-native-cursor" : ""
                  }`}
                />
                <Panel
                  position="top-left"
                  className="pointer-events-none m-0!"
                  style={{ width: "100%", height: "100%", zIndex: 1500 }}
                >
                  <RemoteCursors
                    presenceUsers={presenceUsers}
                    currentUserId={currentUser?.id}
                    remoteCursorsRef={remoteCursorsRef}
                  />
                </Panel>
                {!isReadOnly && (
                  <Panel
                    position="top-left"
                    className="pointer-events-none m-0!"
                    style={{ width: "100%", height: "100%", zIndex: 999 }}
                  >
                    <HelperLines helperLines={helperLines} />
                  </Panel>
                )}
                {/* Background disabled to prevent global rasterization blur */}

                {!hasSeenOnboarding && isCoreOnly && !isPreviewMode && (
                  <Panel
                    position="bottom-center"
                    className="onboarding-panel"
                    role="status"
                    aria-label="Magic Paste Onboarding Hint"
                  >
                    <div className="onboarding-content">
                      <div className="onboarding-icons">
                        <FaGithub size={20} />
                        <div className="separator" />
                        <SiFigma size={20} />
                        <div className="separator" />
                        <FileIcon size={20} />
                      </div>
                      <div className="onboarding-text">
                        <h3>Magic Paste</h3>
                        <p>{dict.project.onboardingHint}</p>
                      </div>
                    </div>
                  </Panel>
                )}
                <Panel
                  position="top-left"
                  className="m-6! ml-12! mt-3!"
                  style={{ zIndex: 2000 }}
                >
                  {!isPreviewMode && !isMobileTopbar && (
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-sm font-bold opacity-40 select-none">
                        {dict.project.shareCursor}
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
                      <button
                        className="command-palette-hint"
                        onClick={() => setIsAddBlockOpen(true)}
                      >
                        <kbd>Ctrl + A</kbd>
                        <span>{dict.canvas.addBlock}</span>
                      </button>
                      <button
                        className="command-palette-hint"
                        onClick={() => setIsPaletteOpen(true)}
                      >
                        <kbd>Ctrl + P</kbd>
                        <span>{dict.canvas.commandPalette}</span>
                      </button>
                    </div>
                  )}
                </Panel>

                <Panel
                  position="top-right"
                  className={`flex items-center gap-2 m-6! mt-3! ${
                    isMobileTopbar ? "project-topbar-panel-mobile" : ""
                  }`}
                  style={{ zIndex: 2000 }}
                >
                  {isPreviewMode && (
                    <div className="preview-mode-banner">
                      <span className="preview-mode-text">
                        {dict.canvas.previewMode}
                      </span>
                      <div className="preview-mode-actions">
                        <button
                          onClick={() => handlePreview(null)}
                          className="preview-action-btn preview-return-btn"
                          title={dict.canvas.returnToPresent}
                        >
                          <ArrowLeft size={14} />
                          <span className="preview-btn-text">
                            {dict.canvas.return}
                          </span>
                        </button>
                        {currentUser?.id === projectOwnerId && (
                          <button
                            onClick={() =>
                              selectedStateId &&
                              handleApplyState(selectedStateId)
                            }
                            className="preview-action-btn preview-apply-btn"
                            title={dict.canvas.apply}
                            disabled={!selectedStateId}
                          >
                            <Check size={14} />
                            <span className="preview-btn-text">
                              {dict.canvas.apply}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="project-topbar-row">
                    {!isPreviewMode && (
                      <div className="project-presence-strip">
                        <SyncIndicator
                          isSocketConnected={isSocketConnected}
                          isRemoteSynced={isRemoteSynced}
                        />
                        <div className="project-presence-avatars">
                          {presenceUsers.map((u) => (
                            <div
                              key={u.id}
                              className="user-presence-item relative shrink-0"
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
                      </div>
                    )}

                    {isMobileTopbar ? (
                      <div
                        className="project-mobile-actions"
                        ref={mobileActionsRef}
                      >
                        <button
                          className={`project-mobile-actions-trigger ${
                            isMobileActionsOpen ? "active" : ""
                          }`}
                          onClick={() =>
                            setIsMobileActionsOpen((open) => !open)
                          }
                          title={dict.project.mobileActions}
                          aria-label={dict.project.mobileActions}
                        >
                          <Menu size={18} />
                        </button>

                        {isMobileActionsOpen && (
                          <div className="project-mobile-actions-menu">
                            {!isPreviewMode && (
                              <label className="project-mobile-actions-item project-mobile-actions-switch">
                                <span>{dict.project.shareCursor}</span>
                                <input
                                  type="checkbox"
                                  className="theme-checkbox"
                                  checked={shareCursor}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    setShareCursor(e.target.checked);
                                  }}
                                />
                              </label>
                            )}

                            {!isPreviewMode && (
                              <button
                                className="project-mobile-actions-item"
                                onClick={() => {
                                  setIsAddBlockOpen(true);
                                  setIsMobileActionsOpen(false);
                                }}
                              >
                                {dict.canvas.addBlock}
                              </button>
                            )}

                            {!isPreviewMode && (
                              <button
                                className="project-mobile-actions-item"
                                onClick={() => {
                                  setIsPaletteOpen(true);
                                  setIsMobileActionsOpen(false);
                                }}
                              >
                                {dict.canvas.commandPalette}
                              </button>
                            )}

                            {currentUserRole !== "viewer" && (
                              <button
                                className="project-mobile-actions-item relative"
                                onClick={() => {
                                  setIsInviteModalOpen(true);
                                  setIsMobileActionsOpen(false);
                                }}
                                disabled={isPreviewMode}
                              >
                                <span>{dict.project.access || "Access"}</span>
                                {pendingRequestsCount > 0 && (
                                  <span className="absolute -top-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-white dark:border-black shadow-sm pointer-events-none">
                                    {pendingRequestsCount}
                                  </span>
                                )}
                              </button>
                            )}

                            {currentUser?.id === projectOwnerId && (
                              <button
                                className="project-mobile-actions-item"
                                onClick={() => {
                                  setIsShareModalOpen(true);
                                  setIsMobileActionsOpen(false);
                                }}
                                disabled={isPreviewMode}
                              >
                                {dict.project.share || "Share"}
                              </button>
                            )}

                            {!isPreviewMode && (
                              <button
                                className="project-mobile-actions-item"
                                onClick={() => {
                                  setIsHistoryOpen(true);
                                  setIsMobileActionsOpen(false);
                                }}
                              >
                                {dict.canvas.temporalHistory || "History"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {currentUserRole !== "viewer" && (
                          <div className="relative">
                            <Button
                              onClick={() => setIsInviteModalOpen(true)}
                              className="btn-primary"
                              disabled={isPreviewMode}
                            >
                              {(dict.project.access || "Access").toUpperCase()}
                            </Button>
                            {pendingRequestsCount > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-white dark:border-black shadow-sm pointer-events-none">
                                {pendingRequestsCount}
                              </span>
                            )}
                          </div>
                        )}
                        {currentUser?.id === projectOwnerId && (
                          <Button
                            onClick={() => setIsShareModalOpen(true)}
                            className="btn-secondary px-3!"
                            disabled={isPreviewMode}
                            title={dict.project.share || "Share"}
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
                          isHistoryOpen={isHistoryOpen}
                          onHistoryOpenChange={setIsHistoryOpen}
                        />
                      </div>
                    )}
                  </div>
                </Panel>

                {isMobileTopbar && (
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
                    isHistoryOpen={isHistoryOpen}
                    onHistoryOpenChange={setIsHistoryOpen}
                  />
                )}

                <div className="zoom-indicator">
                  <div className="flex items-center gap-2">
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
                    title={dict.canvas.undo || "Undo"}
                  >
                    <Undo2 />
                  </ControlButton>
                  <ControlButton
                    onClick={redo}
                    disabled={!canRedo || isPreviewMode}
                    title={dict.canvas.redo || "Redo"}
                  >
                    <Redo2 />
                  </ControlButton>
                  <ControlButton
                    onClick={handleZoomIn}
                    title={dict.canvas.zoomIn}
                  >
                    <Plus />
                  </ControlButton>
                  <ControlButton
                    onClick={handleZoomOut}
                    title={dict.canvas.zoomOut}
                  >
                    <Minus />
                  </ControlButton>
                  <ControlButton
                    onClick={handleFitView}
                    title={dict.canvas.fitView}
                  >
                    <Maximize />
                  </ControlButton>
                  <DownloadButton />
                </Controls>
              </ReactFlow>

              {contextMenu && (
                <div
                  ref={contextMenuRef}
                  className="context-menu"
                  style={
                    {
                      opacity: 0,
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
                            onClick={() => {
                              setIsAddBlockOpen(true);
                              setContextMenu(null);
                            }}
                            className="context-menu-item"
                          >
                            {dict.canvas.addBlock || "Add Block"}
                          </button>
                          <button
                            onClick={() => {
                              const id = handleCreateBlock(
                                undefined,
                                undefined,
                                "folder",
                              );

                              if (id) {
                                setNewBlockId(id);
                                setTimeout(() => setNewBlockId(null), 800);
                                triggerAutoSnapshot("Block created");
                              }

                              setContextMenu(null);
                            }}
                            className="context-menu-item"
                          >
                            {dict.canvas.addFolder || "Add Folder"}
                          </button>
                          <div className="context-menu-separator" />
                        </>
                      )}
                    </>
                  ) : contextMenu.type === "block" ? (
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
                                  ? dict.blocks.unlock || "Unlock"
                                  : dict.blocks.lock || "Lock"}
                              </button>
                              <button
                                onClick={() => {
                                  setTransferBlock(block);
                                  setContextMenu(null);
                                }}
                                className="context-menu-item"
                              >
                                {dict.project.transferOwnership ||
                                  "Transfer Ownership"}
                              </button>
                              <button
                                onClick={() => {
                                  if (contextMenuBlock) {
                                    const id = handleDuplicateBlock(
                                      contextMenuBlock.id,
                                    );
                                    if (id) {
                                      setNewBlockId(id);
                                      setTimeout(
                                        () => setNewBlockId(null),
                                        800,
                                      );
                                      triggerAutoSnapshot("Block created");
                                    }
                                  }
                                  setContextMenu(null);
                                }}
                                className="context-menu-item"
                              >
                                {(
                                  dict.blocks as unknown as Record<
                                    string,
                                    string
                                  >
                                ).duplicate ||
                                  (
                                    dict.common as unknown as Record<
                                      string,
                                      string
                                    >
                                  ).duplicate ||
                                  "Duplicate"}
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
                              {dict.blocks.viewOnly || "View Only"}
                            </div>
                          )}
                        </>
                      );
                    })()
                  ) : contextMenu.type === "edge" ? (
                    (() => {
                      const edgeId = contextMenu.id;
                      if (!edgeId) return null;

                      return (
                        <button
                          onClick={() => {
                            _deleteLinks([edgeId]);
                            setContextMenu(null);
                            triggerAutoSnapshot("Connection deleted");
                          }}
                          className="context-menu-item text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          {dict.common.delete || "Delete"}
                        </button>
                      );
                    })()
                  ) : null}
                </div>
              )}
            </DraftsProvider>
          </UserMapProvider>

          <ProjectAccessModal
            isOpen={isInviteModalOpen}
            onClose={() => setIsInviteModalOpen(false)}
            projectId={initialProjectId!}
            isOwner={
              currentUserRole === "owner" || currentUserRole === "creator"
            }
            currentUserRole={currentUserRole}
          />

          <ShareModal
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            projectId={initialProjectId!}
            isOwner={currentUser?.id === projectOwnerId}
            onRegenerate={async (updateContent) => {
              if (updateContent) {
                await handleSaveState("Share link regeneration");
              }
            }}
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
                triggerAutoSnapshot("Block transferred");
              }}
            />
          )}

          <Modal
            isOpen={!!blockToDelete || blocksToDelete.length > 0}
            onClose={() => {
              setBlockToDelete(null);
              setBlocksToDelete([]);
            }}
            title={dict.modals.confirmDelete}
            className="max-w-md"
          >
            <p className="modal-description">
              {blocksToDelete.length > 0
                ? dict.modals.deleteBlocksWarning.replace(
                    "{count}",
                    blocksToDelete.length.toString(),
                  )
                : dict.modals.deleteBlockWarning}
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
                {dict.modals.dontAskAgain}
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
                  triggerAutoSnapshot("Block deleted");
                }}
                className="btn-danger"
              >
                {dict.common.delete}
              </Button>
            </div>
          </Modal>

          <CommandPalette
            isOpen={isPaletteOpen}
            onClose={() => setIsPaletteOpen(false)}
          />

          <AddBlockModal
            isOpen={isAddBlockOpen}
            onClose={() => {
              setIsAddBlockOpen(false);
              setPendingConnection(null);
            }}
            onAddBlock={(blockType) => {
              const id = handleCreateBlock(
                pendingConnection?.position || undefined,
                pendingConnection?.sourceNodeId || undefined,
                blockType as
                  | "text"
                  | "link"
                  | "file"
                  | "github"
                  | "palette"
                  | "contact"
                  | "video"
                  | "snippet"
                  | "checklist"
                  | "kanban"
                  | "sketch"
                  | "shell"
                  | "folder",
              );
              if (id) {
                setNewBlockId(id);
                setTimeout(() => setNewBlockId(null), 800);
                triggerAutoSnapshot("Block created");
              }
              setIsAddBlockOpen(false);
              setPendingConnection(null);
            }}
          />
        </div>
      </>
    </YDocContext.Provider>
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
