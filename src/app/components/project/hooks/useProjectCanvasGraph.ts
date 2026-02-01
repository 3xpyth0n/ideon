import React, { useEffect, useCallback } from "react";
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
import { v4 as uuidv4 } from "uuid";
import { UserPresence } from "./useProjectCanvasState";
import { BlockData } from "../CanvasBlock";
import {
  DEFAULT_BLOCK_WIDTH,
  DEFAULT_BLOCK_HEIGHT,
  CORE_BLOCK_X,
  CORE_BLOCK_Y,
  CORE_BLOCK_WIDTH,
  CORE_BLOCK_HEIGHT,
} from "../utils/constants";
import { getAdjustedPosition } from "../utils/collision";

interface UseProjectCanvasGraphProps {
  currentUser: UserPresence | null;
  blocks: Node<BlockData>[];
  links: Edge[];
  setBlocks: (
    blocks:
      | Node<BlockData>[]
      | ((blocks: Node<BlockData>[]) => Node<BlockData>[]),
  ) => void;
  setLinks: (links: Edge[] | ((lks: Edge[]) => Edge[])) => void;
  deleteBlocks: (ids: string[]) => void;
  deleteLinks: (ids: string[]) => void;
  updateMyPresence: (presence: Partial<UserPresence>) => void;
  setContextMenu: (
    val: {
      id?: string;
      type: "block" | "pane";
      top: number;
      left: number;
    } | null,
  ) => void;
  contextMenu: {
    id?: string;
    type: "block" | "pane";
    top: number;
    left: number;
  } | null;
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
}: UseProjectCanvasGraphProps) => {
  const { screenToFlowPosition, fitView, setViewport } = useReactFlow();

  const handleFitView = useCallback(() => {
    const selectedBlocks = blocks.filter((b) => b.selected);
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

  const applyMutation = useCallback(
    ({
      blocksUpdate,
      linksUpdate,
    }: {
      intent: string;
      blocksUpdate?: (blocks: Node<BlockData>[]) => Node<BlockData>[];
      linksUpdate?: (lks: Edge[]) => Edge[];
    }) => {
      if (blocksUpdate) {
        setBlocks(blocksUpdate);
      }
      if (linksUpdate) {
        setLinks(linksUpdate);
      }
    },
    [setBlocks, setLinks],
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
      const ids = Array.isArray(blockIdOrIds) ? blockIdOrIds : [blockIdOrIds];

      // Filter out core blocks from deletion
      const deletableIds = ids.filter((id) => {
        const block = blocks.find((b) => b.id === id);
        return block?.type !== "core";
      });

      if (deletableIds.length === 0) return;

      const idSet = new Set(deletableIds);

      deleteBlocks(deletableIds);

      const linksToRemove = links
        .filter((l) => idSet.has(l.source) || idSet.has(l.target))
        .map((l) => l.id);
      if (linksToRemove.length > 0) {
        deleteLinks(linksToRemove);
      }
    },
    [deleteBlocks, deleteLinks, blocks, links],
  );

  const onBlocksChange = useCallback(
    (changes: NodeChange[]) => {
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

      // Prevent core dragging
      const filteredChanges = changes.filter((c) => {
        if (c.type === "position" && c.position) {
          const block = blocks.find((b) => b.id === c.id);
          if (block?.type === "core") return false;
        }
        return c.type !== "remove";
      });

      if (filteredChanges.length > 0) {
        setBlocks(
          (blocks) =>
            applyNodeChanges(filteredChanges, blocks) as Node<BlockData>[],
        );
      }
    },
    [handleDeleteBlock, setBlocks, blocks],
  );

  const onLinksChange = useCallback(
    (changes: EdgeChange[]) => {
      const toRemove = changes
        .filter((c): c is { id: string; type: "remove" } => c.type === "remove")
        .map((c) => c.id);

      if (toRemove.length > 0) {
        deleteLinks(toRemove);
      } else {
        setLinks((lks) => applyEdgeChanges(changes, lks || []));
      }
    },
    [deleteLinks, setLinks],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      const targetBlock = blocks.find((b) => b.id === params.target);
      // Strict enforcement: Core blocks cannot be targets
      if (targetBlock?.type === "core") return;

      const link: Edge = {
        ...params,
        id: `e${params.source}-${params.target}`,
        type: "connection",
        markerEnd: "connection-arrow",
        data: { label: "" },
      };

      setLinks((lks) => addEdge(link, lks || []));
    },
    [setLinks, blocks],
  );

  const onBlockDragStart = useCallback(
    (_: React.MouseEvent, block: Node) => {
      if (block.type === "core") return;
      setContextMenu(null);
      updateMyPresence({ draggingBlockId: block.id });
    },
    [setContextMenu, updateMyPresence],
  );

  const onBlockDrag = useCallback(
    (_: React.MouseEvent, block: Node) => {
      if (block.type === "core") return;

      const adjustedPos = getAdjustedPosition(
        {
          x: block.position.x,
          y: block.position.y,
          width: block.measured?.width || block.width || DEFAULT_BLOCK_WIDTH,
          height:
            block.measured?.height || block.height || DEFAULT_BLOCK_HEIGHT,
        },
        {
          x: CORE_BLOCK_X,
          y: CORE_BLOCK_Y,
          width: CORE_BLOCK_WIDTH,
          height: CORE_BLOCK_HEIGHT,
        },
      );

      const adjustedBlock = {
        ...block,
        position: adjustedPos,
      };

      setBlocks((blocks) =>
        blocks.map((b) =>
          b.id === block.id ? (adjustedBlock as Node<BlockData>) : b,
        ),
      );
    },
    [setBlocks],
  );

  const onBlockDragStop = useCallback(
    (_: React.MouseEvent, block: Node) => {
      if (block.type === "core") return;
      updateMyPresence({ draggingBlockId: null });

      const adjustedPos = getAdjustedPosition(
        {
          x: block.position.x,
          y: block.position.y,
          width: block.measured?.width || block.width || DEFAULT_BLOCK_WIDTH,
          height:
            block.measured?.height || block.height || DEFAULT_BLOCK_HEIGHT,
        },
        {
          x: CORE_BLOCK_X,
          y: CORE_BLOCK_Y,
          width: CORE_BLOCK_WIDTH,
          height: CORE_BLOCK_HEIGHT,
        },
      );

      const adjustedBlock = {
        ...block,
        position: adjustedPos,
      };

      applyMutation({
        intent: "Moved block",
        blocksUpdate: (blocks) =>
          blocks.map((b) =>
            b.id === block.id ? (adjustedBlock as Node<BlockData>) : b,
          ),
      });
    },
    [applyMutation, updateMyPresence, links, blocks, setLinks],
  );

  const onContentChange = useCallback(
    (
      blockId: string,
      content: string,
      updatedAt: string,
      lastEditor: string,
      metadata?: string,
      title?: string,
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
                },
              }
            : b,
        ),
      );
    },
    [blocks, links, setBlocks],
  );

  const onResizeCallback = useCallback(
    (
      blockId: string,
      params: { width: number; height: number; x?: number; y?: number },
    ) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block || block.type === "core") return;

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

      // Apply position adjustment
      setBlocks((blocks) =>
        blocks.map((b) =>
          b.id === blockId
            ? {
                ...b,
                width: params.width,
                height: params.height,
                position: adjustedPos,
              }
            : b,
        ),
      );
    },
    [setBlocks, blocks],
  );

  const onResizeEndCallback = useCallback(
    (
      blockId: string,
      params: { width: number; height: number; x?: number; y?: number },
    ) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block || block.type === "core") return;

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
    [applyMutation, blocks],
  );

  const onBlockContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent, block: Node) => {
      event.preventDefault();
      if (block.type === "core") {
        setContextMenu(null);
        return;
      }

      // Special handling for GitHub blocks: right-click enters edit mode directly
      if (
        (block.data as BlockData)?.blockType === "github" ||
        (block.data as BlockData)?.blockType === "link"
      ) {
        // We set a special signal in blocks to trigger editing in CanvasBlock
        setBlocks((blocks) =>
          blocks.map((b) =>
            b.id === block.id
              ? {
                  ...b,
                  selected: true,
                  data: {
                    ...b.data,
                    isEditingGithub:
                      (block.data as BlockData)?.blockType === "github",
                    isEditingLink:
                      (block.data as BlockData)?.blockType === "link",
                  },
                }
              : b,
          ),
        );
        setContextMenu(null);
        return;
      }

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
      setContextMenu({
        type: "pane",
        top:
          (event as MouseEvent).clientY ?? (event as React.MouseEvent).clientY,
        left:
          (event as MouseEvent).clientX ?? (event as React.MouseEvent).clientX,
      });
    },
    [setContextMenu],
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
        | "checklist" = "text",
      initialContent: string = "",
      initialMetadata?: Record<string, unknown>,
    ) => {
      if (!currentUser) return null;

      const position = getAdjustedPosition(
        {
          x: pos
            ? pos.x
            : screenToFlowPosition({
                x: contextMenu?.left || 0,
                y: contextMenu?.top || 0,
              }).x,
          y: pos
            ? pos.y
            : screenToFlowPosition({
                x: contextMenu?.left || 0,
                y: contextMenu?.top || 0,
              }).y,
          width: DEFAULT_BLOCK_WIDTH,
          height: DEFAULT_BLOCK_HEIGHT,
        },
        {
          x: CORE_BLOCK_X,
          y: CORE_BLOCK_Y,
          width: CORE_BLOCK_WIDTH,
          height: CORE_BLOCK_HEIGHT,
        },
      );

      const newBlockId = uuidv4();
      const newBlock: Node<BlockData> = {
        id: newBlockId,
        type: blockType,
        position,
        width: DEFAULT_BLOCK_WIDTH,
        height: DEFAULT_BLOCK_HEIGHT,
        style: { width: DEFAULT_BLOCK_WIDTH, height: DEFAULT_BLOCK_HEIGHT },
        data: {
          title: "",
          content: initialContent,
          metadata: initialMetadata
            ? JSON.stringify(initialMetadata)
            : undefined,
          ownerId: currentUser.id,
          authorName: currentUser.username,
          authorColor: currentUser.color,
          blockType,
          isLocked: true,
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
          const targetX = position.x + (isRight ? 0 : DEFAULT_BLOCK_WIDTH);
          const targetY = position.y + DEFAULT_BLOCK_HEIGHT * 0.5;

          const newLink: Edge = {
            id: uuidv4(),
            source: connectFromId,
            target: newBlockId,
            type: "connection",
            sourceHandle: isRight ? "right" : "left",
            targetHandle: isRight ? "left-target" : "right-target",
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
    ],
  );

  const handleToggleLock = useCallback(
    (blockId: string, isLocked: boolean) => {
      applyMutation({
        intent: isLocked ? "Locked block" : "Unlocked block",
        blocksUpdate: (blocks) =>
          blocks.map((n) =>
            n.id === blockId ? { ...n, data: { ...n.data, isLocked } } : n,
          ),
      });
    },
    [applyMutation],
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
    [applyMutation],
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
    onPaneContextMenu,
    handleCreateBlock,
    handleDeleteBlock,
    handleToggleLock,
    handleTransferBlock,
    handleFitView,
  };
};
