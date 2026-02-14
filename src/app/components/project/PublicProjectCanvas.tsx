"use client";

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Panel,
  Node,
  Edge,
  useReactFlow,
  ConnectionMode,
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
import CanvasEdge from "./CanvasEdge";
import { useI18n } from "@providers/I18nProvider";
import { useEffect, useMemo } from "react";
import { DEFAULT_VIEWPORT } from "./utils/constants";

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
  sketch: SketchBlock,
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
  const { fitView } = useReactFlow();

  // Mark all blocks as read-only via isPreviewMode
  const blocks = useMemo(() => {
    return initialBlocks.map((block) => ({
      ...block,
      draggable: false,
      selectable: false,
      data: {
        ...block.data,
        isPreviewMode: true,
        isLocked: true,
      },
    }));
  }, [initialBlocks]);

  const links = useMemo(() => {
    return initialLinks.map((link) => ({
      ...link,
      animated: false,
      selectable: false,
    }));
  }, [initialLinks]);

  useEffect(() => {
    // Fit view after initial render
    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 100);
  }, [fitView]);

  return (
    <div className="project-canvas-container preview-mode">
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
      <ReactFlow
        nodes={blocks}
        edges={links}
        nodeTypes={blockTypes}
        edgeTypes={linkTypes}
        defaultViewport={DEFAULT_VIEWPORT}
        minZoom={0.1}
        maxZoom={4}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        elementsSelectable={false}
        panOnScroll
        panOnDrag
        fitView
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

        <Panel position="top-left" className="!m-6">
          <div className="flex flex-col">
            <span className="text-lg font-bold">{projectName}</span>
            <span className="text-[10px] uppercase font-bold opacity-40 tracking-widest">
              {dict.blocks.viewOnly || "View Only"}
            </span>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export function PublicProjectCanvas(props: PublicProjectCanvasProps) {
  return (
    <ReactFlowProvider>
      <PublicProjectCanvasContent {...props} />
    </ReactFlowProvider>
  );
}
