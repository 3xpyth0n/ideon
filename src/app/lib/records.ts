import { createHash } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import type { Node } from "@xyflow/react";
import { getDb } from "./db";
import { appendAuditEvent } from "./audit-trail";
import { applyGraphMutation, type GraphState, type Mutation } from "./graph";
import { normalizeMetadataForBlockType } from "./metadata-parsers";
import { clampBlockContent } from "./projectContentSafety";
import { z } from "zod";

export interface SealedState {
  id: string;
  projectId: string;
  stateId: string;
  authorId: string;
  authorEmail: string | null;
  stateHash: string;
  summary: string;
  createdAt: string;
}

export interface RecordBundle {
  manifest: {
    format: "ideon-record-v1";
    sealId: string;
    projectId: string;
    projectName: string;
    author: { id: string; email: string | null };
    sealedAt: string;
    stateHash: string;
    algorithm: "sha256";
  };
  state: string;
  audit: {
    id: string;
    projectId: string | null;
    userId: string | null;
    action: string;
    entityType: string | null;
    entityId: string | null;
    summary: string;
    metadata: string;
    prevHash: string | null;
    hash: string;
    createdAt: string;
  }[];
}

const mutationSchema = z.object({
  type: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export function computeStateHash(diff: string): string {
  return createHash("sha256").update(diff, "utf8").digest("hex");
}

function parseJsonValue(value: string | null | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(
      entries.map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value === undefined ? null : value;
}

function blockSignature(fields: {
  position: { x: number; y: number };
  type: string;
  width: number;
  height: number;
  content: string;
  title: unknown;
  metadata: unknown;
}): string {
  return JSON.stringify(canonicalize(fields));
}

// Defaults mirror the values prepareBlockForDb persists, so a block that never
// changed still produces an identical signature on both sides of the comparison
export function sealedBlockSignature(node: Node): string {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const metadata =
    typeof data.metadata === "string"
      ? parseJsonValue(data.metadata)
      : data.metadata;
  return blockSignature({
    position: node.position ?? { x: 0, y: 0 },
    type:
      node.type ||
      (typeof data.blockType === "string" ? data.blockType : "") ||
      "text",
    width: node.width || 200,
    height: node.height || 100,
    content: typeof data.content === "string" ? data.content : "",
    title: data.title ?? null,
    metadata: metadata ?? {},
  });
}

// Mirrors client-side transformBlock: sealed diffs hold normalized metadata and clamped content, the blocks table can hold raw values.
function currentBlockSignature(block: {
  blockType: string;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  content: string | null;
  metadata: string;
  data: string;
}): string {
  const data = (parseJsonValue(block.data) ?? {}) as Record<string, unknown>;
  return blockSignature({
    position: { x: block.positionX, y: block.positionY },
    type: block.blockType,
    width: block.width || 200,
    height: block.height || 100,
    content: clampBlockContent(block.content ?? ""),
    title: data.title ?? null,
    metadata: normalizeMetadataForBlockType(block.blockType, block.metadata),
  });
}

export function sealedGraphFromDiff(diff: string): GraphState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(diff);
  } catch {
    return { blocks: [], links: [] };
  }
  if (!Array.isArray(parsed)) return { blocks: [], links: [] };

  let graph: GraphState = { blocks: [], links: [] };
  for (const entry of parsed) {
    const result = mutationSchema.safeParse(entry);
    if (!result.success) continue;
    graph = applyGraphMutation(graph, result.data as Mutation);
  }
  return graph;
}

export async function sealState(input: {
  projectId: string;
  stateId: string;
  authorId: string;
  summary?: string;
}): Promise<SealedState> {
  const db = getDb();
  const state = await db
    .selectFrom("temporalStates")
    .select("diff")
    .where("id", "=", input.stateId)
    .where("projectId", "=", input.projectId)
    .executeTakeFirst();

  if (!state) {
    throw { status: 404, message: "State not found" };
  }

  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const summary = input.summary ?? "";
  const stateHash = computeStateHash(state.diff);

  await db
    .insertInto("sealedStates")
    .values({
      id,
      projectId: input.projectId,
      stateId: input.stateId,
      authorId: input.authorId,
      stateHash,
      summary,
      createdAt,
    })
    .execute();

  await appendAuditEvent({
    projectId: input.projectId,
    userId: input.authorId,
    action: "records.seal",
    entityType: "sealedState",
    entityId: id,
    summary: summary ? `State sealed: ${summary}` : "State sealed",
    metadata: { stateId: input.stateId, summary },
  });

  return {
    id,
    projectId: input.projectId,
    stateId: input.stateId,
    authorId: input.authorId,
    authorEmail: null,
    stateHash,
    summary,
    createdAt,
  };
}

export async function getCurrentSeal(
  projectId: string,
): Promise<SealedState | null> {
  const db = getDb();
  const seal = await db
    .selectFrom("sealedStates")
    .leftJoin("users", "users.id", "sealedStates.authorId")
    .select([
      "sealedStates.id",
      "sealedStates.projectId",
      "sealedStates.stateId",
      "sealedStates.authorId",
      "sealedStates.stateHash",
      "sealedStates.summary",
      "sealedStates.createdAt",
      "users.email as authorEmail",
    ])
    .where("sealedStates.projectId", "=", projectId)
    .orderBy("sealedStates.createdAt", "desc")
    .orderBy("sealedStates.id", "desc")
    .limit(1)
    .executeTakeFirst();

  return seal ?? null;
}

export async function getSealById(
  projectId: string,
  sealId: string,
): Promise<SealedState | null> {
  const db = getDb();
  const seal = await db
    .selectFrom("sealedStates")
    .leftJoin("users", "users.id", "sealedStates.authorId")
    .select([
      "sealedStates.id",
      "sealedStates.projectId",
      "sealedStates.stateId",
      "sealedStates.authorId",
      "sealedStates.stateHash",
      "sealedStates.summary",
      "sealedStates.createdAt",
      "users.email as authorEmail",
    ])
    .where("sealedStates.id", "=", sealId)
    .where("sealedStates.projectId", "=", projectId)
    .executeTakeFirst();

  return seal ?? null;
}

export async function verifySealIntegrity(
  seal: SealedState,
): Promise<"verified" | "broken"> {
  const db = getDb();
  const state = await db
    .selectFrom("temporalStates")
    .select("diff")
    .where("id", "=", seal.stateId)
    .where("projectId", "=", seal.projectId)
    .executeTakeFirst();

  if (!state) return "broken";
  return computeStateHash(state.diff) === seal.stateHash
    ? "verified"
    : "broken";
}

export interface RecordDelta {
  added: string[];
  modified: string[];
  removed: string[];
  removedBlocks: {
    id: string;
    position: { x: number; y: number };
    blockType: string;
    title: string | null;
  }[];
}

export async function computeDelta(
  projectId: string,
  seal: SealedState,
): Promise<RecordDelta> {
  const db = getDb();

  const state = await db
    .selectFrom("temporalStates")
    .select("diff")
    .where("id", "=", seal.stateId)
    .where("projectId", "=", projectId)
    .executeTakeFirst();

  const sealedSignatures = new Map<string, string>();
  const sealedNodes = new Map<string, Node>();
  if (state) {
    for (const block of sealedGraphFromDiff(state.diff).blocks) {
      sealedSignatures.set(block.id, sealedBlockSignature(block));
      sealedNodes.set(block.id, block);
    }
  }

  const currentBlocks = await db
    .selectFrom("blocks")
    .select([
      "id",
      "blockType",
      "positionX",
      "positionY",
      "width",
      "height",
      "content",
      "metadata",
      "data",
    ])
    .where("projectId", "=", projectId)
    .execute();

  const added: string[] = [];
  const modified: string[] = [];

  for (const block of currentBlocks) {
    const sealedSignature = sealedSignatures.get(block.id);
    if (sealedSignature === undefined) {
      added.push(block.id);
    } else if (sealedSignature !== currentBlockSignature(block)) {
      modified.push(block.id);
    }
  }

  const currentIds = new Set(currentBlocks.map((block) => block.id));
  const removed: string[] = [];
  const removedBlocks: RecordDelta["removedBlocks"] = [];
  for (const [id, node] of sealedNodes) {
    if (currentIds.has(id)) continue;
    removed.push(id);
    const data = (node.data ?? {}) as Record<string, unknown>;
    removedBlocks.push({
      id,
      position: node.position ?? { x: 0, y: 0 },
      blockType:
        node.type ||
        (typeof data.blockType === "string" ? data.blockType : "text"),
      title: typeof data.title === "string" ? data.title : null,
    });
  }

  return { added, modified, removed, removedBlocks };
}

export async function getProjectSeals(
  projectId: string,
): Promise<SealedState[]> {
  const db = getDb();
  return db
    .selectFrom("sealedStates")
    .leftJoin("users", "users.id", "sealedStates.authorId")
    .select([
      "sealedStates.id",
      "sealedStates.projectId",
      "sealedStates.stateId",
      "sealedStates.authorId",
      "sealedStates.stateHash",
      "sealedStates.summary",
      "sealedStates.createdAt",
      "users.email as authorEmail",
    ])
    .where("sealedStates.projectId", "=", projectId)
    .orderBy("sealedStates.createdAt", "asc")
    .orderBy("sealedStates.id", "asc")
    .execute();
}

export interface SealedBlockInfo {
  id: string;
  blockType: string;
  title: string | null;
}

function describeSealedNode(node: Node): SealedBlockInfo {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return {
    id: node.id,
    blockType:
      node.type ||
      (typeof data.blockType === "string" ? data.blockType : "text"),
    title: typeof data.title === "string" ? data.title : null,
  };
}

export async function getSealInventory(
  projectId: string,
  seal: SealedState,
): Promise<SealedBlockInfo[]> {
  const db = getDb();
  const state = await db
    .selectFrom("temporalStates")
    .select("diff")
    .where("id", "=", seal.stateId)
    .where("projectId", "=", projectId)
    .executeTakeFirst();

  if (!state) return [];
  return sealedGraphFromDiff(state.diff)
    .blocks.map(describeSealedNode)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface SealToSealDelta {
  added: SealedBlockInfo[];
  modified: SealedBlockInfo[];
  removed: SealedBlockInfo[];
}

export async function computeSealToSealDelta(
  projectId: string,
  previousSeal: SealedState,
  currentSeal: SealedState,
): Promise<SealToSealDelta> {
  const db = getDb();
  const [previousState, currentState] = await Promise.all([
    db
      .selectFrom("temporalStates")
      .select("diff")
      .where("id", "=", previousSeal.stateId)
      .where("projectId", "=", projectId)
      .executeTakeFirst(),
    db
      .selectFrom("temporalStates")
      .select("diff")
      .where("id", "=", currentSeal.stateId)
      .where("projectId", "=", projectId)
      .executeTakeFirst(),
  ]);

  const previousBlocks = previousState
    ? sealedGraphFromDiff(previousState.diff).blocks
    : [];
  const currentBlocks = currentState
    ? sealedGraphFromDiff(currentState.diff).blocks
    : [];

  const previousById = new Map(previousBlocks.map((b) => [b.id, b]));
  const currentById = new Map(currentBlocks.map((b) => [b.id, b]));

  const added: SealedBlockInfo[] = [];
  const modified: SealedBlockInfo[] = [];
  const removed: SealedBlockInfo[] = [];

  for (const [id, node] of currentById) {
    const previous = previousById.get(id);
    if (!previous) {
      added.push(describeSealedNode(node));
    } else if (sealedBlockSignature(previous) !== sealedBlockSignature(node)) {
      modified.push(describeSealedNode(node));
    }
  }
  for (const [id, node] of previousById) {
    if (!currentById.has(id)) removed.push(describeSealedNode(node));
  }

  return { added, modified, removed };
}

export async function buildRecordBundle(
  seal: SealedState,
): Promise<RecordBundle> {
  const db = getDb();

  const state = await db
    .selectFrom("temporalStates")
    .select("diff")
    .where("id", "=", seal.stateId)
    .where("projectId", "=", seal.projectId)
    .executeTakeFirst();

  const project = await db
    .selectFrom("projects")
    .select("name")
    .where("id", "=", seal.projectId)
    .executeTakeFirst();

  const author = await db
    .selectFrom("users")
    .select("email")
    .where("id", "=", seal.authorId)
    .executeTakeFirst();

  // Events up to the seal, plus the seal event itself: the audit chain gives it its own monotonic timestamp, which can land after the row's createdAt.
  const audit = await db
    .selectFrom("auditEvents")
    .select([
      "id",
      "projectId",
      "userId",
      "action",
      "entityType",
      "entityId",
      "summary",
      "metadata",
      "prevHash",
      "hash",
      "createdAt",
    ])
    .where((eb) =>
      eb.or([
        eb.and([
          eb("projectId", "=", seal.projectId),
          eb("createdAt", "<=", seal.createdAt),
        ]),
        eb.and([
          eb("projectId", "=", seal.projectId),
          eb("action", "=", "records.seal"),
          eb("entityId", "=", seal.id),
        ]),
      ]),
    )
    .orderBy("createdAt", "asc")
    .orderBy("id", "asc")
    .execute();

  return {
    manifest: {
      format: "ideon-record-v1",
      sealId: seal.id,
      projectId: seal.projectId,
      projectName: project?.name ?? "",
      author: {
        id: seal.authorId,
        email: author?.email ?? seal.authorEmail ?? null,
      },
      sealedAt: seal.createdAt,
      stateHash: seal.stateHash,
      algorithm: "sha256",
    },
    state: state?.diff ?? "",
    audit,
  };
}
