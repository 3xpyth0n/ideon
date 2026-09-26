import type { Edge, Node } from "@xyflow/react";
import * as Y from "yjs";
import { z } from "zod";

export interface SerializedXmlText {
  kind: "text";
  delta: Array<{
    insert: unknown;
    attributes?: Record<string, unknown>;
  }>;
}

export interface SerializedXmlElement {
  kind: "element";
  name: string;
  attributes: Record<string, string>;
  children: SerializedXmlNode[];
}

export type SerializedXmlNode = SerializedXmlText | SerializedXmlElement;

export interface CanvasStateSnapshot {
  canvasId: string;
  blocks: Node<Record<string, unknown>>[];
  links: Edge[];
  contents: Record<string, string>;
  noteDocuments: Record<string, SerializedXmlNode[]>;
  viewport?: { x: number; y: number; zoom: number };
}

const serializedXmlNodeSchema: z.ZodType<SerializedXmlNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("text"),
      delta: z.array(
        z.object({
          insert: z.unknown(),
          attributes: z.record(z.string(), z.unknown()).optional(),
        }),
      ),
    }),
    z.object({
      kind: z.literal("element"),
      name: z.string().min(1).max(100),
      attributes: z.record(z.string(), z.string()),
      children: z.array(serializedXmlNodeSchema),
    }),
  ]),
);

const canvasStateSnapshotSchema = z.object({
  canvasId: z.string().min(1).max(100),
  blocks: z.array(
    z
      .object({
        id: z.string().min(1).max(100),
        type: z.string().optional(),
        position: z.object({ x: z.number(), y: z.number() }),
        width: z.number().optional(),
        height: z.number().optional(),
        selected: z.boolean().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough(),
  ),
  links: z.array(
    z
      .object({
        id: z.string().min(1).max(100),
        source: z.string().min(1).max(100),
        target: z.string().min(1).max(100),
      })
      .passthrough(),
  ),
  contents: z.record(z.string(), z.string()),
  noteDocuments: z.record(z.string(), z.array(serializedXmlNodeSchema)),
  viewport: z
    .object({ x: z.number(), y: z.number(), zoom: z.number().positive() })
    .optional(),
});

export const canvasStateSnapshotsSchema = z.array(canvasStateSnapshotSchema);

export function parseCanvasStateSnapshots(
  value: unknown,
): CanvasStateSnapshot[] {
  return canvasStateSnapshotsSchema.parse(value) as CanvasStateSnapshot[];
}

export function remapCanvasStateSnapshots(
  snapshots: CanvasStateSnapshot[],
  blockIdMap: Map<string, string>,
  linkIdMap: Map<string, string>,
  transformBlock?: (
    block: Node<Record<string, unknown>>,
  ) => Node<Record<string, unknown>>,
): CanvasStateSnapshot[] {
  const remapBlockId = (id: string) => {
    const mapped = blockIdMap.get(id);
    if (!mapped) throw new Error(`Missing imported block id ${id}`);
    return mapped;
  };

  return snapshots.map((snapshot) => ({
    ...snapshot,
    canvasId:
      snapshot.canvasId === "root" ? "root" : remapBlockId(snapshot.canvasId),
    blocks: snapshot.blocks.map((block) => {
      const remappedBlock = { ...block, id: remapBlockId(block.id) };
      return transformBlock ? transformBlock(remappedBlock) : remappedBlock;
    }),
    links: snapshot.links.map((link) => {
      const linkId = linkIdMap.get(link.id);
      if (!linkId) throw new Error(`Missing imported link id ${link.id}`);
      return {
        ...link,
        id: linkId,
        source: remapBlockId(link.source),
        target: remapBlockId(link.target),
      };
    }),
    contents: Object.fromEntries(
      Object.entries(snapshot.contents).map(([blockId, content]) => [
        remapBlockId(blockId),
        content,
      ]),
    ),
    noteDocuments: Object.fromEntries(
      Object.entries(snapshot.noteDocuments).map(([blockId, document]) => [
        remapBlockId(blockId),
        document,
      ]),
    ),
  }));
}

function mapName(baseName: string, canvasId: string): string {
  return canvasId === "root" ? baseName : `${baseName}:${canvasId}`;
}

function readNodeContent(
  contents: Y.Map<Y.Text>,
  node: Node<Record<string, unknown>>,
): string {
  const value = contents.get(node.id);
  if (value instanceof Y.Text) return value.toString();
  return typeof node.data?.content === "string" ? node.data.content : "";
}

function serializeXmlChildren(
  parent: Y.XmlFragment | Y.XmlElement,
): SerializedXmlNode[] {
  const result: SerializedXmlNode[] = [];

  for (let index = 0; index < parent.length; index += 1) {
    const child = parent.get(index);
    if (child instanceof Y.XmlText) {
      const delta = child.toDelta() as Array<{
        insert: unknown;
        attributes?: Record<string, unknown>;
      }>;
      result.push({
        kind: "text",
        delta: delta.map((operation) => ({
          insert: operation.insert,
          ...(operation.attributes && { attributes: operation.attributes }),
        })),
      });
      continue;
    }

    if (child instanceof Y.XmlElement) {
      result.push({
        kind: "element",
        name: child.nodeName,
        attributes: Object.fromEntries(
          Object.entries(child.getAttributes()).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ),
        children: serializeXmlChildren(child),
      });
      continue;
    }

    throw new Error("Unsupported Yjs XML child type");
  }

  return result;
}

function serializeCanvas(
  doc: Y.Doc,
  canvasId: string,
  overrides?: { blocks: Node<Record<string, unknown>>[]; links: Edge[] },
): CanvasStateSnapshot {
  const blocks = doc.getMap<Node<Record<string, unknown>>>(
    mapName("blocks", canvasId),
  );
  const links = doc.getMap<Edge>(mapName("links", canvasId));
  const contents = doc.getMap<Y.Text>(mapName("contents", canvasId));
  const noteDocuments = doc.getMap<Y.XmlFragment>(
    mapName("noteDocuments", canvasId),
  );
  const blockValues = overrides?.blocks ?? Array.from(blocks.values());
  const contentValues: Record<string, string> = {};
  const noteDocumentValues: Record<string, SerializedXmlNode[]> = {};

  for (const [blockId, value] of contents.entries()) {
    contentValues[blockId] =
      value instanceof Y.Text ? value.toString() : String(value ?? "");
  }

  for (const [blockId, value] of noteDocuments.entries()) {
    if (!(value instanceof Y.XmlFragment)) {
      throw new Error(`Invalid note document for block ${blockId}`);
    }
    noteDocumentValues[blockId] = serializeXmlChildren(value);
  }

  const serializedBlocks = blockValues.map((node) => ({
    ...node,
    data: {
      ...node.data,
      content: overrides
        ? (node.data?.content as string | undefined) ?? ""
        : readNodeContent(contents, node),
    },
  }));
  const viewport = doc
    .getMap<{ x: number; y: number; zoom: number }>("viewports")
    .get(canvasId);

  return {
    canvasId,
    blocks: serializedBlocks,
    links: overrides?.links ?? Array.from(links.values()),
    contents: contentValues,
    noteDocuments: noteDocumentValues,
    ...(viewport && { viewport }),
  };
}

export function captureCanvasStateSnapshots(
  doc: Y.Doc,
  activeCanvasOverride?: {
    canvasId: string;
    blocks: Node<Record<string, unknown>>[];
    links: Edge[];
  },
): CanvasStateSnapshot[] {
  const snapshots: CanvasStateSnapshot[] = [];
  const visited = new Set<string>();

  const visit = (canvasId: string) => {
    if (visited.has(canvasId)) return;
    visited.add(canvasId);

    const overrides =
      activeCanvasOverride?.canvasId === canvasId
        ? activeCanvasOverride
        : undefined;
    const snapshot = serializeCanvas(doc, canvasId, overrides);
    snapshots.push(snapshot);

    for (const block of snapshot.blocks) {
      if (block.type === "subcanvas" || block.data?.blockType === "subcanvas") {
        visit(block.id);
      }
    }
  };

  visit("root");
  return snapshots;
}

function createXmlNode(node: SerializedXmlNode): Y.XmlElement | Y.XmlText {
  if (node.kind === "text") {
    const text = new Y.XmlText();
    for (const operation of node.delta) {
      if (typeof operation.insert === "string") {
        text.insert(text.length, operation.insert, operation.attributes);
      } else if (
        operation.insert !== null &&
        typeof operation.insert === "object"
      ) {
        text.insertEmbed(text.length, operation.insert, operation.attributes);
      } else {
        throw new Error("Unsupported Yjs XML text operation");
      }
    }
    return text;
  }

  const element = new Y.XmlElement(node.name);
  for (const [key, value] of Object.entries(node.attributes)) {
    element.setAttribute(key, value);
  }
  const children = node.children.map(createXmlNode);
  if (children.length > 0) element.insert(0, children);
  return element;
}

function collectCanvasIds(doc: Y.Doc): Set<string> {
  const canvasIds = new Set<string>();

  const visit = (canvasId: string) => {
    if (canvasIds.has(canvasId)) return;
    canvasIds.add(canvasId);
    const blocks = doc.getMap<Node<Record<string, unknown>>>(
      mapName("blocks", canvasId),
    );
    blocks.forEach((block) => {
      if (block.type === "subcanvas" || block.data?.blockType === "subcanvas") {
        visit(block.id);
      }
    });
  };

  visit("root");
  return canvasIds;
}

export function restoreCanvasStateSnapshots(
  doc: Y.Doc,
  snapshots: CanvasStateSnapshot[],
): void {
  const statesById = new Map(
    snapshots.map((snapshot) => [snapshot.canvasId, snapshot]),
  );
  const rootState = statesById.get("root");
  if (!rootState || statesById.size !== snapshots.length) {
    throw new Error("Canvas snapshot must contain one unique root state");
  }

  const reachable = new Set<string>();
  const visit = (canvasId: string, depth: number) => {
    if (depth > 5) throw new Error("Canvas snapshot exceeds nesting limit");
    if (reachable.has(canvasId)) return;
    const state = statesById.get(canvasId);
    if (!state) throw new Error(`Missing canvas snapshot ${canvasId}`);
    reachable.add(canvasId);
    for (const block of state.blocks) {
      if (block.type === "subcanvas" || block.data?.blockType === "subcanvas") {
        visit(block.id, depth + 1);
      }
    }
  };

  visit("root", 0);
  if (reachable.size !== statesById.size) {
    throw new Error("Canvas snapshot contains an unreferenced canvas");
  }

  const canvasIds = new Set([...collectCanvasIds(doc), ...statesById.keys()]);
  doc.transact(() => {
    const viewports = doc.getMap<{ x: number; y: number; zoom: number }>(
      "viewports",
    );
    viewports.clear();

    for (const canvasId of canvasIds) {
      doc.getMap(mapName("blocks", canvasId)).clear();
      doc.getMap(mapName("links", canvasId)).clear();
      doc.getMap(mapName("contents", canvasId)).clear();
      doc.getMap(mapName("noteDocuments", canvasId)).clear();
    }

    for (const snapshot of snapshots) {
      const blocks = doc.getMap<Node<Record<string, unknown>>>(
        mapName("blocks", snapshot.canvasId),
      );
      const links = doc.getMap<Edge>(mapName("links", snapshot.canvasId));
      const contents = doc.getMap<Y.Text>(
        mapName("contents", snapshot.canvasId),
      );
      const noteDocuments = doc.getMap<Y.XmlFragment>(
        mapName("noteDocuments", snapshot.canvasId),
      );

      snapshot.blocks.forEach((block) => blocks.set(block.id, block));
      snapshot.links.forEach((link) => links.set(link.id, link));
      Object.entries(snapshot.contents).forEach(([blockId, content]) => {
        const text = new Y.Text();
        if (content) text.insert(0, content);
        contents.set(blockId, text);
      });
      Object.entries(snapshot.noteDocuments).forEach(([blockId, nodes]) => {
        const fragment = new Y.XmlFragment();
        noteDocuments.set(blockId, fragment);
        const children = nodes.map(createXmlNode);
        if (children.length > 0) fragment.insert(0, children);
      });
      if (snapshot.viewport) {
        viewports.set(snapshot.canvasId, snapshot.viewport);
      }
    }
  });
}
