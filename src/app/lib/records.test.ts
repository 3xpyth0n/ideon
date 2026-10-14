import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import {
  computeStateHash,
  sealState,
  getCurrentSeal,
  computeDelta,
  buildRecordBundle,
} from "./records";
import { getDb } from "./db";

const PROJECT_ID = "44444444-4444-4444-4444-444444444444";
const USER_ID = "55555555-5555-5555-5555-555555555555";

function snapshotDiff(blocks: unknown[]): string {
  return JSON.stringify([
    { type: "graphSnapshot", payload: { blocks, links: [] } },
  ]);
}

async function seedState(diff: string, intent: string): Promise<string> {
  const id = randomUUID();
  await getDb()
    .insertInto("temporalStates")
    .values({
      id,
      projectId: PROJECT_ID,
      parentId: null,
      authorId: USER_ID,
      intent,
      diff,
      isSnapshot: 1,
      isAuto: 0,
      timestamp: new Date().toISOString(),
    })
    .execute();
  return id;
}

async function seedBlocks(
  blocks: {
    id: string;
    blockType: "text" | "frame";
    positionX: number;
    positionY: number;
    content: string | null;
    title: string | null;
    data: Record<string, unknown>;
    metadata: string;
  }[],
) {
  const now = new Date().toISOString();
  await getDb()
    .insertInto("blocks")
    .values(
      blocks.map((block) => ({
        id: block.id,
        projectId: PROJECT_ID,
        blockType: block.blockType,
        metadata: block.metadata,
        parentBlockId: null,
        positionX: block.positionX,
        positionY: block.positionY,
        ownerId: USER_ID,
        content: block.content,
        data: JSON.stringify(block.data),
        width: 200,
        height: 100,
        selected: 0,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .execute();
}

beforeEach(async () => {
  const db = getDb();
  await db.deleteFrom("sealedStates").execute();
  await db.deleteFrom("temporalStates").execute();
  await db.deleteFrom("blocks").execute();
  await db.deleteFrom("auditEvents").execute();
  await db.deleteFrom("projects").execute();
  await db.deleteFrom("users").execute();
  const now = new Date().toISOString();
  await db
    .insertInto("users")
    .values({
      id: USER_ID,
      email: "sealer@example.com",
      username: "sealer",
      role: "member",
      createdAt: now,
    })
    .execute();
  await db
    .insertInto("projects")
    .values({
      id: PROJECT_ID,
      name: "Records test project",
      description: null,
      ownerId: USER_ID,
      folderId: null,
      currentStateId: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
});

describe("computeStateHash", () => {
  it("is deterministic for the same diff", () => {
    const diff = snapshotDiff([
      { id: "a", type: "text", position: { x: 0, y: 0 } },
    ]);
    expect(computeStateHash(diff)).toBe(computeStateHash(diff));
  });

  it("equals the SHA-256 of the diff", () => {
    const diff = snapshotDiff([]);
    expect(computeStateHash(diff)).toBe(
      createHash("sha256").update(diff, "utf8").digest("hex"),
    );
  });

  it("differs for different diffs", () => {
    expect(computeStateHash(snapshotDiff([{ id: "a" }]))).not.toBe(
      computeStateHash(snapshotDiff([{ id: "b" }])),
    );
  });
});

describe("sealState", () => {
  it("stores the seal with the hash of the sealed diff and writes the audit event", async () => {
    const diff = snapshotDiff([
      { id: "block-a", type: "text", position: { x: 0, y: 0 } },
    ]);
    const stateId = await seedState(diff, "milestone state");

    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId,
      authorId: USER_ID,
      summary: "milestone",
    });

    expect(seal.stateHash).toBe(computeStateHash(diff));
    expect(seal.summary).toBe("milestone");

    const current = await getCurrentSeal(PROJECT_ID);
    expect(current?.id).toBe(seal.id);
    expect(current?.authorEmail).toBe("sealer@example.com");

    const audit = await getDb()
      .selectFrom("auditEvents")
      .select(["action", "entityId", "summary", "metadata"])
      .where("action", "=", "records.seal")
      .executeTakeFirst();
    expect(audit?.entityId).toBe(seal.id);
    expect(audit?.summary).toBe("State sealed: milestone");
    expect(JSON.parse(audit?.metadata ?? "{}")).toMatchObject({
      stateId,
      summary: "milestone",
    });
  });

  it("rejects a state that does not belong to the project", async () => {
    await expect(
      sealState({
        projectId: PROJECT_ID,
        stateId: randomUUID(),
        authorId: USER_ID,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("keeps the full seal history with the newest as current", async () => {
    const firstDiff = snapshotDiff([{ id: "block-a" }]);
    const secondDiff = snapshotDiff([{ id: "block-b" }]);
    const firstState = await seedState(firstDiff, "first");
    const secondState = await seedState(secondDiff, "second");

    const first = await sealState({
      projectId: PROJECT_ID,
      stateId: firstState,
      authorId: USER_ID,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await sealState({
      projectId: PROJECT_ID,
      stateId: secondState,
      authorId: USER_ID,
    });

    const current = await getCurrentSeal(PROJECT_ID);
    expect(current?.id).toBe(second.id);

    const all = await getDb()
      .selectFrom("sealedStates")
      .select("id")
      .where("projectId", "=", PROJECT_ID)
      .execute();
    expect(all.map((row) => row.id).sort()).toEqual(
      [first.id, second.id].sort(),
    );
  });
});

describe("computeDelta", () => {
  it("classifies added, modified and removed blocks as disjoint lists", async () => {
    const diff = snapshotDiff([
      {
        id: "block-a",
        type: "text",
        position: { x: 0, y: 0 },
        data: { blockType: "text", content: "a" },
      },
      {
        id: "block-b",
        type: "text",
        position: { x: 10, y: 0 },
        data: { blockType: "text", content: "b" },
      },
    ]);
    const stateId = await seedState(diff, "sealed state");
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId,
      authorId: USER_ID,
    });

    await seedBlocks([
      {
        id: "block-b",
        blockType: "text",
        positionX: 10,
        positionY: 0,
        content: "b-modified",
        title: null,
        data: { blockType: "text", content: "b-modified" },
        metadata: "{}",
      },
      {
        id: "block-c",
        blockType: "text",
        positionX: 20,
        positionY: 0,
        content: "c",
        title: null,
        data: { blockType: "text", content: "c" },
        metadata: "{}",
      },
    ]);

    const delta = await computeDelta(PROJECT_ID, seal);

    expect(delta.added).toEqual(["block-c"]);
    expect(delta.modified).toEqual(["block-b"]);
    expect(delta.removed).toEqual(["block-a"]);
    expect(delta.removedBlocks).toHaveLength(1);
    expect(delta.removedBlocks[0]).toMatchObject({
      id: "block-a",
      blockType: "text",
    });

    const all = [...delta.added, ...delta.modified, ...delta.removed];
    expect(new Set(all).size).toBe(all.length);
  });

  it("treats blocks as unchanged when only metadata normalization differs", async () => {
    // The client loads blocks through transformBlock, which normalizes
    // metadata by adding default keys; the sealed diff freezes those
    // normalized nodes while the blocks table can still hold raw metadata
    // written by the realtime sync.
    const blockA = {
      id: "block-a",
      type: "frame",
      position: { x: 0, y: 0 },
      data: {
        blockType: "frame",
        metadata: { color: "#3b82f6", childBlockIds: [] },
      },
    };
    const stateId = await seedState(snapshotDiff([blockA]), "sealed state");
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId,
      authorId: USER_ID,
    });

    await seedBlocks([
      {
        id: "block-a",
        blockType: "frame",
        positionX: 0,
        positionY: 0,
        content: null,
        title: null,
        data: { blockType: "frame" },
        metadata: "{}",
      },
    ]);

    const delta = await computeDelta(PROJECT_ID, seal);
    expect(delta.added).toEqual([]);
    expect(delta.modified).toEqual([]);
    expect(delta.removed).toEqual([]);
  });

  it("reports no delta when the current state matches the sealed state", async () => {
    const diff = snapshotDiff([
      {
        id: "block-a",
        type: "text",
        position: { x: 0, y: 0 },
        data: { blockType: "text", content: "a" },
      },
    ]);
    const stateId = await seedState(diff, "sealed state");
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId,
      authorId: USER_ID,
    });

    await seedBlocks([
      {
        id: "block-a",
        blockType: "text",
        positionX: 0,
        positionY: 0,
        content: "a",
        title: null,
        data: { blockType: "text", content: "a" },
        metadata: "{}",
      },
    ]);

    const delta = await computeDelta(PROJECT_ID, seal);
    expect(delta.added).toEqual([]);
    expect(delta.modified).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(delta.removedBlocks).toEqual([]);
  });
});

describe("buildRecordBundle", () => {
  it("produces a self-contained bundle whose state hash matches the manifest", async () => {
    const diff = snapshotDiff([
      {
        id: "block-a",
        type: "text",
        position: { x: 0, y: 0 },
        data: { blockType: "text", content: "a" },
      },
    ]);
    const stateId = await seedState(diff, "milestone state");
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId,
      authorId: USER_ID,
      summary: "milestone",
    });

    const bundle = await buildRecordBundle(seal);

    expect(bundle.manifest.format).toBe("ideon-record-v1");
    expect(bundle.manifest.sealId).toBe(seal.id);
    expect(bundle.manifest.algorithm).toBe("sha256");
    expect(bundle.manifest.author).toEqual({
      id: USER_ID,
      email: "sealer@example.com",
    });
    expect(bundle.state).toBe(diff);
    expect(computeStateHash(bundle.state)).toBe(bundle.manifest.stateHash);

    const sealEvent = bundle.audit.find(
      (event) => event.action === "records.seal",
    );
    expect(sealEvent?.entityId).toBe(seal.id);
    expect(sealEvent?.hash).toBeTruthy();
  });
});
