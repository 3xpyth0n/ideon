import React, { useCallback } from "react";
import { Node, Edge, useReactFlow } from "@xyflow/react";
import { toast } from "sonner";
import { useI18n } from "@providers/I18nProvider";
import { useRouter } from "next/navigation";
import { uniqueById } from "@lib/utils";
import { BlockData } from "../CanvasBlock";

interface UseProjectDataProps {
  initialProjectId?: string;
  blocks: Node<BlockData>[];
  links: Edge[];
  setBlocks: (
    blocks: Node<BlockData>[] | ((nds: Node<BlockData>[]) => Node<BlockData>[]),
  ) => void;
  setLinks: (links: Edge[] | ((lks: Edge[]) => Edge[])) => void;
  replaceGraph: (blocks: Node<BlockData>[], links: Edge[]) => void;
  setIsPreviewMode: (val: boolean) => void;
  setSelectedStateId: (val: string | null) => void;
  setIsLoading: (val: boolean) => void;
  isInitialized: React.MutableRefObject<boolean>;
  isPreviewMode: boolean;
  setProjectOwnerId: (id: string | null) => void;
  handleExitPreview: () => void;
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

  const fetchGraph = useCallback(
    async (isExplicitApply = false) => {
      if (!initialProjectId || initialProjectId === "undefined") return;
      setIsLoading(true);
      try {
        const res = await fetch(`/api/projects/${initialProjectId}/graph`);
        if (!res.ok) {
          if (res.status === 403 || res.status === 404) {
            toast.error(
              res.status === 403 ? dict.common.forbidden : dict.common.notFound,
            );
            router.push("/home");
            return;
          }
          throw new Error();
        }
        const data = await res.json();
        const newBlocks = data.blocks || [];
        const newLinks = uniqueById((data.links || []) as Edge[]).map(
          (l: Edge) => ({
            ...l,
            type: l.type || "connection",
            markerEnd: "connection-arrow",
          }),
        );

        if (isExplicitApply) {
          replaceGraph(newBlocks, newLinks);
        } else {
          setBlocks(newBlocks);
          setLinks(newLinks);
        }

        setProjectOwnerId(data.projectOwnerId || null);
        isInitialized.current = true;
        setTimeout(() => {
          if (!newBlocks.length)
            setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 800 });
          else fitView({ duration: 800, maxZoom: 1 });
        }, 100);
      } catch {
        toast.error(dict.common.noHistory);
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
      setViewport,
      router,
      setIsLoading,
      isInitialized,
    ],
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
      console.error("Failed to fetch project metadata", error);
    }
  }, [initialProjectId, setProjectOwnerId]);

  const handlePreview = useCallback(
    async (stateId: string | null) => {
      if (!stateId) {
        handleExitPreview();
        setSelectedStateId(null);
        return;
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
        toast.error(dict.common.noHistory);
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

        handleExitPreview();
        setSelectedStateId(null);
        toast.success(dict.common.stateApplied);

        // Refresh the graph to pull the newly applied state and sync it to Yjs
        fetchGraph(true);
      } catch {
        toast.error(dict.common.noHistory);
      }
    },
    [
      initialProjectId,
      dict.common,
      setIsPreviewMode,
      setSelectedStateId,
      handleExitPreview,
      fetchGraph,
    ],
  );

  return {
    fetchGraph,
    fetchProjectMetadata,
    handlePreview,
    handleApplyState,
  };
};
