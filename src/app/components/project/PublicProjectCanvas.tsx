"use client";

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Panel,
  Controls,
  ControlButton,
  Node,
  Edge,
  useReactFlow,
  ConnectionMode,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import CanvasBlock, { BlockData } from "./CanvasBlock";
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
import ShellBlock from "./ShellBlock";
import CanvasEdge from "./CanvasEdge";
import { YDocContext } from "./YDocContext";
import { useI18n } from "@providers/I18nProvider";
import { Maximize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { DEFAULT_VIEWPORT, DEFAULT_BLOCK_WIDTH } from "./utils/constants";
import {
  computeLongestSideViewport,
  getNodesBoundsWithFallback,
  getReactFlowViewportSize,
} from "./utils/fitViewport";

const FIT_DURATION = 800;
const FIT_PADDING = 0.12;
const FIT_MIN_ZOOM = 0.1;
const FIT_MAX_ZOOM_SELECTED = 2;
const FIT_MAX_ZOOM_ALL = 1;

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
  sketch: SketchBlock,
  kanban: KanbanBlock,
  shell: ShellBlock,
  core: ProjectCoreBlock,
};

const linkTypes = {
  connection: CanvasEdge,
};

interface PublicProjectCanvasProps {
  blocks: Node<BlockData>[];
  links: Edge[];
  projectName: string;
}

function PublicProjectCanvasContent({
  blocks: initialBlocks,
  links: initialLinks,
  projectName,
}: PublicProjectCanvasProps) {
  const { dict } = useI18n();
  const { fitView, zoomIn, zoomOut, setViewport, getNodes, setNodes } =
    useReactFlow();
  const [zoom, setZoom] = useState(100);

  const applyLongestSideFit = useCallback(
    (targetNodes: Node<BlockData>[], maxZoom: number) => {
      if (targetNodes.length === 0) {
        fitView({ duration: FIT_DURATION, maxZoom, padding: FIT_PADDING });
        return;
      }
      const bounds = getNodesBoundsWithFallback(targetNodes);
      const viewportSize = getReactFlowViewportSize();
      if (!bounds || !viewportSize) {
        fitView({
          nodes: targetNodes,
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

  const handleZoomIn = useCallback(() => {
    void zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    void zoomOut({ duration: 200 });
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    const allNodes = getNodes();
    const selected = allNodes.filter((n) => n.selected);
    if (selected.length > 0)
      applyLongestSideFit(selected as Node<BlockData>[], FIT_MAX_ZOOM_SELECTED);
    else if (allNodes.length === 0)
      setViewport({ x: 0, y: 0, zoom: 1 }, { duration: FIT_DURATION });
    else applyLongestSideFit(allNodes as Node<BlockData>[], FIT_MAX_ZOOM_ALL);
  }, [getNodes, applyLongestSideFit, setViewport]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditing =
        ["INPUT", "TEXTAREA"].includes(target.tagName) ||
        target.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key === "0" && !isEditing) {
        e.preventDefault();
        handleFitView();
        return;
      }

      if (e.key === "Escape") {
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
        return;
      }

      const isArrow = [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.key);
      if (!isArrow || isEditing) return;

      const allNodes = getNodes() as Node<BlockData>[];
      const selected = allNodes.filter((n) => n.selected);
      const current =
        selected.length > 0 ? selected[selected.length - 1] : null;

      if (!current) {
        if (allNodes.length > 0) {
          e.preventDefault();
          setNodes((nds) => nds.map((n, i) => ({ ...n, selected: i === 0 })));
        }
        return;
      }

      e.preventDefault();
      const cx =
        current.position.x + (current.width || DEFAULT_BLOCK_WIDTH) / 2;
      const cy = current.position.y + (current.height || 100) / 2;

      let best: Node<BlockData> | null = null;
      let minDist = Infinity;

      allNodes.forEach((other) => {
        if (other.id === current.id) return;
        const ox = other.position.x + (other.width || DEFAULT_BLOCK_WIDTH) / 2;
        const oy = other.position.y + (other.height || 100) / 2;
        const dx = ox - cx;
        const dy = oy - cy;
        let valid = false;
        if (e.key === "ArrowRight") valid = dx > 0 && Math.abs(dy) < dx * 1.5;
        if (e.key === "ArrowLeft") valid = dx < 0 && Math.abs(dy) < -dx * 1.5;
        if (e.key === "ArrowDown") valid = dy > 0 && Math.abs(dx) < dy * 1.5;
        if (e.key === "ArrowUp") valid = dy < 0 && Math.abs(dx) < -dy * 1.5;
        if (valid) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDist) {
            minDist = dist;
            best = other;
          }
        }
      });

      if (best) {
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            selected: n.id === (best as Node<BlockData>).id,
          })),
        );
        applyLongestSideFit([best], FIT_MAX_ZOOM_SELECTED);
      }
    },
    [getNodes, setNodes, handleFitView, applyLongestSideFit],
  );

  const onMove = useCallback(
    (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      setZoom(Math.round(viewport.zoom * 100));
    },
    [],
  );

  const onPaneClick = useCallback(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }, []);

  const defaultBlocks = useMemo(() => {
    return initialBlocks.map((block) => ({
      ...block,
      draggable: false,
      selected: false,
      data: {
        ...block.data,
        isPreviewMode: true,
        isLocked: true,
      },
    }));
  }, [initialBlocks]);

  const defaultLinks = useMemo(() => {
    return initialLinks.map((link) => ({
      ...link,
      animated: false,
      selectable: false,
      selected: false,
    }));
  }, [initialLinks]);

  useEffect(() => {
    setTimeout(() => {
      applyLongestSideFit(defaultBlocks as Node<BlockData>[], FIT_MAX_ZOOM_ALL);
    }, 100);
  }, []);

  return (
    <div className="project-canvas-container preview-mode public-project-canvas">
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
      <ReactFlow
        defaultNodes={defaultBlocks}
        defaultEdges={defaultLinks}
        nodeTypes={blockTypes}
        edgeTypes={linkTypes}
        defaultViewport={DEFAULT_VIEWPORT}
        minZoom={0.1}
        maxZoom={4}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        elementsSelectable={true}
        nodesFocusable={true}
        edgesFocusable={false}
        selectNodesOnDrag={false}
        onMove={onMove}
        onKeyDown={onKeyDown}
        onPaneClick={onPaneClick}
        panOnScroll
        panOnDrag
        className="project-canvas preview-mode"
        proOptions={{ hideAttribution: true }}
        connectionMode={ConnectionMode.Loose}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={25}
          size={1.5}
          color="var(--text-muted)"
          className="opacity-20"
        />

        <Panel position="top-left" className="m-6!">
          <div className="flex flex-col">
            <span className="text-lg font-bold">{projectName}</span>
            <span className="text-[10px] uppercase font-bold opacity-40 tracking-widest">
              {dict.blocks.viewOnly || "View Only"}
            </span>
          </div>
        </Panel>

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
          <ControlButton onClick={handleZoomIn} title={dict.canvas.zoomIn}>
            <Plus />
          </ControlButton>
          <ControlButton onClick={handleZoomOut} title={dict.canvas.zoomOut}>
            <Minus />
          </ControlButton>
          <ControlButton onClick={handleFitView} title={dict.canvas.fitView}>
            <Maximize />
          </ControlButton>
        </Controls>
      </ReactFlow>
    </div>
  );
}

export function PublicProjectCanvas(props: PublicProjectCanvasProps) {
  const yDoc = useMemo(() => new Y.Doc(), []);

  useEffect(() => {
    return () => {
      yDoc.destroy();
    };
  }, [yDoc]);

  return (
    <YDocContext.Provider value={yDoc}>
      <ReactFlowProvider>
        <PublicProjectCanvasContent {...props} />
      </ReactFlowProvider>
    </YDocContext.Provider>
  );
}
