import { randomUUID } from "node:crypto";
import type { Node } from "@xyflow/react";
import * as Y from "yjs";
import type { CanvasStateSnapshot } from "../yjs-canvas-state";
import {
  remapCanvasStateSnapshots,
  restoreCanvasStateSnapshots,
} from "../yjs-canvas-state";
import { getMarkdownFromXmlFragment } from "../../app/components/project/noteMarkdown";
import { withEditorDom } from "./editor-dom";
import {
  RepositorySyncFormatError,
  createRepositorySyncBundle,
  type RepositorySyncManifestDraft,
} from "./manifest";
import { remapMetadataBlockIds } from "./metadata-ids";

export interface RepositorySyncBlockRecord {
  id: string;
  blockType: string;
  metadata: string;
  parentBlockId: string | null;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  content: string | null;
  data: string;
}

export interface RepositorySyncLinkRecord {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  animated: number | null;
  type: string | null;
  label: string | null;
  sourceX: number | null;
  sourceY: number | null;
  targetX: number | null;
  targetY: number | null;
  sourceOrientation: string | null;
  targetOrientation: string | null;
  data: string | null;
}

export interface RepositorySyncProjectInput {
  project: { id: string; name: string; description: string | null };
  blocks: readonly RepositorySyncBlockRecord[];
  links: readonly RepositorySyncLinkRecord[];
  snapshots: readonly CanvasStateSnapshot[];
  blockIdMap: Readonly<Record<string, string>>;
  linkIdMap: Readonly<Record<string, string>>;
  assets?: Readonly<Record<string, Uint8Array>>;
}

export interface RepositorySyncProjectOutput {
  bundle: Record<string, Uint8Array>;
  blockIdMap: Record<string, string>;
  linkIdMap: Record<string, string>;
}

function parseRecord(
  value: string | null | undefined,
): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function mapStableIds(
  externalToLocal: Readonly<Record<string, string>>,
  localIds: ReadonlySet<string>,
): { localToExternal: Map<string, string>; updated: Record<string, string> } {
  const updated = { ...externalToLocal };
  const localToExternal = new Map<string, string>();

  for (const [externalId, localId] of Object.entries(updated)) {
    if (localToExternal.has(localId)) {
      throw new RepositorySyncFormatError("invalid_reference");
    }
    localToExternal.set(localId, externalId);
  }

  for (const localId of localIds) {
    if (localToExternal.has(localId)) continue;

    let externalId = localId;
    if (Object.hasOwn(updated, externalId)) {
      externalId = randomUUID();
    }
    updated[externalId] = localId;
    localToExternal.set(localId, externalId);
  }

  return { localToExternal, updated };
}

function getNoteMarkdown(
  doc: Y.Doc | null,
  canvasId: string,
  blockId: string,
  fallback: string,
): string {
  if (doc) {
    const mapName =
      canvasId === "root" ? "noteDocuments" : `noteDocuments:${canvasId}`;
    const fragment = doc.getMap<Y.XmlFragment>(mapName).get(blockId);
    if (fragment instanceof Y.XmlFragment) {
      return withEditorDom(() => getMarkdownFromXmlFragment(fragment));
    }
  }
  return fallback;
}

function cleanBlockData(
  node: Node<Record<string, unknown>>,
  localToExternal: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const data = { ...(node.data ?? {}) };
  for (const field of [
    "ownerId",
    "authorName",
    "authorColor",
    "updatedAt",
    "isSummary",
  ]) {
    delete data[field];
  }
  if ("content" in data) delete data.content;
  if ("metadata" in data) {
    data.metadata = remapMetadataBlockIds(
      typeof data.blockType === "string" ? data.blockType : node.type ?? "text",
      data.metadata,
      localToExternal,
    );
  }
  return data;
}

export function serializeRepositorySyncProject(
  input: RepositorySyncProjectInput,
): RepositorySyncProjectOutput {
  const blockRows = new Map(input.blocks.map((block) => [block.id, block]));
  const linkRows = new Map(input.links.map((link) => [link.id, link]));
  const localBlockIds = new Set(input.blocks.map((block) => block.id));
  const localLinkIds = new Set(input.links.map((link) => link.id));

  for (const snapshot of input.snapshots) {
    for (const block of snapshot.blocks) localBlockIds.add(block.id);
    for (const link of snapshot.links) localLinkIds.add(link.id);
  }

  const blockIds = mapStableIds(input.blockIdMap, localBlockIds);
  const linkIds = mapStableIds(input.linkIdMap, localLinkIds);
  const doc = input.snapshots.length > 0 ? new Y.Doc() : null;
  if (doc) restoreCanvasStateSnapshots(doc, [...input.snapshots]);

  try {
    const blocks: RepositorySyncManifestDraft["blocks"] = [];
    const links: RepositorySyncManifestDraft["links"] = [];
    const files: Parameters<typeof createRepositorySyncBundle>[1][number][] =
      [];

    for (const snapshot of input.snapshots) {
      for (const node of snapshot.blocks) {
        const stableId = blockIds.localToExternal.get(node.id);
        if (!stableId) throw new Error("Missing repository block identity");
        const row = blockRows.get(node.id);
        const data = node.data ?? {};
        const blockType =
          typeof data.blockType === "string"
            ? data.blockType
            : node.type || row?.blockType || "text";
        const content =
          snapshot.contents[node.id] ??
          (typeof data.content === "string" ? data.content : row?.content) ??
          "";
        const externalizedContent =
          blockType === "text" || blockType === "mermaid";
        const contentPath = externalizedContent
          ? `${blockType === "mermaid" ? "diagrams" : "notes"}/${stableId}.${
              blockType === "mermaid" ? "mmd" : "md"
            }`
          : null;
        const blockData = {
          metadata:
            typeof data.metadata === "string"
              ? (remapMetadataBlockIds(
                  blockType,
                  data.metadata,
                  blockIds.localToExternal,
                ) as string)
              : JSON.stringify(
                  remapMetadataBlockIds(
                    blockType,
                    data.metadata ?? parseRecord(row?.metadata),
                    blockIds.localToExternal,
                  ),
                ),
          content: externalizedContent ? null : content,
          data: cleanBlockData(node, blockIds.localToExternal),
        };
        const dataPath = `blocks/${stableId}.json`;
        const markdown =
          blockType === "text"
            ? getNoteMarkdown(doc, snapshot.canvasId, node.id, content)
            : content;

        blocks.push({
          id: stableId,
          canvasId:
            snapshot.canvasId === "root"
              ? "root"
              : blockIds.localToExternal.get(snapshot.canvasId) ??
                snapshot.canvasId,
          blockType,
          parentBlockId: row?.parentBlockId
            ? blockIds.localToExternal.get(row.parentBlockId) ??
              row.parentBlockId
            : null,
          position: {
            x: node.position?.x ?? row?.positionX ?? 0,
            y: node.position?.y ?? row?.positionY ?? 0,
          },
          dimensions: {
            width: node.width ?? row?.width ?? null,
            height: node.height ?? row?.height ?? null,
          },
          dataPath,
          contentPath,
          noteDocumentPath: null,
        });
        files.push({
          path: dataPath,
          kind: "block-data",
          content: new TextEncoder().encode(JSON.stringify(blockData, null, 2)),
        });
        if (contentPath) {
          files.push({
            path: contentPath,
            kind: blockType === "mermaid" ? "diagram" : "note",
            content: new TextEncoder().encode(markdown),
          });
        }
      }

      for (const edge of snapshot.links) {
        const stableId = linkIds.localToExternal.get(edge.id);
        const source = blockIds.localToExternal.get(edge.source);
        const target = blockIds.localToExternal.get(edge.target);
        if (!stableId || !source || !target) {
          throw new Error("Missing repository link identity");
        }

        const row = linkRows.get(edge.id);
        const dataPath = `links/${stableId}.json`;
        const linkData = {
          sourceHandle: edge.sourceHandle ?? row?.sourceHandle ?? null,
          targetHandle: edge.targetHandle ?? row?.targetHandle ?? null,
          animated: Boolean(edge.animated ?? row?.animated),
          type: edge.type ?? row?.type ?? null,
          label:
            typeof edge.data?.label === "string"
              ? edge.data.label
              : row?.label ?? null,
          data: edge.data ?? parseRecord(row?.data),
          sourceX: row?.sourceX ?? null,
          sourceY: row?.sourceY ?? null,
          targetX: row?.targetX ?? null,
          targetY: row?.targetY ?? null,
          sourceOrientation: row?.sourceOrientation ?? null,
          targetOrientation: row?.targetOrientation ?? null,
        };
        links.push({
          id: stableId,
          canvasId:
            snapshot.canvasId === "root"
              ? "root"
              : blockIds.localToExternal.get(snapshot.canvasId) ??
                snapshot.canvasId,
          source,
          target,
          dataPath,
        });
        files.push({
          path: dataPath,
          kind: "link-data",
          content: new TextEncoder().encode(JSON.stringify(linkData, null, 2)),
        });
      }
    }

    const stableSnapshots = remapCanvasStateSnapshots(
      [...input.snapshots],
      blockIds.localToExternal,
      linkIds.localToExternal,
      (node) => ({
        ...node,
        data: {
          ...node.data,
          ...(node.data?.metadata !== undefined && {
            metadata: remapMetadataBlockIds(
              typeof node.data.blockType === "string"
                ? node.data.blockType
                : node.type ?? "text",
              node.data.metadata,
              blockIds.localToExternal,
            ),
          }),
        },
      }),
    );
    const canvasStatesPath = "canvases/state.json";
    files.push({
      path: canvasStatesPath,
      kind: "canvas-state",
      content: new TextEncoder().encode(
        JSON.stringify(stableSnapshots, null, 2),
      ),
    });

    for (const [name, content] of Object.entries(input.assets ?? {})) {
      files.push({ path: `assets/${name}`, kind: "asset", content });
    }

    const manifest: RepositorySyncManifestDraft = {
      format: "ideon-repository",
      version: 1,
      project: input.project,
      blocks,
      links,
      canvasStatesPath,
    };

    return {
      bundle: createRepositorySyncBundle(manifest, files),
      blockIdMap: blockIds.updated,
      linkIdMap: linkIds.updated,
    };
  } finally {
    doc?.destroy();
  }
}
