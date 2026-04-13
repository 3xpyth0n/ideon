"use client";

import { type Node, useNodes, useReactFlow } from "@xyflow/react";
import { useI18n } from "@providers/I18nProvider";
import { useCallback, useMemo } from "react";
import { getDomain } from "@lib/utils";
import { BlockData } from "./CanvasBlock";
import { getTaskTitle, parseKanbanMetadata } from "./kanbanModel";
import { getBlockTypeMeta, type BlockTypeIconComponent } from "./blockTypeMeta";
import { focusProjectCanvas } from "./utils/focusCanvas";
import {
  computeLongestSideViewport,
  getNodesBoundsWithFallback,
  getReactFlowViewportSize,
} from "./utils/fitViewport";

type Dict = ReturnType<typeof useI18n>["dict"];

export type BlockSearchResult = {
  kind: "block";
  id: string;
  icon: BlockTypeIconComponent;
  title: string;
  subtitle: string;
  searchText: string;
};

export type TaskSearchResult = {
  kind: "task";
  id: string;
  blockId: string;
  taskId: string;
  taskIdLabel: string;
  title: string;
  boardTitle: string;
  searchText: string;
};

export type BlockSearchGroup = {
  key: string;
  heading: string;
  items: BlockSearchResult[];
};

const FIT_DURATION = 800;
const FIT_PADDING = 0.12;
const FIT_MIN_ZOOM = 0.1;
const FIT_MAX_ZOOM_SELECTED = 2;

function readMetadataTitle(metadata: unknown): string {
  if (!metadata) return "";
  if (typeof metadata === "object") {
    const record = metadata as Record<string, unknown>;
    return typeof record.title === "string" ? record.title.trim() : "";
  }
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as Record<string, unknown>;
      return typeof parsed.title === "string" ? parsed.title.trim() : "";
    } catch {
      return "";
    }
  }
  return "";
}

function getBlockTypeLabel(dict: Dict, blockType: string | undefined) {
  const { labelKey } = getBlockTypeMeta(blockType);
  return dict.blocks[labelKey];
}

function getBlockTitle(node: Node<BlockData>, dict: Dict): string {
  const typedData = node.data as BlockData | undefined;
  const explicitTitle = typedData?.title?.trim();
  if (explicitTitle) return explicitTitle;

  if (typedData?.blockType === "link") {
    const metadataTitle = readMetadataTitle(typedData.metadata);
    if (metadataTitle) return metadataTitle;

    const content =
      typeof typedData.content === "string" ? typedData.content : "";
    const domain = content ? getDomain(content).replace(/^www\./i, "") : "";
    if (domain) return domain;
    if (content.trim()) return content.trim();
  }

  return getBlockTypeLabel(dict, typedData?.blockType || node.type);
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function HighlightedText({
  text,
  highlight,
}: {
  text: string;
  highlight: string;
}) {
  if (!text) return null;
  const normalizedHighlight = highlight.trim();
  if (!normalizedHighlight) return <>{text}</>;

  const escapedHighlight = escapeRegExp(normalizedHighlight);
  const parts = text.split(new RegExp(`(${escapedHighlight})`, "gi"));

  return (
    <span>
      {parts.map((part, index) =>
        part.toLowerCase() === normalizedHighlight.toLowerCase() ? (
          <span key={`${part}-${index}`} className="canvas-search-highlight">
            {part}
          </span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </span>
  );
}

export function useCanvasSearch(query: string) {
  const { dict } = useI18n();
  const nodes = useNodes<Node<BlockData>>();
  const { getNode, fitView, setViewport, setNodes } =
    useReactFlow<Node<BlockData>>();

  const blockResults = useMemo(() => {
    return nodes.map((node) => {
      const resolvedType = node.data?.blockType || node.type;
      const { icon } = getBlockTypeMeta(resolvedType);
      const title = getBlockTitle(node, dict);
      const subtitle = getBlockTypeLabel(dict, resolvedType);

      return {
        kind: "block",
        id: node.id,
        icon,
        title,
        subtitle,
        searchText: `${title} ${subtitle} ${node.id}`.toLowerCase(),
      } satisfies BlockSearchResult;
    });
  }, [dict, nodes]);

  const taskResults = useMemo(() => {
    const results: TaskSearchResult[] = [];

    for (const node of nodes) {
      if (node.data?.blockType !== "kanban") continue;

      const parsed = parseKanbanMetadata(node.data.metadata);
      const boardTitle = node.data.title?.trim() || dict.blocks.blockTypeKanban;

      for (const column of parsed.columns) {
        for (const task of column.tasks) {
          const title = getTaskTitle(task.text) || dict.blocks.taskPlaceholder;
          const taskIdLabel =
            typeof task.taskNumber === "number" && task.taskNumber > 0
              ? `#${task.taskNumber}`
              : task.id.slice(0, 8);

          results.push({
            kind: "task",
            id: `${node.id}:${task.id}`,
            blockId: node.id,
            taskId: task.id,
            taskIdLabel,
            title,
            boardTitle,
            searchText: `${title} ${boardTitle} ${task.taskNumber || ""} ${
              task.id
            }`.toLowerCase(),
          });
        }
      }
    }

    return results;
  }, [dict.blocks.blockTypeKanban, dict.blocks.taskPlaceholder, nodes]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredBlocks = useMemo(() => {
    if (!normalizedQuery) return blockResults;
    return blockResults.filter((entry) =>
      entry.searchText.includes(normalizedQuery),
    );
  }, [blockResults, normalizedQuery]);

  const filteredTasks = useMemo(() => {
    if (!normalizedQuery) return taskResults;
    return taskResults.filter((entry) =>
      entry.searchText.includes(normalizedQuery),
    );
  }, [normalizedQuery, taskResults]);

  const blockGroups = useMemo(() => {
    const groups = new Map<string, BlockSearchResult[]>();

    for (const entry of filteredBlocks) {
      const group = groups.get(entry.subtitle);
      if (group) group.push(entry);
      else groups.set(entry.subtitle, [entry]);
    }

    return Array.from(groups.entries()).map(([heading, items]) => ({
      key: heading,
      heading,
      items,
    })) satisfies BlockSearchGroup[];
  }, [filteredBlocks]);

  const focusTargetNode = useCallback(
    (targetNode: Node<BlockData>) => {
      const bounds = getNodesBoundsWithFallback([targetNode]);
      const viewportSize = getReactFlowViewportSize();

      if (!bounds || !viewportSize) {
        void fitView({
          nodes: [targetNode],
          duration: FIT_DURATION,
          maxZoom: FIT_MAX_ZOOM_SELECTED,
          padding: FIT_PADDING,
        });
        return;
      }

      const nextViewport = computeLongestSideViewport(bounds, viewportSize, {
        padding: FIT_PADDING,
        minZoom: FIT_MIN_ZOOM,
        maxZoom: FIT_MAX_ZOOM_SELECTED,
      });

      void setViewport(nextViewport, { duration: FIT_DURATION });
    },
    [fitView, setViewport],
  );

  const selectBlock = useCallback(
    (blockId: string, afterSelect?: () => void) => {
      const targetNode = getNode(blockId);
      if (!targetNode) return;

      setNodes((currentNodes) =>
        currentNodes.map((node) => ({
          ...node,
          selected: node.id === blockId,
        })),
      );

      focusTargetNode(targetNode);
      focusProjectCanvas();
      afterSelect?.();
    },
    [focusTargetNode, getNode, setNodes],
  );

  const selectTask = useCallback(
    (entry: TaskSearchResult, afterSelect?: () => void) => {
      const targetNode = getNode(entry.blockId);

      if (targetNode) {
        setNodes((currentNodes) =>
          currentNodes.map((node) => ({
            ...node,
            selected: node.id === entry.blockId,
          })),
        );

        focusTargetNode(targetNode);
      }

      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("ideon:highlight-kanban-task", {
            detail: { blockId: entry.blockId, taskId: entry.taskId },
          }),
        );
        focusProjectCanvas();
      }, FIT_DURATION - 120);

      afterSelect?.();
    },
    [focusTargetNode, getNode, setNodes],
  );

  return {
    blockGroups,
    filteredBlocks,
    filteredTasks,
    normalizedQuery,
    hasResults: blockGroups.length > 0 || filteredTasks.length > 0,
    selectBlock,
    selectTask,
  };
}
