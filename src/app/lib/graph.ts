import { Node, Edge } from "@xyflow/react";
import { Selectable } from "kysely";
import { blocksTable } from "./types/db";
import { z } from "zod";
import {
  CORE_BLOCK_X,
  CORE_BLOCK_Y,
} from "../components/project/utils/constants";

export interface GraphState {
  blocks: Node[];
  links: Edge[];
}

export interface Mutation {
  type: string;
  payload: {
    id?: string;
    blockId?: string;
    content?: string;
    dimensions?: { width: number; height: number };
    position?: { x: number; y: number };
    pos?: { x: number; y: number };
    [key: string]: unknown;
  };
}

export interface DbBlock extends Selectable<blocksTable> {
  authorName?: string | null;
  authorColor?: string | null;
}

// Zod schemas for type-safe validation and transformation
const BlockDataSchema = z
  .object({
    content: z.string().optional(),
    ownerId: z.string().optional(),
    blockType: z
      .enum([
        "text",
        "link",
        "file",
        "github",
        "core",
        "palette",
        "contact",
        "video",
        "snippet",
        "checklist",
      ])
      .optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();

const NodeSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  selected: z.boolean().optional(),
  data: z.union([BlockDataSchema, z.record(z.unknown())]).optional(),
});

export function transformBlock(block: DbBlock): Node {
  const data = (
    typeof block.data === "string" ? JSON.parse(block.data) : block.data
  ) as Record<string, unknown>;

  const metadata = (
    typeof block.metadata === "string"
      ? JSON.parse(block.metadata)
      : block.metadata
  ) as Record<string, unknown>;

  const isCore = block.blockType === "core";

  return {
    id: block.id,
    type: block.blockType,
    position: isCore
      ? { x: CORE_BLOCK_X, y: CORE_BLOCK_Y }
      : { x: block.positionX, y: block.positionY },
    width: block.width ?? undefined,
    height: block.height ?? undefined,
    selected: Boolean(block.selected),
    draggable: !isCore,
    deletable: !isCore,
    data: {
      ...data,
      blockType: block.blockType,
      content: block.content,
      ownerId: block.ownerId,
      authorName: block.authorName,
      authorColor: block.authorColor,
      updatedAt: block.updatedAt,
      metadata: metadata,
    },
  };
}

/**
 * Prepares a React Flow node for database insertion as a Block.
 */
export function prepareBlockForDb(
  node: Node,
  projectId: string,
  ownerId: string,
) {
  const parsedNode = NodeSchema.parse(node);
  const data = (parsedNode.data || {}) as z.infer<typeof BlockDataSchema>;

  const blockType =
    data.blockType ||
    (parsedNode.type as
      | "text"
      | "link"
      | "file"
      | "core"
      | "github"
      | "palette"
      | "contact"
      | "video"
      | "snippet"
      | "checklist"
      | "sketch") ||
    "text";

  return {
    id: parsedNode.id,
    projectId,
    blockType,
    positionX: parsedNode.position?.x ?? 0,
    positionY: parsedNode.position?.y ?? 0,
    width: parsedNode.width || 200,
    height: parsedNode.height || 100,
    selected: parsedNode.selected ? 1 : 0,
    content: data.content || "",
    data: JSON.stringify(parsedNode.data || {}),
    ownerId: data.ownerId || ownerId,
    updatedAt: new Date().toISOString(),
    metadata: data.metadata ? JSON.stringify(data.metadata) : "{}",
  };
}

/**
 * Transforms database link rows to React Flow edge objects.
 */
export function transformLink(dbLink: Record<string, unknown>): Edge {
  const link = dbLink as {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    animated?: number | boolean;
    type?: string;
    data?: string | Record<string, unknown>;
    markerEnd?: string;
  };

  const data =
    typeof link.data === "string" ? JSON.parse(link.data) : link.data || {};

  return {
    id: link.id,
    source: link.source,
    target: link.target,
    sourceHandle: link.sourceHandle,
    targetHandle: link.targetHandle,
    type: link.type || "connection",
    animated: Boolean(link.animated),
    markerEnd: link.markerEnd || "connection-arrow",
    data,
  };
}

/**
 * Prepares a React Flow edge for database insertion.
 */
export function prepareLinkForDb(link: Edge, projectId: string) {
  return {
    id: link.id,
    projectId,
    source: link.source,
    target: link.target,
    sourceHandle: link.sourceHandle,
    targetHandle: link.targetHandle,
    animated: link.animated ? 1 : 0,
    type: link.type || "connection",
    data: JSON.stringify(link.data || {}),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Applies a graph mutation to a state object.
 * Used for both realtime updates and temporal history reconstruction.
 */
export function applyGraphMutation(
  state: GraphState,
  mutation: Mutation,
): GraphState {
  const { blocks, links } = state;
  const { type, payload } = mutation;

  switch (type) {
    case "blockDrag":
    case "blockMove":
    case "blockResize":
    case "blockContent":
      return {
        ...state,
        blocks: blocks.map((n) => {
          if (n.id !== (payload.blockId || payload.id)) return n;
          if (type === "blockContent")
            return { ...n, data: { ...n.data, content: payload.content } };

          const isCore = n.type === "core";

          if (type === "blockResize")
            return {
              ...n,
              ...payload.dimensions,
              position: isCore
                ? { x: CORE_BLOCK_X, y: CORE_BLOCK_Y }
                : payload.position || n.position,
            };
          return {
            ...n,
            position: isCore
              ? { x: CORE_BLOCK_X, y: CORE_BLOCK_Y }
              : payload.position || payload.pos || n.position,
          };
        }),
      };

    case "blockDelete":
      return {
        ...state,
        blocks: blocks.filter((n) => n.id !== payload.id),
        links: links.filter(
          (l) => l.source !== payload.id && l.target !== payload.id,
        ),
      };

    case "edgeCreate":
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { ...state, links: [...links, payload as any] };

    case "edgeDelete":
      return { ...state, links: links.filter((l) => l.id !== payload.id) };

    case "graphSnapshot":
      return {
        blocks: (payload.blocks as Node[]) || blocks,
        links: (payload.links as Edge[]) || links,
      };

    default:
      return state;
  }
}
