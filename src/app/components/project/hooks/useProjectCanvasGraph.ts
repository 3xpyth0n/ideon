import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Node,
  Edge,
  useReactFlow,
  NodeChange,
  EdgeChange,
  Connection,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react";
import {
  computeLongestSideViewport,
  getNodesBoundsWithFallback,
  getReactFlowViewportSize,
} from "@components/project/utils/fitViewport";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { UserPresence } from "./useProjectCanvasState";
import { BlockData } from "@components/project/CanvasBlock";
import { useI18n } from "@providers/I18nProvider";
import {
  DEFAULT_BLOCK_WIDTH,
  DEFAULT_BLOCK_HEIGHT,
  DEFAULT_KANBAN_BLOCK_WIDTH,
  DEFAULT_KANBAN_BLOCK_HEIGHT,
  CORE_BLOCK_X,
  CORE_BLOCK_Y,
  CORE_BLOCK_WIDTH,
  CORE_BLOCK_HEIGHT,
} from "@components/project/utils/constants";
import { getAdjustedPosition } from "@components/project/utils/collision";
import {
  calculateHelperLines,
  HelperLine,
} from "@components/project/utils/alignment";
import * as Y from "yjs";
import { parseFolderMetadata } from "@lib/metadata-parsers";
import { safeReadYText } from "@lib/projectContentSafety";
import { validateFolderLinkRules } from "@lib/folder-link-rules";
import {
  computeHiddenNodeIds,
  getDescendantIds,
} from "@components/project/utils/visibility";
import {
  isBlockContentLocked,
  isBlockPositionLocked,
} from "@components/project/utils/locks";

const FIT_DURATION = 800;
const FIT_PADDING = 0.12;
const FIT_MIN_ZOOM = 0.1;
const FIT_MAX_ZOOM_SELECTED = 2;
const FIT_MAX_ZOOM_ALL = 1;
const SNAP_THRESHOLD_PX = 8;

interface UseProjectCanvasGraphProps {
  currentUser: UserPresence | null;
  blocks: Node<BlockData>[];
  links: Edge[];
  setBlocks: (
    blocks:
      | Node<BlockData>[]
      | ((blocks: Node<BlockData>[]) => Node<BlockData>[]),
    options?: { recordInUndo?: boolean },
  ) => void;
  setLinks: (
    links: Edge[] | ((lks: Edge[]) => Edge[]),
    options?: { recordInUndo?: boolean },
  ) => void;
  deleteBlocks: (ids: string[]) => void;
  deleteLinks: (ids: string[]) => void;
  updateMyPresence: (presence: Partial<UserPresence>) => void;
  setContextMenu: (
    val: {
      id?: string;
      type: "block" | "pane" | "edge";
      top: number;
      left: number;
    } | null,
  ) => void;
  contextMenu: {
    id?: string;
    type: "block" | "pane" | "edge";
    top: number;
    left: number;
  } | null;
  isReadOnly?: boolean;
  markUndoBoundary: () => void;
}

export const useProjectCanvasGraph = ({
  currentUser,
  blocks,
  links,
  setBlocks,
  setLinks,
  deleteBlocks,
  deleteLinks,
  updateMyPresence,
  setContextMenu,
  contextMenu,
  isReadOnly = false,
  markUndoBoundary,
}: UseProjectCanvasGraphProps) => {
  const { dict } = useI18n();
  const { screenToFlowPosition, fitView, setViewport } = useReactFlow();
  const [helperLines, setHelperLines] = useState<HelperLine[]>([]);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const lastDragPositionRef = useRef<{
    blockId: string;
    position: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift" && !isShiftPressed) {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isShiftPressed]);

  const applyLongestSideFit = useCallback(
    (targetBlocks: Node<BlockData>[], maxZoom: number) => {
      const bounds = getNodesBoundsWithFallback(targetBlocks as Node[]);
      const viewportSize = getReactFlowViewportSize();

      if (!bounds || !viewportSize) {
        fitView({
          nodes: targetBlocks,
          duration: FIT_DURATION,
          maxZoom,
          padding: FIT_PADDING,
        });
        return;
      }

      const nextViewport = computeLongestSideViewport(bounds, viewportSize, {
        padding: FIT_PADDING,
        minZoom: FIT_MIN_ZOOM,
        maxZoom,
      });

      setViewport(nextViewport, { duration: FIT_DURATION });
    },
    [fitView, setViewport],
  );

  const handleFitView = useCallback(() => {
    const selectedBlocks = blocks.filter((b) => b.selected);
    if (selectedBlocks.length > 0)
      applyLongestSideFit(selectedBlocks, FIT_MAX_ZOOM_SELECTED);
    else if (blocks.length === 0)
      setViewport({ x: 0, y: 0, zoom: 1 }, { duration: FIT_DURATION });
    else applyLongestSideFit(blocks, FIT_MAX_ZOOM_ALL);
  }, [blocks, setViewport, applyLongestSideFit]);

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, edge: Edge) => {
      event.preventDefault();
      if (isReadOnly) return;

      // Select the edge when right-clicked/double-tapped
      setLinks((prevLinks) => {
        const isAlreadySelected = prevLinks.find((l) => l.id === edge.id)
          ?.selected;
        if (isAlreadySelected) return prevLinks;

        return prevLinks.map((l) => ({
          ...l,
          selected: l.id === edge.id,
        }));
      });

      setContextMenu({
        id: edge.id,
        type: "edge",
        top: (event as React.MouseEvent).clientY,
        left: (event as React.MouseEvent).clientX,
      });
    },
    [setContextMenu, setLinks, isReadOnly],
  );

  const applyWithUndoBoundary = useCallback(
    (operation: () => void) => {
      markUndoBoundary();
      operation();
      markUndoBoundary();
    },
    [markUndoBoundary],
  );

  const applyMutation = useCallback(
    ({
      blocksUpdate,
      linksUpdate,
    }: {
      intent: string;
      blocksUpdate?: (blocks: Node<BlockData>[]) => Node<BlockData>[];
      linksUpdate?: (lks: Edge[]) => Edge[];
    }) => {
      if (!blocksUpdate && !linksUpdate) {
        return;
      }

      applyWithUndoBoundary(() => {
        if (blocksUpdate) {
          setBlocks(blocksUpdate, { recordInUndo: true });
        }
        if (linksUpdate) {
          setLinks(linksUpdate, { recordInUndo: true });
        }
      });
    },
    [applyWithUndoBoundary, setBlocks, setLinks],
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        !(event.target as HTMLElement).closest(".context-menu") &&
        contextMenu
      )
        setContextMenu(null);
    };
    if (contextMenu)
      document.addEventListener("mousedown", handleClickOutside, true);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside, true);
  }, [contextMenu, setContextMenu]);

  const handleDeleteBlock = useCallback(
    (blockIdOrIds: string | string[]) => {
      if (isReadOnly) return;
      const ids = Array.isArray(blockIdOrIds) ? blockIdOrIds : [blockIdOrIds];

      // Filter out core blocks from deletion
      const deletableIds = ids.filter((id) => {
        const block = blocks.find((b) => b.id === id);
        return block?.type !== "core";
      });

      if (deletableIds.length === 0) return;

      const idSet = new Set(deletableIds);

      applyWithUndoBoundary(() => {
        deleteBlocks(deletableIds);

        const linksToRemove = links
          .filter((l) => idSet.has(l.source) || idSet.has(l.target))
          .map((l) => l.id);
        if (linksToRemove.length > 0) {
          deleteLinks(linksToRemove);
        }
      });
    },
    [
      deleteBlocks,
      deleteLinks,
      blocks,
      links,
      isReadOnly,
      applyWithUndoBoundary,
    ],
  );

  const onBlocksChange = useCallback(
    (changes: NodeChange[]) => {
      if (isReadOnly) return;
      const toRemove = changes
        .filter((c): c is { id: string; type: "remove" } => c.type === "remove")
        .map((c) => c.id);

      if (toRemove.length > 0) {
        handleDeleteBlock(toRemove);
      }

      // Enforce symmetric resizing
      const coreChanges = changes.filter((c) => {
        if (!("id" in c)) return false;
        const block = blocks.find((b) => b.id === c.id);
        return block?.type === "core";
      });

      if (coreChanges.length > 0) {
        const dimChange = coreChanges.find((c) => c.type === "dimensions");
        if (
          dimChange &&
          dimChange.type === "dimensions" &&
          dimChange.dimensions
        ) {
          const newWidth = dimChange.dimensions.width;
          const newHeight = dimChange.dimensions.height;

          const processedChanges = changes
            .map((c) => {
              if (
                c.type === "position" &&
                blocks.find((b) => b.id === c.id)?.type === "core"
              ) {
                return null;
              }
              return c;
            })
            .filter(Boolean) as NodeChange[];

          if (dimChange) {
            processedChanges.push({
              id: dimChange.id,
              type: "position",
              position: { x: -newWidth / 2, y: -newHeight / 2 },
            });
          }

          setBlocks(
            (nds) =>
              applyNodeChanges(processedChanges, nds) as Node<BlockData>[],
          );
          return;
        }
      }

      // Prevent core dragging and handle collapsed folders moving children
      const filteredChanges = changes.filter((c) => {
        if (c.type === "position" && c.position) {
          const block = blocks.find((b) => b.id === c.id);
          if (block?.type === "core") return false;
        }
        return c.type !== "remove";
      });

      const descendantChanges: NodeChange[] = [];
      filteredChanges.forEach((c) => {
        if (c.type === "position" && c.position && c.dragging) {
          const block = blocks.find((b) => b.id === c.id);
          if (block && block.type === "folder") {
            const metadata = parseFolderMetadata(block.data?.metadata);
            if (metadata.isCollapsed) {
              const dx = c.position.x - block.position.x;
              const dy = c.position.y - block.position.y;
              if (dx !== 0 || dy !== 0) {
                const descendantIds = getDescendantIds(block.id, links);
                descendantIds.delete(block.id);
                descendantIds.forEach((descId) => {
                  const descBlock = blocks.find((b) => b.id === descId);
                  if (descBlock) {
                    descendantChanges.push({
                      id: descId,
                      type: "position",
                      position: {
                        x: descBlock.position.x + dx,
                        y: descBlock.position.y + dy,
                      },
                      dragging: c.dragging,
                    });
                  }
                });
              }
            }
          }
        }
      });

      if (filteredChanges.length > 0 || descendantChanges.length > 0) {
        setBlocks(
          (blocks) =>
            applyNodeChanges(
              [...filteredChanges, ...descendantChanges],
              blocks,
            ) as Node<BlockData>[],
        );
      }
    },
    [handleDeleteBlock, setBlocks, blocks, links, isReadOnly],
  );

  const onLinksChange = useCallback(
    (changes: EdgeChange[]) => {
      if (isReadOnly) return;
      const toRemove = changes
        .filter((c): c is { id: string; type: "remove" } => c.type === "remove")
        .map((c) => c.id);

      if (toRemove.length > 0) {
        applyWithUndoBoundary(() => {
          deleteLinks(toRemove);
        });
        return;
      }

      const hasUndoableChanges = changes.some(
        (change) => change.type !== "select",
      );
      if (!hasUndoableChanges) {
        setLinks((lks) => applyEdgeChanges(changes, lks || []), {
          recordInUndo: false,
        });
        return;
      }

      applyWithUndoBoundary(() => {
        setLinks((lks) => applyEdgeChanges(changes, lks || []), {
          recordInUndo: true,
        });
      });
    },
    [deleteLinks, isReadOnly, applyWithUndoBoundary, setLinks],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (isReadOnly) return;
      if (!params.source || !params.target) return;
      if (params.source === params.target) return;

      const targetBlock = blocks.find((b) => b.id === params.target);
      // Strict enforcement: Core blocks cannot be targets
      if (targetBlock?.type === "core") return;

      const link: Edge = {
        ...params,
        id: `e${params.source}-${params.target}`,
        type: "connection",
        markerEnd: "connection-arrow",
        data: { label: "" },
        zIndex: 2000,
      };

      const violatedRule = validateFolderLinkRules(
        blocks.map((block) => ({
          id: block.id,
          type: block.type,
          data: {
            blockType: block.data?.blockType,
            metadata: block.data?.metadata,
          },
        })),
        [...links, { source: link.source, target: link.target }],
      );

      if (violatedRule) {
        if (violatedRule.code === "folder_to_core") {
          toast.error(
            dict.blocks.folderCannotLinkToCore ||
              "Folder blocks cannot target the core block.",
          );
        } else if (violatedRule.code === "folder_reverse_link") {
          toast.error(
            dict.blocks.folderReverseLinkForbidden ||
              "Reverse folder links are not allowed.",
          );
        } else if (violatedRule.code === "folder_multiple_parents") {
          toast.error(
            dict.blocks.folderSingleParentOnly ||
              "A block cannot depend on multiple folders.",
          );
        } else if (violatedRule.code === "folder_collapsed_source") {
          toast.error(dict.blocks.folderCollapsedSourceForbidden);
        }
        return;
      }

      applyWithUndoBoundary(() => {
        setLinks((lks) => addEdge(link, lks || []), { recordInUndo: true });
      });
    },
    [setLinks, blocks, links, isReadOnly, dict.blocks, applyWithUndoBoundary],
  );

  const applyFolderVisibility = useCallback(
    (nodes: Node<BlockData>[], graphLinks: Edge[]) => {
      const hiddenIds = computeHiddenNodeIds(nodes, graphLinks);
      return nodes.map((node) => {
        const shouldHide = hiddenIds.has(node.id);
        if (node.hidden === shouldHide) {
          return node;
        }

        return {
          ...node,
          hidden: shouldHide,
        };
      });
    },
    [],
  );

  const handleToggleFolderCollapse = useCallback(
    (folderId: string, isCollapsed: boolean) => {
      if (isReadOnly) return;

      applyWithUndoBoundary(() => {
        setBlocks(
          (currentNodes) => {
            const updatedNodes = currentNodes.map((node) => {
              if (node.id !== folderId) {
                return node;
              }

              const metadata = parseFolderMetadata(node.data?.metadata);

              return {
                ...node,
                data: {
                  ...node.data,
                  metadata: JSON.stringify({ ...metadata, isCollapsed }),
                },
              };
            });

            return applyFolderVisibility(updatedNodes, links);
          },
          { recordInUndo: true },
        );
      });
    },
    [
      applyFolderVisibility,
      isReadOnly,
      links,
      applyWithUndoBoundary,
      setBlocks,
    ],
  );

  const duplicateBlock = useCallback(
    (blockId: string) => {
      if (isReadOnly) return null;
      const src = blocks.find((b) => b.id === blockId);
      if (!src) return null;
      if (src.type === "core") return null;

      const newId = uuidv4();
      const offset = 20;

      const srcContent = src.data?.yText
        ? safeReadYText(src.data.yText as Y.Text, src.data?.content as string)
        : (src.data?.content as string) || "";

      const newData = {
        ...(src.data as Record<string, unknown>),
        content: srcContent,
        updatedAt: new Date().toISOString(),
        lastEditor: currentUser?.username || src.data?.lastEditor,
      } as Partial<BlockData>;

      // Remove runtime-only props
      delete newData.yText;
      delete newData.onContentChange;
      delete newData.onFocus;
      delete newData.onBlur;

      const blockWidth = src.width || DEFAULT_BLOCK_WIDTH;
      const blockHeight = src.height || DEFAULT_BLOCK_HEIGHT;

      const newBlock: Node<BlockData> = {
        ...src,
        id: newId,
        position: {
          x: (src.position?.x || 0) + offset,
          y: (src.position?.y || 0) + offset,
        },
        width: blockWidth,
        height: blockHeight,
        style: { ...(src.style || {}), width: blockWidth, height: blockHeight },
        selected: true,
        data: newData as BlockData,
      } as unknown as Node<BlockData>;

      applyMutation({
        intent: "Created new block",
        // Deselect existing nodes/links and add the new block as selected
        blocksUpdate: (nds) => [
          ...nds.map((n) => ({ ...n, selected: false })),
          newBlock,
        ],
        linksUpdate: (lks) => lks.map((l) => ({ ...l, selected: false })),
      });

      return newId;
    },
    [blocks, applyMutation, currentUser, isReadOnly],
  );

  useEffect(() => {
    const hiddenIds = computeHiddenNodeIds(blocks, links);
    const hasVisibilityDiff = blocks.some(
      (node) => (node.hidden || false) !== hiddenIds.has(node.id),
    );

    if (!hasVisibilityDiff) {
      return;
    }

    setBlocks((currentNodes) => applyFolderVisibility(currentNodes, links));
  }, [blocks, links, setBlocks, applyFolderVisibility]);

  const onBlockDragStart = useCallback(
    (_: React.MouseEvent, block: Node) => {
      if (isReadOnly) return;
      if (block.type === "core") return;
      setContextMenu(null);
      updateMyPresence({ draggingBlockId: block.id });
    },
    [setContextMenu, updateMyPresence, isReadOnly],
  );

  const onBlockDrag = useCallback(
    (_: React.MouseEvent, block: Node) => {
      if (isReadOnly) return;
      if (block.type === "core") return;

      const { helperLines: activeHelperLines, snappedPosition } =
        calculateHelperLines(
          block as Node<BlockData>,
          blocks,
          SNAP_THRESHOLD_PX,
          isShiftPressed,
        );

      setHelperLines(activeHelperLines);

      const position = snappedPosition || block.position;

      const blockRect = {
        x: position.x,
        y: position.y,
        width: block.measured?.width || block.width || DEFAULT_BLOCK_WIDTH,
        height: block.measured?.height || block.height || DEFAULT_BLOCK_HEIGHT,
      };

      const adjustedPos = getAdjustedPosition(blockRect, {
        x: CORE_BLOCK_X,
        y: CORE_BLOCK_Y,
        width: CORE_BLOCK_WIDTH,
        height: CORE_BLOCK_HEIGHT,
      });

      lastDragPositionRef.current = {
        blockId: block.id,
        position: adjustedPos,
      };

      if (
        adjustedPos.x !== block.position.x ||
        adjustedPos.y !== block.position.y
      ) {
        const dx = adjustedPos.x - block.position.x;
        const dy = adjustedPos.y - block.position.y;

        let descendantIds = new Set<string>();
        if (block.type === "folder") {
          const metadata = parseFolderMetadata(block.data?.metadata);
          if (metadata.isCollapsed) {
            descendantIds = getDescendantIds(block.id, links);
            descendantIds.delete(block.id);
          }
        }

        setBlocks((blocks) =>
          blocks.map((b) => {
            if (b.id === block.id) {
              return { ...b, position: adjustedPos } as Node<BlockData>;
            }
            if (descendantIds.has(b.id)) {
              return {
                ...b,
                position: { x: b.position.x + dx, y: b.position.y + dy },
              } as Node<BlockData>;
            }
            return b;
          }),
        );
      }
    },
    [setBlocks, blocks, links, isReadOnly, isShiftPressed],
  );

  const onBlockDragStop = useCallback(
    (_: React.MouseEvent, block: Node) => {
      if (isReadOnly) return;
      if (block.type === "core") return;
      updateMyPresence({ draggingBlockId: null });
      setHelperLines([]);

      const lastPosition = lastDragPositionRef.current;
      const finalPosition =
        lastPosition?.blockId === block.id
          ? lastPosition.position
          : block.position;

      lastDragPositionRef.current = null;

      applyMutation({
        intent: "Moved block",
        blocksUpdate: (blocks) =>
          blocks.map((b) =>
            b.id === block.id
              ? ({ ...block, position: finalPosition } as Node<BlockData>)
              : b,
          ),
      });
    },
    [applyMutation, updateMyPresence, isReadOnly],
  );

  const onContentChange = useCallback(
    (
      blockId: string,
      content: string,
      updatedAt: string,
      lastEditor: string,
      metadata?: string | Record<string, unknown>,
      title?: string,
      reactions?: {
        emoji: string;
        count: number;
        users: (string | { id: string; username: string })[];
      }[],
    ) => {
      setBlocks((blocks) =>
        blocks.map((b) =>
          b.id === blockId
            ? {
                ...b,
                data: {
                  ...b.data,
                  content,
                  updatedAt,
                  lastEditor,
                  ...(metadata !== undefined ? { metadata } : {}),
                  ...(title !== undefined ? { title } : {}),
                  ...(reactions !== undefined ? { reactions } : {}),
                },
              }
            : b,
        ),
      );
    },
    [blocks, links, setBlocks],
  );

  const onResizeCallback = useCallback(() => {
    if (isReadOnly) return;
  }, [isReadOnly]);

  const onResizeEndCallback = useCallback(
    (
      blockId: string,
      params: { width: number; height: number; x?: number; y?: number },
    ) => {
      if (isReadOnly) return;
      const block = blocks.find((b) => b.id === blockId);
      if (!block || block.type === "core") return;
      setHelperLines([]);

      const adjustedPos = getAdjustedPosition(
        {
          x: params.x !== undefined ? params.x : block.position.x,
          y: params.y !== undefined ? params.y : block.position.y,
          width: params.width,
          height: params.height,
        },
        {
          x: CORE_BLOCK_X,
          y: CORE_BLOCK_Y,
          width: CORE_BLOCK_WIDTH,
          height: CORE_BLOCK_HEIGHT,
        },
      );

      applyMutation({
        intent: "Resized block",
        blocksUpdate: (blocks) =>
          blocks.map((b) =>
            b.id === blockId
              ? {
                  ...b,
                  width: params.width,
                  height: params.height,
                  position: adjustedPos,
                  style: {
                    ...b.style,
                    width: params.width,
                    height: params.height,
                  },
                }
              : b,
          ),
      });
    },
    [applyMutation, blocks, isReadOnly],
  );

  const onBlockContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, block: Node) => {
      event.preventDefault();
      if (isReadOnly) return;
      if (block.type === "core") {
        setContextMenu(null);
        return;
      }

      // Ensure the block is selected when right-clicked
      setBlocks((prevBlocks) => {
        const isAlreadySelected = prevBlocks.find((b) => b.id === block.id)
          ?.selected;
        if (isAlreadySelected) return prevBlocks;

        return prevBlocks.map((b) => ({
          ...b,
          selected: b.id === block.id,
        }));
      });

      setContextMenu({
        id: block.id,
        type: "block",
        top: (event as React.MouseEvent).clientY,
        left: (event as React.MouseEvent).clientX,
      });
    },
    [setContextMenu, setBlocks],
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      if (isReadOnly) return;
      setContextMenu({
        type: "pane",
        top:
          (event as MouseEvent).clientY ?? (event as React.MouseEvent).clientY,
        left:
          (event as MouseEvent).clientX ?? (event as React.MouseEvent).clientX,
      });
    },
    [setContextMenu, isReadOnly],
  );

  const handleCreateBlock = useCallback(
    (
      pos?: { x: number; y: number },
      connectFromId?: string,
      blockType:
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
        | "folder" = "text",
      initialContent: string = "",
      initialMetadata?: Record<string, unknown>,
    ) => {
      if (isReadOnly) return null;
      if (!currentUser) return null;

      const isSketch = blockType === "sketch";
      const isKanban = blockType === "kanban";
      const blockWidth = isSketch
        ? 600
        : isKanban
          ? DEFAULT_KANBAN_BLOCK_WIDTH
          : DEFAULT_BLOCK_WIDTH;
      const blockHeight = isSketch
        ? 450
        : isKanban
          ? DEFAULT_KANBAN_BLOCK_HEIGHT
          : DEFAULT_BLOCK_HEIGHT;

      const screenPos = pos
        ? null
        : {
            x: contextMenu?.left ?? window.innerWidth / 2,
            y: contextMenu?.top ?? window.innerHeight / 2,
          };

      const position = getAdjustedPosition(
        {
          x: pos ? pos.x : screenToFlowPosition(screenPos!).x,
          y: pos ? pos.y : screenToFlowPosition(screenPos!).y,
          width: blockWidth,
          height: blockHeight,
        },
        {
          x: CORE_BLOCK_X,
          y: CORE_BLOCK_Y,
          width: CORE_BLOCK_WIDTH,
          height: CORE_BLOCK_HEIGHT,
        },
      );

      const newBlockId = uuidv4();
      const defaultMetadataByType: Partial<
        Record<typeof blockType, Record<string, unknown>>
      > = {
        palette: { colors: [] },
        checklist: { items: [] },
        folder: { isCollapsed: false },
      };
      const resolvedMetadata =
        initialMetadata || defaultMetadataByType[blockType];

      const newBlock: Node<BlockData> = {
        id: newBlockId,
        type: blockType,
        position,
        width: blockWidth,
        height: blockHeight,
        style: { width: blockWidth, height: blockHeight },
        data: {
          title: "",
          content: initialContent,
          metadata: resolvedMetadata
            ? JSON.stringify(resolvedMetadata)
            : undefined,
          ownerId: currentUser.id,
          authorName: currentUser.username,
          authorColor: currentUser.color,
          blockType,
          isLocked: false,
          isContentLocked: false,
          isPositionLocked: false,
          updatedAt: new Date().toISOString(),
          lastEditor: currentUser.username,
          isEditingLink: false,
          isEditingGithub: false,
        },
      };

      if (connectFromId) {
        const fromBlock = blocks.find((b) => b.id === connectFromId);
        if (fromBlock) {
          const fromWidth = fromBlock.width || DEFAULT_BLOCK_WIDTH;
          const fromHeight = fromBlock.height || DEFAULT_BLOCK_HEIGHT;
          const fromCenterX = (fromBlock.position.x || 0) + fromWidth / 2;

          const isRight = position.x > fromCenterX;

          const sourceX =
            (fromBlock.position.x || 0) + (isRight ? fromWidth : 0);
          const sourceY = (fromBlock.position.y || 0) + fromHeight * 0.5;
          const targetX = position.x + (isRight ? 0 : blockWidth);
          const targetY = position.y + blockHeight * 0.5;

          const newLink: Edge = {
            id: uuidv4(),
            source: connectFromId,
            target: newBlockId,
            type: "connection",
            sourceHandle: isRight ? "right" : "left",
            targetHandle: isRight ? "left" : "right",
            markerEnd: "connection-arrow",
            data: {
              sourceX,
              sourceY,
              targetX,
              targetY,
              sourceOrientation: isRight ? "right" : "left",
              targetOrientation: isRight ? "left" : "right",
            },
          };

          applyMutation({
            intent: "Created block with connection",
            blocksUpdate: (blocks) => [...blocks, newBlock],
            linksUpdate: (lks) => [...lks, newLink],
          });
        }
      } else {
        applyMutation({
          intent: "Created new block",
          blocksUpdate: (nds) => [...nds, newBlock],
        });
      }

      setContextMenu(null);
      return newBlockId;
    },
    [
      currentUser,
      contextMenu,
      screenToFlowPosition,
      blocks,
      applyMutation,
      setContextMenu,
      isReadOnly,
    ],
  );

  const handleToggleContentLock = useCallback(
    (blockId: string, isContentLocked: boolean) => {
      if (isReadOnly) return;
      applyMutation({
        intent: isContentLocked
          ? "Locked block content"
          : "Unlocked block content",
        blocksUpdate: (blocks) =>
          blocks.map((n) =>
            n.id === blockId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    isLocked: isContentLocked,
                    isContentLocked,
                    isPositionLocked: isBlockPositionLocked(n.data),
                  },
                }
              : n,
          ),
      });
    },
    [applyMutation, isReadOnly],
  );

  const handleTogglePositionLock = useCallback(
    (blockId: string, isPositionLocked: boolean) => {
      if (isReadOnly) return;
      applyMutation({
        intent: isPositionLocked
          ? "Locked block position"
          : "Unlocked block position",
        blocksUpdate: (blocks) =>
          blocks.map((n) =>
            n.id === blockId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    isLocked: isBlockContentLocked(n.data),
                    isContentLocked: isBlockContentLocked(n.data),
                    isPositionLocked,
                  },
                }
              : n,
          ),
      });
    },
    [applyMutation, isReadOnly],
  );

  const handleTransferBlock = useCallback(
    (
      blockId: string,
      newOwner: {
        id: string;
        username: string | null;
        displayName: string | null;
        color?: string;
      },
    ) => {
      if (isReadOnly) return;
      applyMutation({
        intent: "Transferred block ownership",
        blocksUpdate: (blocks) =>
          blocks.map((n) =>
            n.id === blockId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    ownerId: newOwner.id,
                    authorName:
                      newOwner.displayName || newOwner.username || "Unknown",
                    authorColor: newOwner.color,
                  },
                }
              : n,
          ),
      });
    },
    [applyMutation, isReadOnly],
  );

  return {
    onBlocksChange,
    onLinksChange,
    onConnect,
    onBlockDragStart,
    onBlockDrag,
    onBlockDragStop,
    onContentChange,
    onResizeCallback,
    onResizeEndCallback,
    onBlockContextMenu,
    onEdgeContextMenu,
    onPaneContextMenu,
    handleCreateBlock,
    duplicateBlock,
    handleDeleteBlock,
    handleToggleContentLock,
    handleTogglePositionLock,
    handleToggleFolderCollapse,
    handleTransferBlock,
    handleFitView,
    helperLines,
  };
};
