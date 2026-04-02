import React, { useCallback, useRef } from "react";
import { Node, Edge, useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import { useI18n } from "@providers/I18nProvider";
import { useRouter } from "next/navigation";
import { BlockData } from "@components/project/CanvasBlock";
import { clientLogger } from "../../../../lib/clientLogger";

/**
 * Deduplicates an array of objects by the `id` property, keeping the last occurrence.
 */
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((i) => [i.id, i])).values());
}
import {
  computeLongestSideViewport,
  getNodesBoundsWithFallback,
  getReactFlowViewportSize,
} from "@components/project/utils/fitViewport";

const FIT_DURATION = 800;
const FIT_PADDING = 0.12;
const FIT_MIN_ZOOM = 0.1;
const FIT_MAX_ZOOM_ALL = 1;

interface UseProjectDataProps {
  initialProjectId?: string;
  blocks: Node<BlockData>[];
  links: Edge[];
  setBlocks: (
    blocks: Node<BlockData>[] | ((nds: Node<BlockData>[]) => Node<BlockData>[]),
  ) => void;
  setLinks: (links: Edge[] | ((lks: Edge[]) => Edge[])) => void;
  replaceGraph: (
    blocks: Node<BlockData>[],
    links: Edge[],
    options?: { force?: boolean },
  ) => void;
  setIsPreviewMode: (val: boolean) => void;
  setSelectedStateId: (val: string | null) => void;
  setIsLoading: (val: boolean) => void;
  isInitialized: React.MutableRefObject<boolean>;
  isPreviewMode: boolean;
  setProjectOwnerId: (id: string | null) => void;
  handleExitPreview: () => void;
}

interface BlockResponse {
  id: string;
  data: BlockData;
  [key: string]: unknown;
}

export const useProjectData = ({
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
}: UseProjectDataProps) => {
  const { dict } = useI18n();
  const router = useRouter();
  const { fitView, setViewport } = useReactFlow();
  const loadedBlockIds = useRef<Set<string>>(new Set());
  const prePreviewGraphRef = useRef<{
    blocks: Node<BlockData>[];
    links: Edge[];
  } | null>(null);

  const cloneBlocks = useCallback(
    (source: Node<BlockData>[]) =>
      source.map((block) => ({
        ...block,
        data: { ...(block.data || {}) },
      })),
    [],
  );

  const cloneLinks = useCallback(
    (source: Edge[]) => source.map((link) => ({ ...link })),
    [],
  );

  const fitBlocksByLongestSide = useCallback(
    (targetBlocks: Node<BlockData>[]) => {
      if (targetBlocks.length === 0) {
        setViewport({ x: 0, y: 0, zoom: 1 }, { duration: FIT_DURATION });
        return;
      }

      const bounds = getNodesBoundsWithFallback(targetBlocks as Node[]);
      const viewportSize = getReactFlowViewportSize();

      if (!bounds || !viewportSize) {
        fitView({
          nodes: targetBlocks,
          duration: FIT_DURATION,
          maxZoom: FIT_MAX_ZOOM_ALL,
          padding: FIT_PADDING,
        });
        return;
      }

      const nextViewport = computeLongestSideViewport(bounds, viewportSize, {
        padding: FIT_PADDING,
        minZoom: FIT_MIN_ZOOM,
        maxZoom: FIT_MAX_ZOOM_ALL,
      });

      setViewport(nextViewport, { duration: FIT_DURATION });
    },
    [fitView, setViewport],
  );

  const fetchGraph = useCallback(
    async (isExplicitApply = false) => {
      if (!initialProjectId || initialProjectId === "undefined") return;
      setIsLoading(true);
      try {
        // Fetch summary mode first to get structure quickly
        const res = await fetch(
          `/api/projects/${initialProjectId}/graph?mode=summary`,
        );
        if (!res.ok) {
          if (res.status === 403 || res.status === 404) {
            toast.error(
              res.status === 403
                ? dict.project.forbidden
                : dict.common.notFound,
            );
            router.push("/home");
            return;
          }
          throw new Error();
        }
        const data = await res.json();
        const newBlocks = data.blocks || [];
        const newLinks = dedupeById((data.links || []) as Edge[]).map(
          (l: Edge) => ({
            ...l,
            type: l.type || "connection",
            markerEnd: "connection-arrow",
            zIndex: 2000,
          }),
        );

        if (typeof window !== "undefined") {
          const serverStateId = data.currentStateId;
          if (typeof serverStateId === "string" && serverStateId.length > 0) {
            localStorage.setItem(
              `ideon:yjs:lastServerState:${initialProjectId}`,
              serverStateId,
            );
          }
        }

        if (isExplicitApply) {
          replaceGraph(newBlocks, newLinks, { force: true });
        } else {
          setBlocks(newBlocks);
          setLinks(newLinks);
        }

        // Initialize loadedBlockIds (mostly empty in summary mode)
        loadedBlockIds.current.clear();

        setProjectOwnerId(data.projectOwnerId || null);
        isInitialized.current = true;
        setTimeout(() => {
          fitBlocksByLongestSide(newBlocks);
        }, 100);
      } catch {
        toast.error(dict.modals.noHistory);
      } finally {
        setIsLoading(false);
      }
    },
    [
      initialProjectId,
      setBlocks,
      setLinks,
      replaceGraph,
      fitView,
      fitBlocksByLongestSide,
      setViewport,
      router,
      setIsLoading,
      isInitialized,
    ],
  );

  const fetchBlockDetails = useCallback(
    async (ids: string[]) => {
      if (!initialProjectId || initialProjectId === "undefined") return;

      const idsToFetch = ids.filter((id) => !loadedBlockIds.current.has(id));
      if (idsToFetch.length === 0) return;

      // Mark as loaded immediately to prevent duplicate fetches
      idsToFetch.forEach((id) => loadedBlockIds.current.add(id));

      // Chunk requests
      const CHUNK_SIZE = 50;
      for (let i = 0; i < idsToFetch.length; i += CHUNK_SIZE) {
        const chunk = idsToFetch.slice(i, i + CHUNK_SIZE);
        try {
          const res = await fetch(
            `/api/projects/${initialProjectId}/graph?ids=${chunk.join(",")}`,
          );
          if (!res.ok) continue;
          const data = await res.json();
          const newBlocks = (data.blocks || []) as BlockResponse[];

          try {
            newBlocks.forEach((b) => {
              try {
                const maybeData =
                  typeof b.data === "string" ? JSON.parse(b.data) : b.data;
                const content = maybeData?.content;
                if (typeof content === "string") {
                  const len = content.length;
                  if (len > 1024 * 1024) {
                    clientLogger.warn("Large block content detected", {
                      id: b.id,
                      length: len,
                    });
                  }
                }
              } catch (e) {
                clientLogger.debug("Failed to parse block data", {
                  id: b.id,
                  error: e,
                });
              }
            });
          } catch (e) {
            clientLogger.error("Error scanning block sizes", e);
          }

          setBlocks((currentBlocks) => {
            const newBlocksMap = new Map(newBlocks.map((b) => [b.id, b]));
            return currentBlocks.map((b) => {
              const newBlock = newBlocksMap.get(b.id);
              if (newBlock) {
                return {
                  ...newBlock,
                  id: b.id, // Ensure id is present
                  selected: b.selected,
                  position: b.position, // Keep current position
                  width: b.width,
                  height: b.height,
                  data: {
                    ...newBlock.data,
                    isSummary: false,
                  },
                } as Node<BlockData>;
              }
              return b;
            });
          });
        } catch (error) {
          clientLogger.error("Failed to fetch block details", error);
          // Allow retrying on error
          chunk.forEach((id) => loadedBlockIds.current.delete(id));
        }
      }
    },
    [initialProjectId, setBlocks],
  );

  const fetchProjectMetadata = useCallback(async () => {
    if (!initialProjectId || initialProjectId === "undefined") return;
    try {
      const res = await fetch(`/api/projects/${initialProjectId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.project?.ownerId) {
          setProjectOwnerId(data.project.ownerId);
        }
      }
    } catch (error) {
      clientLogger.error("Failed to fetch project metadata", error);
    }
  }, [initialProjectId, setProjectOwnerId]);

  const handlePreview = useCallback(
    async (stateId: string | null) => {
      if (!stateId) {
        const previousGraph = prePreviewGraphRef.current;
        if (previousGraph) {
          setBlocks(cloneBlocks(previousGraph.blocks));
          setLinks(cloneLinks(previousGraph.links));
          prePreviewGraphRef.current = null;
          setIsPreviewMode(false);
        } else {
          handleExitPreview();
        }
        setSelectedStateId(null);
        return;
      }

      if (!isPreviewMode && !prePreviewGraphRef.current) {
        prePreviewGraphRef.current = {
          blocks: cloneBlocks(blocks),
          links: cloneLinks(links),
        };
      }

      setIsPreviewMode(true);
      setSelectedStateId(stateId);

      try {
        const res = await fetch(
          `/api/projects/${initialProjectId}/temporal?action=reconstruct&stateId=${stateId}`,
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        setBlocks(data.blocks as Node<BlockData>[]);
        setLinks(
          (data.links || []).map((l: Edge) => ({
            ...l,
            type: l.type || "connection",
            markerEnd: "connection-arrow",
          })),
        );
      } catch {
        prePreviewGraphRef.current = null;
        setIsPreviewMode(false);
        setSelectedStateId(null);
        toast.error(dict.modals.noHistory);
      }
    },
    [
      initialProjectId,
      isPreviewMode,
      blocks,
      links,
      dict.common,
      setBlocks,
      setLinks,
      cloneBlocks,
      cloneLinks,
      setIsPreviewMode,
      setSelectedStateId,
      handleExitPreview,
    ],
  );

  const handleApplyState = useCallback(
    async (stateId: string) => {
      try {
        const res = await fetch(`/api/projects/${initialProjectId}/temporal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stateId, action: "apply" }),
        });
        if (!res.ok) throw new Error();

        setIsPreviewMode(false);
        setSelectedStateId(null);
        toast.success(dict.modals.stateApplied);

        queueMicrotask(() => {
          fetchGraph(true);
        });
        prePreviewGraphRef.current = null;
      } catch {
        toast.error(dict.modals.noHistory);
      }
    },
    [
      initialProjectId,
      dict.common,
      setIsPreviewMode,
      setSelectedStateId,
      fetchGraph,
    ],
  );

  return {
    fetchGraph,
    fetchProjectMetadata,
    handlePreview,
    handleApplyState,
    fetchBlockDetails,
  };
};
