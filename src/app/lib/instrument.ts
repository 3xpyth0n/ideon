import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "fflate";
import { getDb } from "./db";
import {
  buildRecordBundle,
  computeSealToSealDelta,
  getCurrentSeal,
  getProjectSeals,
  getSealById,
  getSealInventory,
  sealedBlockSignature,
  sealedGraphFromDiff,
  verifySealIntegrity,
  type SealToSealDelta,
} from "./records";

export interface DossierTimelineEntry {
  at: string;
  actor: string | null;
  action: string;
  summary: string;
}

export interface DossierSealSummary {
  number: number;
  count: number;
  firstSealAt: string | null;
}

export interface DossierDocument {
  certificate: {
    projectName: string;
    authorEmail: string | null;
    sealedAt: string;
    stateHash: string;
    bundleHash: string;
    integrity: "verified" | "broken";
  };
  timeline: DossierTimelineEntry[];
  inventory: { id: string; blockType: string; title: string | null }[];
  delta: SealToSealDelta;
  sealSummary: DossierSealSummary;
}

function serializeBundle(bundle: unknown): string {
  return JSON.stringify(bundle);
}

interface RawTimelineEntry {
  at: string;
  actor: string | null;
  action: string;
  summary: string;
  metadata: string;
}

function parseCanvasMessages(metadata: string): number | null {
  try {
    const parsed = JSON.parse(metadata) as { messages?: unknown };
    return typeof parsed.messages === "number" ? parsed.messages : null;
  } catch {
    return null;
  }
}

// Consecutive graph.update runs are working state between snapshots, not audit material: they collapse into one row.
function collapseCanvasActivity(
  entries: RawTimelineEntry[],
): DossierTimelineEntry[] {
  const timeline: DossierTimelineEntry[] = [];
  let run: RawTimelineEntry[] = [];

  const flushRun = () => {
    if (run.length === 0) return;
    const totalMessages = run.reduce((sum, entry) => {
      const messages = parseCanvasMessages(entry.metadata);
      return sum + (messages ?? 1);
    }, 0);
    timeline.push({
      at: run[0].at,
      actor: run[0].actor,
      action: "graph.update",
      summary: `${totalMessages} canvas updates (working state between snapshots)`,
    });
    run = [];
  };

  for (const entry of entries) {
    if (entry.action === "graph.update") {
      run.push(entry);
      continue;
    }
    flushRun();
    timeline.push({
      at: entry.at,
      actor: entry.actor,
      action: entry.action,
      summary: entry.summary,
    });
  }
  flushRun();

  return timeline;
}

function humanAction(action: string): string {
  const labels: Record<string, string> = {
    "temporal.create": "snapshot",
    "temporal.apply": "rewind",
    "temporal.rename": "snapshot renamed",
    "temporal.delete": "snapshot deleted",
    "records.seal": "seal",
    "project.create": "project created",
    "project.update": "project",
    "graph.update": "canvas work",
    "graph.write_rejected": "write rejected",
    "automation.set_state": "automation",
  };
  return labels[action] ?? action;
}

export async function buildDossier(
  projectId: string,
  sealId: string,
): Promise<DossierDocument> {
  const seal = await getSealById(projectId, sealId);
  if (!seal) {
    throw { status: 404, message: "Seal not found" };
  }

  const db = getDb();
  const [bundle, integrity, inventory, seals] = await Promise.all([
    buildRecordBundle(seal),
    verifySealIntegrity(seal),
    getSealInventory(projectId, seal),
    getProjectSeals(projectId),
  ]);

  const project = await db
    .selectFrom("projects")
    .select("name")
    .where("id", "=", projectId)
    .executeTakeFirst();

  const actorByUserId = new Map<string, string | null>();
  const auditUserIds = [
    ...new Set(bundle.audit.map((event) => event.userId).filter(Boolean)),
  ] as string[];
  if (auditUserIds.length > 0) {
    const users = await db
      .selectFrom("users")
      .select(["id", "email"])
      .where("id", "in", auditUserIds)
      .execute();
    for (const user of users) {
      actorByUserId.set(user.id, user.email);
    }
  }

  const timeline: DossierTimelineEntry[] = collapseCanvasActivity(
    bundle.audit.map((event) => ({
      at: event.createdAt,
      actor: event.userId ? actorByUserId.get(event.userId) ?? null : null,
      action: event.action,
      summary: event.summary,
      metadata: event.metadata,
    })),
  ).map((entry) => ({ ...entry, action: humanAction(entry.action) }));

  const sealIndex = seals.findIndex((entry) => entry.id === seal.id);
  const previousSeal = sealIndex > 0 ? seals[sealIndex - 1] : null;
  const delta = previousSeal
    ? await computeSealToSealDelta(projectId, previousSeal, seal)
    : { added: [], modified: [], removed: [] };

  const bundleHash = createHash("sha256")
    .update(serializeBundle(bundle), "utf8")
    .digest("hex");

  return {
    certificate: {
      projectName: project?.name ?? "",
      authorEmail: seal.authorEmail,
      sealedAt: seal.createdAt,
      stateHash: seal.stateHash,
      bundleHash,
      integrity,
    },
    timeline,
    inventory,
    delta,
    sealSummary: {
      number: sealIndex + 1,
      count: seals.length,
      firstSealAt: seals[0]?.createdAt ?? null,
    },
  };
}

export interface BlockProvenanceEntry {
  authorEmail: string | null;
  at: string;
  stateId: string;
}

export interface BlockProvenance {
  created: BlockProvenanceEntry | null;
  modifications: BlockProvenanceEntry[];
  sealed: boolean;
}

const PROVENANCE_STATE_CAP = 200;

export async function getBlockProvenance(
  projectId: string,
  blockId: string,
): Promise<BlockProvenance> {
  const db = getDb();
  const states = await db
    .selectFrom("temporalStates")
    .select(["id", "diff", "authorId", "timestamp"])
    .where("projectId", "=", projectId)
    .orderBy("timestamp", "asc")
    .orderBy("id", "asc")
    .limit(PROVENANCE_STATE_CAP)
    .execute();

  const authorIds = [...new Set(states.map((state) => state.authorId))];
  const emailByUserId = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const users = await db
      .selectFrom("users")
      .select(["id", "email"])
      .where("id", "in", authorIds)
      .execute();
    for (const user of users) {
      emailByUserId.set(user.id, user.email);
    }
  }

  let created: BlockProvenanceEntry | null = null;
  const modifications: BlockProvenanceEntry[] = [];
  let previousSignature: string | null = null;

  for (const state of states) {
    const graph = sealedGraphFromDiff(state.diff);
    const node = graph.blocks.find((block) => block.id === blockId);
    if (!node) {
      previousSignature = null;
      continue;
    }

    const signature = sealedBlockSignature(node);
    const entry: BlockProvenanceEntry = {
      authorEmail: emailByUserId.get(state.authorId) ?? null,
      at: new Date(state.timestamp).toISOString(),
      stateId: state.id,
    };

    if (!created) {
      created = entry;
    } else if (previousSignature !== null && signature !== previousSignature) {
      modifications.push(entry);
    }
    previousSignature = signature;
  }

  const seal = await getCurrentSeal(projectId);
  let sealed = false;
  if (seal) {
    const inventory = await getSealInventory(projectId, seal);
    sealed = inventory.some((block) => block.id === blockId);
  }

  return { created, modifications, sealed };
}

export function sanitizeFilenamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

const VERIFIER_SCRIPT_PATH = join(process.cwd(), "scripts/verify-record.mjs");

export async function buildDossierArchive(
  projectId: string,
  sealId: string,
  pdf: Buffer,
  projectName: string,
  sealedAt: string,
): Promise<{ filename: string; content: Buffer }> {
  const seal = await getSealById(projectId, sealId);
  if (!seal) {
    throw { status: 404, message: "Seal not found" };
  }
  const bundle = await buildRecordBundle(seal);
  const scriptSource = await readFile(VERIFIER_SCRIPT_PATH, "utf8");

  const projectPart = sanitizeFilenamePart(projectName);
  const datePart = sealedAt.slice(0, 10);
  const base = `dossier-${projectPart || "project"}-${datePart}`;

  const zipped = zipSync(
    {
      [`${base}.pdf`]: new Uint8Array(pdf),
      [`ideon-record-${seal.id}.json`]: new TextEncoder().encode(
        JSON.stringify(bundle),
      ),
      "verify-record.mjs": new TextEncoder().encode(scriptSource),
    },
    { level: 6 },
  );

  return { filename: `${base}.zip`, content: Buffer.from(zipped) };
}
