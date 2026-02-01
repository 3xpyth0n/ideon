import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { Node, Edge, useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import { useI18n } from "@providers/I18nProvider";
import { uniqueById } from "@lib/utils";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { useProjectCanvasGraph } from "./useProjectCanvasGraph";
import { useProjectCanvasRealtime } from "./useProjectCanvasRealtime";
import { useProjectData } from "./useProjectData";
import { BlockData } from "../CanvasBlock";
import { CORE_BLOCK_X, CORE_BLOCK_Y } from "../utils/constants";
import { generateStateHash } from "../utils/hash";

const cleanBlockDataForSync = (
  data: Partial<BlockData>,
): Partial<BlockData> => {
  const {
    content: _content,
    yText: _yText,
    typingUsers: _typingUsers,
    movingUserColor: _movingUserColor,
    onContentChange: _onContentChange,
    onFocus: _onFocus,
    onBlur: _onBlur,
    onCaretMove: _onCaretMove,
    onResize: _onResize,
    onResizeEnd: _onResizeEnd,
    ...rest
  } = data;
  return rest;
};

export interface UserPresence {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl: string | null;
  color?: string;
  cursor?: { x: number; y: number; index?: number };
  isTyping?: boolean;
  typingBlockId?: string | null;
  draggingBlockId?: string | null;
  caretPosition?: number | null;
}

export const useProjectCanvasState = (
  initialProjectId: string | undefined,
  currentUser: UserPresence | null,
  yBlocks: Y.Map<Node<BlockData>> | null,
  yLinks: Y.Map<Edge> | null,
  yContents: Y.Map<Y.Text> | null,
  awareness: Awareness | null,
  isLocalSynced: boolean = false,
) => {
  const { dict } = useI18n();
  const { fitView, getZoom, zoomTo, setViewport, screenToFlowPosition } =
    useReactFlow();

  const [blocks, setBlocksState] = useState<Node<BlockData>[]>([]);
  const [links, setLinksState] = useState<Edge[]>([]);
  const [projectOwnerId, setProjectOwnerId] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewModeState] = useState(false);
  const isPreviewModeRef = useRef(false);

  const setIsPreviewMode = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setIsPreviewModeState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        isPreviewModeRef.current = next;
        return next;
      });
    },
    [],
  );

  const isInitialized = useRef(false);
  const lastProjectId = useRef<string | null>(null);
  const lastSnapshotHash = useRef<string | null>(null);

  useEffect(() => {
    if (!yBlocks || !yLinks || !yContents || isPreviewMode) return;

    const updateBlocksFromYjs = (
      event: Y.YMapEvent<Node<BlockData>>,
      transaction: Y.Transaction,
    ) => {
      if (transaction.local) return;

      const changes: Array<{
        key: string;
        action: "add" | "update" | "delete";
      }> = [];
      event.keysChanged.forEach((key) => {
        const change = event.changes.keys.get(key);
        if (change) {
          changes.push({ key, action: change.action });
        }
      });

      setBlocksState((prev) => {
        const next = [...prev];
        let hasChanges = false;

        changes.forEach(({ key, action }) => {
          const index = next.findIndex((n) => n.id === key);

          if (action === "add" || action === "update") {
            const rn = yBlocks.get(key);
            if (rn) {
              const yText = yContents.get(key);
              const syncedBlock = {
                ...rn,
                draggable: rn.type !== "core",
                deletable: rn.type !== "core",
                position:
                  rn.type === "core"
                    ? { x: CORE_BLOCK_X, y: CORE_BLOCK_Y }
                    : rn.position,
                data: {
                  ...rn.data,
                  yText,
                  content: yText ? yText.toString() : rn.data?.content || "",
                },
              };

              if (index >= 0) {
                next[index] = {
                  ...syncedBlock,
                  selected: next[index].selected,
                };
              } else {
                next.push({
                  ...syncedBlock,
                  selected: false,
                } as Node<BlockData>);
              }
              hasChanges = true;
            }
          } else if (action === "delete" && index >= 0) {
            next.splice(index, 1);
            hasChanges = true;
          }
        });

        return hasChanges ? next : prev;
      });
      isInitialized.current = true;
    };

    const updateLinksFromYjs = (
      event: Y.YMapEvent<Edge>,
      transaction: Y.Transaction,
    ) => {
      if (transaction.local) return;

      const changes: Array<{
        key: string;
        action: "add" | "update" | "delete";
      }> = [];
      event.keysChanged.forEach((key) => {
        const change = event.changes.keys.get(key);
        if (change) {
          changes.push({ key, action: change.action });
        }
      });

      setLinksState((prev) => {
        const next = [...prev];
        let hasChanges = false;

        changes.forEach(({ key, action }) => {
          const index = next.findIndex((l) => l.id === key);

          if (action === "add" || action === "update") {
            const rl = yLinks.get(key);
            if (rl) {
              if (index >= 0) {
                next[index] = { ...rl, selected: next[index].selected };
              } else {
                next.push({ ...rl, selected: false } as Edge);
              }
              hasChanges = true;
            }
          } else if (action === "delete" && index >= 0) {
            next.splice(index, 1);
            hasChanges = true;
          }
        });

        return hasChanges ? next : prev;
      });
    };

    const updateContentsFromYjs = (
      event: Y.YMapEvent<Y.Text>,
      transaction: Y.Transaction,
    ) => {
      if (transaction.local) return;

      const keys = Array.from(event.keysChanged);

      setBlocksState((prev) => {
        const next = [...prev];
        let hasChanges = false;

        keys.forEach((key) => {
          const index = next.findIndex((n) => n.id === key);
          if (index >= 0) {
            const yText = yContents.get(key);
            if (
              yText &&
              (next[index].data.yText !== yText ||
                next[index].data.content !== yText.toString())
            ) {
              next[index] = {
                ...next[index],
                data: {
                  ...next[index].data,
                  yText,
                  content: yText ? yText.toString() : next[index].data.content,
                },
              };
              hasChanges = true;
            }
          }
        });

        return hasChanges ? next : prev;
      });
    };

    yBlocks.observe(updateBlocksFromYjs);
    yLinks.observe(updateLinksFromYjs);
    yContents.observe(updateContentsFromYjs);

    // Initial sync
    const initialBlocks = Array.from(yBlocks.values());
    const initialLinks = Array.from(yLinks.values());

    setBlocksState(
      initialBlocks.map((rn) => {
        const yText = yContents.get(rn.id);
        return {
          ...rn,
          selected: false,
          draggable: rn.type !== "core",
          deletable: rn.type !== "core",
          position:
            rn.type === "core"
              ? { x: CORE_BLOCK_X, y: CORE_BLOCK_Y }
              : rn.position,
          data: {
            ...rn.data,
            yText,
            content: yText ? yText.toString() : rn.data?.content || "",
          },
        } as Node<BlockData>;
      }),
    );

    setLinksState(initialLinks.map((rl) => ({ ...rl, selected: false })));

    if (initialBlocks.length > 0 || initialLinks.length > 0) {
      isInitialized.current = true;

      // Auto-center on core block if it exists
      const coreBlock = initialBlocks.find((n) => n.type === "core");
      if (coreBlock) {
        setTimeout(() => {
          // With core block centered at (0,0), viewport x/y must be half of screen width/height to center it
          setViewport(
            {
              x: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
              y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
              zoom: 1,
            },
            { duration: 800 },
          );
        }, 100);
      } else {
        fitView({
          duration: 800,
          padding: 0.2,
        });
      }
    }

    return () => {
      yBlocks.unobserve(updateBlocksFromYjs);
      yLinks.unobserve(updateLinksFromYjs);
      yContents.unobserve(updateContentsFromYjs);
    };
  }, [yBlocks, yLinks, yContents, isPreviewMode]);

  const setBlocks = useCallback(
    (
      update:
        | Node<BlockData>[]
        | ((nds: Node<BlockData>[]) => Node<BlockData>[]),
    ) => {
      if (!yBlocks || !yContents) return;

      setBlocksState((prev) => {
        const nextBlocks = (
          typeof update === "function" ? update(prev) : update
        ).map((n) =>
          n.type === "core"
            ? { ...n, position: { x: CORE_BLOCK_X, y: CORE_BLOCK_Y } }
            : n,
        );

        if (!isPreviewModeRef.current) {
          yBlocks.doc?.transact(() => {
            nextBlocks.forEach((block) => {
              const { selected, ...blockToSync } = block;

              if (!yContents.has(block.id)) {
                const yText = new Y.Text();
                const initialContent = (block.data?.content as string) || "";
                if (initialContent) {
                  yText.insert(0, initialContent);
                }
                yContents.set(block.id, yText);
              }

              const blockData = cleanBlockDataForSync(
                (blockToSync.data as Partial<BlockData>) || {},
              );

              const cleanBlockToSync = {
                ...blockToSync,
                data: blockData,
              };

              const existing = yBlocks.get(block.id);
              const hasChanged =
                !existing ||
                existing.position.x !== cleanBlockToSync.position.x ||
                existing.position.y !== cleanBlockToSync.position.y ||
                existing.width !== cleanBlockToSync.width ||
                existing.height !== cleanBlockToSync.height ||
                JSON.stringify(existing.data) !==
                  JSON.stringify(cleanBlockToSync.data);

              if (hasChanged) {
                yBlocks.set(block.id, cleanBlockToSync as Node<BlockData>);
              }
            });
          });
        }

        return nextBlocks;
      });
    },
    [yBlocks, yContents],
  );

  const deleteBlocks = useCallback(
    (ids: string[]) => {
      if (!yBlocks || !yContents) return;

      yBlocks.doc?.transact(() => {
        ids.forEach((id) => {
          yBlocks.delete(id);
          yContents.delete(id);
        });
      });

      setBlocksState((prev) => prev.filter((n) => !ids.includes(n.id)));
    },
    [yBlocks, yContents],
  );

  const setLinks = useCallback(
    (update: Edge[] | ((lks: Edge[]) => Edge[])) => {
      if (!yLinks) return;

      setLinksState((prev) => {
        const nextLinks = typeof update === "function" ? update(prev) : update;

        if (!isPreviewModeRef.current) {
          yLinks.doc?.transact(() => {
            nextLinks.forEach((link) => {
              const { selected, ...linkToSync } = link;

              const existing = yLinks.get(link.id);
              const hasChanged =
                !existing ||
                JSON.stringify(existing) !== JSON.stringify(linkToSync);

              if (hasChanged) {
                yLinks.set(link.id, linkToSync as Edge);
              }
            });
          });
        }

        return nextLinks;
      });
    },
    [yLinks],
  );

  const deleteLinks = useCallback(
    (ids: string[]) => {
      if (!yLinks) return;

      yLinks.doc?.transact(() => {
        ids.forEach((id) => {
          yLinks.delete(id);
        });
      });

      setLinksState((prev) => prev.filter((l) => !ids.includes(l.id)));
    },
    [yLinks],
  );

  const replaceGraph = useCallback(
    (newBlocks: Node<BlockData>[], newLinks: Edge[]) => {
      if (!yBlocks || !yLinks || !yContents) return;

      yBlocks.doc?.transact(() => {
        // 1. Delete everything in Yjs
        Array.from(yBlocks.keys()).forEach((id) => yBlocks.delete(id));
        Array.from(yLinks.keys()).forEach((id) => yLinks.delete(id));
        Array.from(yContents.keys()).forEach((id) => yContents.delete(id));

        // 2. Set new blocks and links in local state first to avoid flickering
        const sanitizedBlocks = newBlocks.map((n) =>
          n.type === "core"
            ? { ...n, position: { x: CORE_BLOCK_X, y: CORE_BLOCK_Y } }
            : n,
        );
        setBlocksState(sanitizedBlocks);
        setLinksState(newLinks);

        // 3. Add new blocks to Yjs (setBlocks will be called by effects, but we can do it here for atomicity)
        sanitizedBlocks.forEach((block) => {
          const { selected, ...blockToSync } = block;

          const yText = new Y.Text();
          const initialContent = (block.data?.content as string) || "";
          if (initialContent) {
            yText.insert(0, initialContent);
          }
          yContents.set(block.id, yText);

          const blockData = cleanBlockDataForSync(
            (blockToSync.data as Partial<BlockData>) || {},
          );

          const cleanBlockToSync = { ...blockToSync, data: blockData };
          yBlocks.set(block.id, cleanBlockToSync as Node<BlockData>);
        });

        newLinks.forEach((link) => {
          const { selected, ...linkToSync } = link;
          yLinks.set(link.id, linkToSync as Edge);
        });
      });
    },
    [yBlocks, yLinks, yContents],
  );

  const [isLoading, setIsLoading] = useState(false);
  const [blockToDelete, setBlockToDelete] = useState<string | null>(null);
  const [blocksToDelete, setBlocksToDelete] = useState<string[]>([]);
  const [zoom, setZoom] = useState(100);
  const [contextMenu, setContextMenu] = useState<{
    id?: string;
    type: "block" | "pane";
    top: number;
    left: number;
  } | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [transferBlock, setTransferBlock] = useState<Node<BlockData> | null>(
    null,
  );
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [shareCursor, setShareCursorState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("ideonShareCursor");
    return saved === null ? true : saved === "true";
  });

  const setShareCursor = useCallback((val: boolean) => {
    setShareCursorState(val);
    localStorage.setItem("ideonShareCursor", String(val));
  }, []);

  const handleExitPreview = useCallback(() => {
    setIsPreviewMode(false);

    if (yBlocks && yLinks && yContents) {
      const initialBlocks = Array.from(yBlocks.values());
      const initialLinks = Array.from(yLinks.values());

      setBlocksState(
        initialBlocks.map((rn) => {
          const yText = yContents.get(rn.id);
          return {
            ...rn,
            selected: false,
            draggable: rn.type !== "core",
            deletable: rn.type !== "core",
            position:
              rn.type === "core"
                ? { x: CORE_BLOCK_X, y: CORE_BLOCK_Y }
                : rn.position,
            data: {
              ...rn.data,
              yText,
              content: yText ? yText.toString() : rn.data?.content || "",
            },
          } as Node<BlockData>;
        }),
      );

      setLinksState(initialLinks.map((rl) => ({ ...rl, selected: false })));
    }
  }, [yBlocks, yLinks, yContents]);

  const handleSaveState = useCallback(
    async (
      intent?: string,
      overrideBlocks?: Node<BlockData>[],
      overrideLinks?: Edge[],
    ): Promise<boolean> => {
      if (!initialProjectId) return false;
      try {
        const blocksToSave = (overrideBlocks || blocks).map((n) => ({
          ...n,
          data: {
            ...n.data,
            content: n.data.yText ? n.data.yText.toString() : n.data.content,
          },
        }));

        const currentHash = await generateStateHash(
          blocksToSave,
          overrideLinks || links,
        );

        if (lastSnapshotHash.current === currentHash) {
          toast.info(dict.common.noChanges || "No changes to save");
          return false;
        }

        const res = await fetch(`/api/projects/${initialProjectId}/temporal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            blocks: blocksToSave,
            links: overrideLinks || links,
            intent,
          }),
        });

        if (!res.ok) {
          if (res.status === 403) {
            toast.error(dict.common.unauthorized || "Unauthorized action");
          } else {
            toast.error(dict.common.saveError || "Failed to save changes");
          }
          return false;
        }

        lastSnapshotHash.current = currentHash;
        return true;
      } catch (_error) {
        toast.error(dict.common.saveError || "Failed to save changes");
        return false;
      }
    },
    [initialProjectId, blocks, links],
  );

  const handleDeleteState = useCallback(
    async (stateId: string) => {
      if (!initialProjectId) return;
      try {
        const res = await fetch(`/api/projects/${initialProjectId}/temporal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delete",
            stateId,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          toast.error(
            err.message ||
              dict.common.deleteError ||
              "Failed to delete snapshot",
          );
          return;
        }

        toast.success(
          dict.common.snapshotDeleted || "Snapshot deleted successfully",
        );
      } catch (_error) {
        toast.error(dict.common.deleteError || "Failed to delete snapshot");
      }
    },
    [initialProjectId, dict.common],
  );

  const handleRenameState = useCallback(
    async (stateId: string, newIntent: string) => {
      if (!initialProjectId || !newIntent.trim()) return;
      try {
        const response = await fetch(
          `/api/projects/${initialProjectId}/temporal`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update",
              stateId,
              intent: newIntent.trim(),
            }),
          },
        );

        if (!response.ok) {
          const err = await response.json();
          throw new Error(
            err.message || dict.common.error || "Failed to rename",
          );
        }
      } catch {
        toast.error(dict.common.error || "Failed to rename snapshot");
      }
    },
    [initialProjectId, dict.common],
  );

  const rt = useProjectCanvasRealtime(
    awareness,
    currentUser,
    isPreviewMode,
    shareCursor,
  );

  const mousePosRef = useRef({ x: 0, y: 0 });

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
      rt.onPointerMove(e);
    },
    [rt],
  );

  const graph = useProjectCanvasGraph({
    currentUser,
    blocks,
    links,
    setBlocks,
    setLinks,
    deleteBlocks,
    deleteLinks,
    updateMyPresence: rt.updateMyPresence,
    setContextMenu,
    contextMenu,
  });

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // 1. Guard: Check if focused element is an input or textarea
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          (activeElement as HTMLElement).isContentEditable)
      ) {
        return;
      }

      // 2. Get cursor position for new block
      const pos = screenToFlowPosition({
        x: mousePosRef.current.x,
        y: mousePosRef.current.y,
      });

      // 3. Check for Files (Images)
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        const file = e.clipboardData.files[0];
        if (!initialProjectId) return;

        // Create block immediately with "uploading" state
        const tempUrl = URL.createObjectURL(file);
        const initialMetadata = {
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
          status: "uploading",
          tempUrl: tempUrl,
        };

        const blockId = graph.handleCreateBlock(
          pos,
          undefined,
          "file",
          file.name,
          initialMetadata,
        );

        if (!blockId) return;

        // Upload in background
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
              // status: 'uploading' removed implies success
            };

            // Update block with real data
            setBlocks((blocks) =>
              blocks.map((b) =>
                b.id === blockId
                  ? {
                      ...b,
                      data: {
                        ...b.data,
                        metadata: JSON.stringify(newMetadata),
                        content: fileData.name,
                      },
                    }
                  : b,
              ),
            );
          } else {
            toast.error(dict.common.uploadError || "Upload failed");
            // Remove block or show error state? For now, leave as is but maybe user can delete
          }
        } catch (error) {
          console.error("Paste upload error:", error);
          toast.error(dict.common.uploadError || "Upload failed");
        }
        return;
      }

      // 4. Check for Text content
      const text = e.clipboardData?.getData("text");
      if (!text) return;

      e.preventDefault();

      // Git Provider Detection
      const gitRegex = /^https?:\/\/(github\.com|gitlab\.com)\/[\w-]+\/[\w.-]+/;
      if (gitRegex.test(text)) {
        graph.handleCreateBlock(pos, undefined, "github", text);
        return;
      }

      // Generic URL Detection (Figma, etc.)
      const urlRegex = /^https?:\/\//;
      if (urlRegex.test(text)) {
        graph.handleCreateBlock(pos, undefined, "link", text);
        return;
      }

      // Fallback: Text Block
      graph.handleCreateBlock(pos, undefined, "text", text);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [graph, initialProjectId, dict, setBlocks, screenToFlowPosition]);

  const io = useProjectData({
    initialProjectId,
    blocks,
    links,
    setBlocks,
    setLinks,
    replaceGraph,
    setIsPreviewMode,
    setSelectedStateId,
    setIsLoading,
    isInitialized,
    isPreviewMode,
    setProjectOwnerId,
    handleExitPreview,
  });

  const blocksWithPresence = useMemo(() => {
    const processedBlocks = blocks.map((block) => {
      const typingUsers = rt.activeUsers.filter(
        (u) =>
          u.isTyping &&
          u.typingBlockId === block.id &&
          u.id !== currentUser?.id,
      );
      const movingUser = rt.activeUsers.find(
        (u) => u.draggingBlockId === block.id && u.id !== currentUser?.id,
      );
      const isLocked = !!block.data?.isLocked;
      const isOwner = currentUser?.id && block.data?.ownerId === currentUser.id;
      const isProjectOwner =
        currentUser?.id && projectOwnerId === currentUser.id;
      const canManage = isOwner || isProjectOwner;
      const yText = yContents?.get(block.id);

      return {
        ...block,
        draggable: isPreviewMode ? false : isLocked ? !!isOwner : true,
        selectable: !isPreviewMode,
        deletable: isPreviewMode ? false : !!canManage,
        data: {
          ...block.data,
          isPreviewMode,
          yText,
          typingUsers: isPreviewMode ? [] : typingUsers,
          movingUserColor: movingUser?.color,
          projectOwnerId,
          initialProjectId,
          currentUser: currentUser
            ? { id: currentUser.id, username: currentUser.username }
            : undefined,
          onContentChange: isPreviewMode ? undefined : graph.onContentChange,
          onFocus: isPreviewMode ? undefined : rt.onFocus,
          onBlur: isPreviewMode ? undefined : rt.onBlur,
          onCaretMove: isPreviewMode ? undefined : rt.onCaretMove,
          onResize: isPreviewMode ? undefined : graph.onResizeCallback,
          onResizeEnd: isPreviewMode ? undefined : graph.onResizeEndCallback,
        },
      };
    });

    return uniqueById(processedBlocks);
  }, [
    blocks,
    rt,
    currentUser,
    isPreviewMode,
    graph,
    yContents,
    projectOwnerId,
  ]);

  const uniqueLinks = useMemo(() => {
    return uniqueById(links).filter(
      (e: Edge) => e && e.id && e.source && e.target,
    );
  }, [links]);

  useEffect(() => {
    if (
      initialProjectId &&
      lastProjectId.current !== initialProjectId &&
      yBlocks &&
      yContents &&
      isLocalSynced
    ) {
      // If we already have blocks in Yjs (e.g. from IndexedDB or WebSocket),
      // we assume this is the latest draft and do NOT overwrite it with the snapshot.
      if (yBlocks.size > 0) {
        isInitialized.current = true;
        lastProjectId.current = initialProjectId;
        io.fetchProjectMetadata();
        return;
      }

      isInitialized.current = false;
      lastProjectId.current = initialProjectId;
      io.fetchGraph();
    }
  }, [
    initialProjectId,
    io.fetchGraph,
    io.fetchProjectMetadata,
    yBlocks,
    yContents,
    isLocalSynced,
  ]);

  const handleFitView = useCallback(() => {
    const selectedBlocks = blocks.filter((n) => n.selected);
    if (selectedBlocks.length > 0)
      fitView({
        nodes: selectedBlocks,
        duration: 800,
        maxZoom: 2,
        padding: 0.35,
      });
    else if (blocks.length === 0)
      setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 800 });
    else
      fitView({
        duration: 800,
        maxZoom: 1,
        padding: 0.3,
      });
  }, [blocks, fitView, setViewport]);

  const handleZoomIn = useCallback(
    () =>
      zoomTo((Math.floor(getZoom() * 10 + 0.01) + 1) / 10, { duration: 200 }),
    [getZoom, zoomTo],
  );
  const handleZoomOut = useCallback(
    () =>
      zoomTo((Math.ceil(getZoom() * 10 - 0.01) - 1) / 10, { duration: 200 }),
    [getZoom, zoomTo],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditing =
        ["INPUT", "TEXTAREA"].includes(target.tagName) ||
        target.isContentEditable;

      if ((e.key === "Delete" || e.key === "Backspace") && !isEditing) {
        const selectedBlocks = blocks.filter((n) => n.selected);
        const selectedLinks = links.filter((l) => l.selected);

        if (selectedBlocks.length > 0) {
          const cannotDelete = selectedBlocks.some((n) => {
            const isOwner =
              currentUser?.id && n.data?.ownerId === currentUser.id;
            const isProjectOwner =
              currentUser?.id && projectOwnerId === currentUser.id;
            return !isOwner && !isProjectOwner;
          });

          if (cannotDelete) {
            toast.error(dict.common.cannotDeleteBlock);
            return;
          }
          setBlocksToDelete(selectedBlocks.map((n) => n.id));
        } else if (selectedLinks.length > 0) {
          graph.onLinksChange(
            selectedLinks.map((l) => ({ id: l.id, type: "remove" })),
          );
        }
      }
    },
    [blocks, links, currentUser, dict.common, graph, projectOwnerId],
  );

  const confirmDelete = useCallback(() => {
    const ids = blockToDelete ? [blockToDelete] : blocksToDelete;
    if (ids.length === 0) return;
    graph.handleDeleteBlock(ids);
    setBlockToDelete(null);
    setBlocksToDelete([]);
  }, [blockToDelete, blocksToDelete, graph]);

  return {
    blocks: blocksWithPresence,
    setBlocks,
    onBlocksChange: graph.onBlocksChange,
    links: uniqueLinks,
    setLinks,
    onLinksChange: graph.onLinksChange,
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
    isImportModalOpen,
    setIsImportModalOpen,
    isPreviewMode,
    setIsPreviewMode,
    selectedStateId,
    setSelectedStateId,
    isInitialized,
    handleFitView,
    handleZoomIn,
    handleZoomOut,
    onViewportChange: (v: { x: number; y: number; zoom: number }) =>
      setZoom(Math.round(v.zoom * 100)),
    onMove: () => setZoom(Math.round(getZoom() * 100)),
    fetchGraph: io.fetchGraph,
    handleSaveState,
    handleDeleteState,
    handleRenameState,
    onBlockDragStart: graph.onBlockDragStart,
    onBlockDrag: graph.onBlockDrag,
    onBlockDragStop: graph.onBlockDragStop,
    onConnect: graph.onConnect,
    handleDeleteBlock: graph.handleDeleteBlock,
    handleToggleLock: (blockId: string) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block || !currentUser) return;
      const isLocked = !!block.data?.isLocked;
      graph.handleToggleLock(blockId, !isLocked);
    },
    handleTransferBlock: (
      id: string,
      target: {
        id: string;
        username: string | null;
        displayName: string | null;
        color?: string;
      },
    ) => {
      graph.handleTransferBlock(id, target);
      toast.success(dict.common.blockTransferred);
    },
    confirmDelete,
    onKeyDown,
    onPointerMove,
    onPointerLeave: rt.onPointerLeave,
    handleImport: io.handleImport,
    handlePreview: io.handlePreview,
    handleApplyState: async (stateId: string) => {
      if (!initialProjectId) return;

      // If in preview mode, we can check for duplicates
      if (isPreviewMode && yBlocks && yLinks && yContents) {
        // 1. Get Present State from Yjs
        const presentBlocks = Array.from(yBlocks.values()).map((b) => {
          const yText = yContents.get(b.id);
          return {
            ...b,
            data: {
              ...b.data,
              content: yText ? yText.toString() : b.data.content || "",
            },
          } as Node<BlockData>;
        });
        const presentLinks = Array.from(yLinks.values());

        // 2. Get Snapshot State (currently in 'blocks' and 'links' because isPreviewMode=true)
        const snapshotBlocks = blocks;
        const snapshotLinks = links;

        const presentHash = await generateStateHash(
          presentBlocks,
          presentLinks,
        );
        const snapshotHash = await generateStateHash(
          snapshotBlocks,
          snapshotLinks,
        );

        if (presentHash === snapshotHash) {
          toast.info(
            dict.common.stateAlreadyApplied ||
              "This state is already applied to the present",
          );
          return;
        }
      }

      // Proceed
      await io.handleApplyState(stateId);
    },
    onBlockContextMenu: graph.onBlockContextMenu,
    onPaneContextMenu: graph.onPaneContextMenu,
    onPaneClick: () => setContextMenu(null),
    onBlockClick: () => setContextMenu(null),
    onLinkClick: () => setContextMenu(null),
    handleCreateBlock: graph.handleCreateBlock,
    activeUsers: rt.activeUsers,
    shareCursor,
    setShareCursor,
    projectOwnerId,
  };
};
