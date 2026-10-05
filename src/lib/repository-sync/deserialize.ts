import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import { z } from "zod";
import { VALID_BLOCK_TYPES } from "../mcp/tools/blocks";
import {
  captureCanvasStateSnapshots,
  parseCanvasStateSnapshots,
  remapCanvasStateSnapshots,
  restoreCanvasStateSnapshots,
  type CanvasStateSnapshot,
} from "../yjs-canvas-state";
import {
  getMarkdownFromXmlFragment,
  syncMarkdownToXmlFragment,
} from "../../app/components/project/noteMarkdown";
import { withEditorDom } from "./editor-dom";
import {
  parseRepositorySyncBundle,
  RepositorySyncFormatError,
  type RepositorySyncManifest,
} from "./manifest";
import { remapMetadataBlockIds } from "./metadata-ids";

const blockPayloadSchema = z
  .object({
    metadata: z.string().max(10 * 1024 * 1024),
    content: z.string().nullable(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

const linkPayloadSchema = z
  .object({
    sourceHandle: z.string().nullable(),
    targetHandle: z.string().nullable(),
    animated: z.boolean(),
    type: z.string().nullable(),
    label: z.string().nullable(),
    data: z.record(z.string(), z.unknown()),
    sourceX: z.number().finite().nullable(),
    sourceY: z.number().finite().nullable(),
    targetX: z.number().finite().nullable(),
    targetY: z.number().finite().nullable(),
    sourceOrientation: z.string().nullable(),
    targetOrientation: z.string().nullable(),
  })
  .strict();

const blockTypeSchema = z.enum(VALID_BLOCK_TYPES);

function parseBlockType(value: string): RepositorySyncBlockRow["blockType"] {
  try {
    return blockTypeSchema.parse(value);
  } catch {
    throw new RepositorySyncFormatError("invalid_manifest");
  }
}

export interface RepositorySyncBlockRow {
  id: string;
  blockType: z.infer<typeof blockTypeSchema>;
  metadata: string;
  parentBlockId: string | null;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  ownerId: string;
  content: string | null;
  data: string;
}

export interface RepositorySyncLinkRow {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  animated: number;
  type: string | null;
  label: string | null;
  sourceX: number | null;
  sourceY: number | null;
  targetX: number | null;
  targetY: number | null;
  sourceOrientation: string | null;
  targetOrientation: string | null;
  data: string;
}

export interface RepositorySyncImportPlan {
  project: RepositorySyncManifest["project"];
  blocks: RepositorySyncBlockRow[];
  links: RepositorySyncLinkRow[];
  snapshots: CanvasStateSnapshot[];
  blockIdMap: Record<string, string>;
  linkIdMap: Record<string, string>;
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RepositorySyncFormatError("invalid_manifest");
  }
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const metadata: unknown = JSON.parse(value);
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error("Invalid metadata");
    }
    return metadata as Record<string, unknown>;
  } catch {
    throw new RepositorySyncFormatError("invalid_manifest");
  }
}

function validateMetadataReferences(
  blockType: string,
  value: unknown,
  blockIds: ReadonlySet<string>,
): void {
  const serialized =
    typeof value === "string" ? value : JSON.stringify(value ?? {});
  const metadata = parseMetadata(serialized);
  const checkReferences = (references: unknown) => {
    if (!Array.isArray(references)) {
      throw new RepositorySyncFormatError("invalid_reference");
    }
    for (const id of references) {
      if (typeof id !== "string" || !blockIds.has(id)) {
        throw new RepositorySyncFormatError("invalid_reference");
      }
    }
  };

  if (blockType === "frame" && "childBlockIds" in metadata) {
    checkReferences(metadata.childBlockIds);
  }
  if (blockType !== "kanban" || !("columns" in metadata)) return;
  if (!Array.isArray(metadata.columns)) {
    throw new RepositorySyncFormatError("invalid_reference");
  }
  for (const column of metadata.columns) {
    if (!column || typeof column !== "object" || Array.isArray(column)) {
      throw new RepositorySyncFormatError("invalid_reference");
    }
    const tasks = (column as Record<string, unknown>).tasks;
    if (!Array.isArray(tasks)) continue;
    for (const task of tasks) {
      if (!task || typeof task !== "object" || Array.isArray(task)) {
        throw new RepositorySyncFormatError("invalid_reference");
      }
      const linkedTasks = (task as Record<string, unknown>).linkedTasks;
      if (!Array.isArray(linkedTasks)) continue;
      for (const linkedTask of linkedTasks) {
        if (
          !linkedTask ||
          typeof linkedTask !== "object" ||
          Array.isArray(linkedTask)
        ) {
          throw new RepositorySyncFormatError("invalid_reference");
        }
        const blockId = (linkedTask as Record<string, unknown>).blockId;
        if (typeof blockId !== "string" || !blockIds.has(blockId)) {
          throw new RepositorySyncFormatError("invalid_reference");
        }
      }
    }
  }
}

function createIdentityMap(
  externalIds: readonly string[],
  previous: Readonly<Record<string, string>>,
): { externalToLocal: Map<string, string>; updated: Record<string, string> } {
  const updated = { ...previous };
  const localIds = new Set<string>();
  for (const localId of Object.values(updated)) {
    if (localIds.has(localId)) {
      throw new RepositorySyncFormatError("invalid_reference");
    }
    localIds.add(localId);
  }

  for (const externalId of externalIds) {
    if (updated[externalId]) continue;
    let localId = randomUUID();
    while (localIds.has(localId)) localId = randomUUID();
    updated[externalId] = localId;
    localIds.add(localId);
  }

  return { externalToLocal: new Map(Object.entries(updated)), updated };
}

function getRequiredFile(
  bundle: Readonly<Record<string, Uint8Array>>,
  path: string,
): Uint8Array {
  const file = bundle[`.ideon/${path}`];
  if (!file) throw new RepositorySyncFormatError("missing_file");
  return file;
}

function readBlockPayload(
  bundle: Readonly<Record<string, Uint8Array>>,
  block: RepositorySyncManifest["blocks"][number],
  externalToLocal: ReadonlyMap<string, string>,
  manifestBlockIds: ReadonlySet<string>,
) {
  const payload = blockPayloadSchema.safeParse(
    parseJson(getRequiredFile(bundle, block.dataPath)),
  );
  if (!payload.success) throw new RepositorySyncFormatError("invalid_manifest");

  validateMetadataReferences(
    block.blockType,
    payload.data.metadata,
    manifestBlockIds,
  );
  const metadata = remapMetadataBlockIds(
    block.blockType,
    payload.data.metadata,
    externalToLocal,
  );
  const parsedMetadata = parseMetadata(
    typeof metadata === "string" ? metadata : JSON.stringify(metadata),
  );
  const data = { ...payload.data.data };
  if ("metadata" in data) {
    validateMetadataReferences(
      block.blockType,
      data.metadata,
      manifestBlockIds,
    );
    data.metadata = remapMetadataBlockIds(
      block.blockType,
      data.metadata,
      externalToLocal,
    );
  }

  let content = payload.data.content;
  if (block.contentPath) {
    const file = getRequiredFile(bundle, block.contentPath);
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(file);
    } catch {
      throw new RepositorySyncFormatError("invalid_manifest");
    }
  }

  if (
    (block.blockType === "text" &&
      block.contentPath &&
      !block.contentPath.endsWith(".md")) ||
    (block.blockType === "mermaid" &&
      block.contentPath &&
      !block.contentPath.endsWith(".mmd"))
  ) {
    throw new RepositorySyncFormatError("invalid_reference");
  }

  data.blockType = block.blockType;
  data.content = content ?? "";
  data.metadata = parsedMetadata;

  return { content, metadata: parsedMetadata, data };
}

function createSnapshots(
  bundle: Readonly<Record<string, Uint8Array>>,
  manifest: RepositorySyncManifest,
  blockIdMap: Map<string, string>,
  linkIdMap: Map<string, string>,
  blockPayloads: ReadonlyMap<string, ReturnType<typeof readBlockPayload>>,
  linkPayloads: ReadonlyMap<string, z.infer<typeof linkPayloadSchema>>,
): CanvasStateSnapshot[] {
  const externalBlockIdByLocalId = new Map(
    [...blockIdMap].map(([externalId, localId]) => [localId, externalId]),
  );
  const externalLinkIdByLocalId = new Map(
    [...linkIdMap].map(([externalId, localId]) => [localId, externalId]),
  );
  let snapshots: CanvasStateSnapshot[];
  if (manifest.canvasStatesPath) {
    const parsed = parseCanvasStateSnapshots(
      parseJson(getRequiredFile(bundle, manifest.canvasStatesPath)),
    );
    const expectedBlocks = new Set(
      manifest.blocks.map((block) => `${block.canvasId}/${block.id}`),
    );
    const expectedLinks = new Set(
      manifest.links.map((link) => `${link.canvasId}/${link.id}`),
    );
    const actualBlocks = new Set<string>();
    const actualLinks = new Set<string>();
    const seenCanvases = new Set<string>();
    const manifestBlocksById = new Map(
      manifest.blocks.map((block) => [block.id, block]),
    );

    for (const snapshot of parsed) {
      if (
        seenCanvases.has(snapshot.canvasId) ||
        (snapshot.canvasId !== "root" &&
          manifestBlocksById.get(snapshot.canvasId)?.blockType !== "subcanvas")
      ) {
        throw new RepositorySyncFormatError("invalid_reference");
      }
      seenCanvases.add(snapshot.canvasId);
      const snapshotBlockIds = new Set(
        snapshot.blocks.map((block) => block.id),
      );
      for (const block of snapshot.blocks) {
        const key = `${snapshot.canvasId}/${block.id}`;
        if (!expectedBlocks.delete(key)) {
          throw new RepositorySyncFormatError("invalid_reference");
        }
        actualBlocks.add(key);
      }
      for (const link of snapshot.links) {
        const key = `${snapshot.canvasId}/${link.id}`;
        if (!expectedLinks.delete(key)) {
          throw new RepositorySyncFormatError("invalid_reference");
        }
        actualLinks.add(key);
      }
      if (
        Object.keys(snapshot.contents).some(
          (id) => !snapshotBlockIds.has(id),
        ) ||
        Object.keys(snapshot.noteDocuments).some(
          (id) =>
            !snapshotBlockIds.has(id) ||
            manifestBlocksById.get(id)?.blockType !== "text",
        )
      ) {
        throw new RepositorySyncFormatError("invalid_reference");
      }
    }
    if (expectedBlocks.size > 0 || expectedLinks.size > 0) {
      throw new RepositorySyncFormatError("invalid_reference");
    }

    snapshots = remapCanvasStateSnapshots(
      parsed,
      blockIdMap,
      linkIdMap,
      (node) => {
        const externalId = externalBlockIdByLocalId.get(node.id);
        const block = manifest.blocks.find((entry) => entry.id === externalId);
        if (!block || !externalId) {
          throw new RepositorySyncFormatError("invalid_reference");
        }
        const payload = blockPayloads.get(externalId);
        if (!payload) throw new RepositorySyncFormatError("invalid_reference");
        return {
          ...node,
          type: block.blockType,
          position: { x: block.position.x, y: block.position.y },
          width: block.dimensions.width ?? undefined,
          height: block.dimensions.height ?? undefined,
          data: { ...payload.data, ownerId: undefined },
        };
      },
    );

    for (const snapshot of snapshots) {
      for (const edge of snapshot.links) {
        const externalId = externalLinkIdByLocalId.get(edge.id);
        const payload = externalId ? linkPayloads.get(externalId) : undefined;
        if (!payload) throw new RepositorySyncFormatError("invalid_reference");
        Object.assign(edge, {
          sourceHandle: payload.sourceHandle ?? undefined,
          targetHandle: payload.targetHandle ?? undefined,
          animated: payload.animated,
          type: payload.type ?? undefined,
          data: payload.data,
        });
      }
    }
  } else {
    snapshots = [
      {
        canvasId: "root",
        blocks: [],
        links: [],
        contents: {},
        noteDocuments: {},
      },
    ];
  }

  const snapshotByCanvas = new Map(
    snapshots.map((snapshot) => [snapshot.canvasId, snapshot]),
  );
  for (const block of manifest.blocks) {
    const canvasId =
      block.canvasId === "root"
        ? "root"
        : blockIdMap.get(block.canvasId) ?? block.canvasId;
    const snapshot = snapshotByCanvas.get(canvasId);
    if (!snapshot) throw new RepositorySyncFormatError("invalid_reference");
    if (
      snapshot.blocks.some((entry) => entry.id === blockIdMap.get(block.id))
    ) {
      continue;
    }
    const payload = blockPayloads.get(block.id);
    if (!payload) throw new RepositorySyncFormatError("invalid_reference");
    snapshot.blocks.push({
      id: blockIdMap.get(block.id)!,
      type: block.blockType,
      position: { x: block.position.x, y: block.position.y },
      width: block.dimensions.width ?? undefined,
      height: block.dimensions.height ?? undefined,
      data: { ...payload.data },
    });
  }

  const stagedDoc = new Y.Doc();
  try {
    restoreCanvasStateSnapshots(stagedDoc, snapshots);
    for (const block of manifest.blocks) {
      if (block.blockType !== "text" || !block.contentPath) continue;
      const localId = blockIdMap.get(block.id);
      const canvasId =
        block.canvasId === "root"
          ? "root"
          : blockIdMap.get(block.canvasId) ?? block.canvasId;
      const payload = blockPayloads.get(block.id);
      if (!localId || !payload) {
        throw new RepositorySyncFormatError("invalid_reference");
      }
      const mapName =
        canvasId === "root" ? "noteDocuments" : `noteDocuments:${canvasId}`;
      const noteDocuments = stagedDoc.getMap<Y.XmlFragment>(mapName);
      let fragment = noteDocuments.get(localId);
      if (!(fragment instanceof Y.XmlFragment)) {
        fragment = new Y.XmlFragment();
        noteDocuments.set(localId, fragment);
      }
      const contentMapName =
        canvasId === "root" ? "contents" : `contents:${canvasId}`;
      const contents = stagedDoc.getMap<Y.Text>(contentMapName);
      const desiredMarkdown = payload.content ?? "";
      const currentMarkdown = withEditorDom(() =>
        getMarkdownFromXmlFragment(fragment),
      );
      if (currentMarkdown !== desiredMarkdown) {
        withEditorDom(() =>
          syncMarkdownToXmlFragment(fragment, desiredMarkdown),
        );
        const text = new Y.Text();
        text.insert(0, desiredMarkdown);
        contents.set(localId, text);
      }
    }
    return captureCanvasStateSnapshots(stagedDoc);
  } finally {
    stagedDoc.destroy();
  }
}

export function prepareRepositorySyncImport(
  bundle: Readonly<Record<string, Uint8Array>>,
  ownerId: string,
  previousBlockIdMap: Readonly<Record<string, string>> = {},
  previousLinkIdMap: Readonly<Record<string, string>> = {},
): RepositorySyncImportPlan {
  const manifest = parseRepositorySyncBundle(bundle);
  const blockIdentity = createIdentityMap(
    manifest.blocks.map((block) => block.id),
    previousBlockIdMap,
  );
  const linkIdentity = createIdentityMap(
    manifest.links.map((link) => link.id),
    previousLinkIdMap,
  );
  const manifestBlockIds = new Set(manifest.blocks.map((block) => block.id));
  const blockPayloads = new Map(
    manifest.blocks.map((block) => [
      block.id,
      readBlockPayload(
        bundle,
        {
          ...block,
          blockType: parseBlockType(block.blockType),
        },
        blockIdentity.externalToLocal,
        manifestBlockIds,
      ),
    ]),
  );
  const linkPayloads = new Map(
    manifest.links.map((link) => {
      const parsed = linkPayloadSchema.safeParse(
        parseJson(getRequiredFile(bundle, link.dataPath)),
      );
      if (!parsed.success) {
        throw new RepositorySyncFormatError("invalid_manifest");
      }
      return [link.id, parsed.data] as const;
    }),
  );

  const blocks: RepositorySyncBlockRow[] = manifest.blocks.map((block) => {
    const payload = blockPayloads.get(block.id);
    const id = blockIdentity.externalToLocal.get(block.id);
    if (!payload || !id)
      throw new RepositorySyncFormatError("invalid_reference");
    let parentBlockId: string | null = null;
    if (block.parentBlockId) {
      const mappedParentId = blockIdentity.externalToLocal.get(
        block.parentBlockId,
      );
      if (!mappedParentId) {
        throw new RepositorySyncFormatError("invalid_reference");
      }
      parentBlockId = mappedParentId;
    }
    const data = { ...payload.data, ownerId };
    return {
      id,
      blockType: block.blockType as RepositorySyncBlockRow["blockType"],
      metadata: JSON.stringify(payload.metadata),
      parentBlockId,
      positionX: block.position.x,
      positionY: block.position.y,
      width: block.dimensions.width,
      height: block.dimensions.height,
      ownerId,
      content: payload.content,
      data: JSON.stringify(data),
    };
  });

  const links: RepositorySyncLinkRow[] = manifest.links.map((link) => {
    const payload = linkPayloads.get(link.id);
    const id = linkIdentity.externalToLocal.get(link.id);
    const source = blockIdentity.externalToLocal.get(link.source);
    const target = blockIdentity.externalToLocal.get(link.target);
    if (!payload || !id || !source || !target) {
      throw new RepositorySyncFormatError("invalid_reference");
    }
    return {
      id,
      source,
      target,
      sourceHandle: payload.sourceHandle,
      targetHandle: payload.targetHandle,
      animated: payload.animated ? 1 : 0,
      type: payload.type,
      label: payload.label,
      sourceX: payload.sourceX,
      sourceY: payload.sourceY,
      targetX: payload.targetX,
      targetY: payload.targetY,
      sourceOrientation: payload.sourceOrientation,
      targetOrientation: payload.targetOrientation,
      data: JSON.stringify(payload.data),
    };
  });

  const snapshots = createSnapshots(
    bundle,
    manifest,
    blockIdentity.externalToLocal,
    linkIdentity.externalToLocal,
    blockPayloads,
    linkPayloads,
  );

  return {
    project: manifest.project,
    blocks,
    links,
    snapshots,
    blockIdMap: blockIdentity.updated,
    linkIdMap: linkIdentity.updated,
  };
}
