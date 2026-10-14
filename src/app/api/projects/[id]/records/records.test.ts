import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { GET as GET_RECORDS } from "./route";
import { POST as POST_SEAL } from "./seal/route";
import { GET as GET_DELTA } from "./delta/route";
import { POST as POST_TEMPORAL } from "../temporal/route";
import { getDb } from "@lib/db";
import { NextRequest } from "next/server";

vi.mock("@auth", () => ({
  getAuthUser: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue("127.0.0.1"),
  }),
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
  }),
}));

import { getAuthUser } from "@auth";

const PROJECT_ID = "66666666-6666-4666-8666-666666666666";
const OWNER_ID = "owner-user-2";
const EDITOR_ID = "editor-user-2";
const VIEWER_ID = "viewer-user-2";

async function seedProject() {
  const db = getDb();
  const now = new Date().toISOString();

  for (const [id, email] of [
    [OWNER_ID, "owner@example.com"],
    [EDITOR_ID, "editor@example.com"],
    [VIEWER_ID, "viewer@example.com"],
  ] as const) {
    await db
      .insertInto("users")
      .values({
        id,
        email,
        username: id,
        role: "member",
        createdAt: now,
      })
      .execute();
  }

  await db
    .insertInto("projects")
    .values({
      id: PROJECT_ID,
      name: "Records test project",
      description: null,
      ownerId: OWNER_ID,
      folderId: null,
      currentStateId: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  await db
    .insertInto("projectCollaborators")
    .values([
      {
        projectId: PROJECT_ID,
        userId: EDITOR_ID,
        role: "editor",
        createdAt: now,
      },
      {
        projectId: PROJECT_ID,
        userId: VIEWER_ID,
        role: "viewer",
        createdAt: now,
      },
    ])
    .execute();
}

function sealRequest(body: unknown) {
  return new NextRequest(
    `http://localhost/api/projects/${PROJECT_ID}/records/seal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function recordsRequest() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/records`);
}

function deltaRequest() {
  return new NextRequest(
    `http://localhost/api/projects/${PROJECT_ID}/records/delta`,
  );
}

function temporalRequest(body: unknown) {
  return new NextRequest(
    `http://localhost/api/projects/${PROJECT_ID}/temporal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const params = { params: Promise.resolve({ id: PROJECT_ID }) };

const asUser = (id: string) => {
  (getAuthUser as Mock).mockResolvedValue({
    id,
    email: `${id}@example.com`,
    role: "member",
  });
};

async function createSnapshot(blocks: unknown[], intent: string) {
  const res = await POST_TEMPORAL(
    temporalRequest({ action: "create", blocks, links: [], intent }),
    params,
  );
  expect(res.status).toBe(200);
  const created = (await res.json()) as { stateId: string };
  return created.stateId;
}

beforeEach(async () => {
  const db = getDb();
  await db.deleteFrom("sealedStates").execute();
  await db.deleteFrom("temporalStates").execute();
  await db.deleteFrom("links").execute();
  await db.deleteFrom("blocks").execute();
  await db.deleteFrom("projectCollaborators").execute();
  await db.deleteFrom("projects").execute();
  await db.deleteFrom("auditEvents").execute();
  await db.deleteFrom("users").execute();
  await seedProject();
  vi.clearAllMocks();
});

describe("POST /records/seal", () => {
  const blocks = [
    {
      id: "block-a",
      type: "text",
      position: { x: 0, y: 0 },
      data: { blockType: "text", content: "a" },
    },
  ];

  it("seals the current state for an editor (201) and audits the seal", async () => {
    asUser(EDITOR_ID);
    await createSnapshot(blocks, "first snapshot");

    const res = await POST_SEAL(sealRequest({ summary: "milestone" }), params);
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      seal: { id: string; stateHash: string; summary: string };
    };
    expect(body.seal.summary).toBe("milestone");
    expect(body.seal.stateHash).toMatch(/^[0-9a-f]{64}$/);

    const audit = await getDb()
      .selectFrom("auditEvents")
      .select(["action", "entityId"])
      .where("action", "=", "records.seal")
      .executeTakeFirst();
    expect(audit?.entityId).toBe(body.seal.id);
  });

  it("rejects a viewer (403)", async () => {
    asUser(EDITOR_ID);
    await createSnapshot(blocks, "first snapshot");

    asUser(VIEWER_ID);
    const res = await POST_SEAL(sealRequest({}), params);
    expect(res.status).toBe(403);
  });

  it("rejects an unknown stateId (404)", async () => {
    asUser(EDITOR_ID);
    const res = await POST_SEAL(
      sealRequest({ stateId: "00000000-0000-4000-8000-000000000000" }),
      params,
    );
    expect(res.status).toBe(404);
  });

  it("rejects a project without a saved state (400)", async () => {
    asUser(EDITOR_ID);
    const res = await POST_SEAL(sealRequest({}), params);
    expect(res.status).toBe(400);
  });

  it("keeps the seal history and exposes the newest as current", async () => {
    asUser(EDITOR_ID);
    const firstState = await createSnapshot(blocks, "first snapshot");
    await POST_SEAL(sealRequest({ stateId: firstState }), params);

    const secondState = await createSnapshot(
      [
        {
          id: "block-b",
          type: "text",
          position: { x: 5, y: 5 },
          data: { blockType: "text", content: "b" },
        },
      ],
      "second snapshot",
    );
    const second = await POST_SEAL(
      sealRequest({ stateId: secondState }),
      params,
    );
    const secondBody = (await second.json()) as { seal: { id: string } };

    const res = await GET_RECORDS(recordsRequest(), params);
    const body = (await res.json()) as { seal: { id: string } | null };
    expect(body.seal?.id).toBe(secondBody.seal.id);

    const all = await getDb()
      .selectFrom("sealedStates")
      .select("id")
      .where("projectId", "=", PROJECT_ID)
      .execute();
    expect(all).toHaveLength(2);
  });
});

describe("GET /records", () => {
  it("returns null when no seal exists, visible to any role", async () => {
    asUser(VIEWER_ID);
    const res = await GET_RECORDS(recordsRequest(), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { seal: unknown };
    expect(body.seal).toBeNull();
  });

  it("returns the current seal with verified integrity", async () => {
    asUser(EDITOR_ID);
    await createSnapshot(
      [
        {
          id: "block-a",
          type: "text",
          position: { x: 0, y: 0 },
          data: { blockType: "text", content: "a" },
        },
      ],
      "snapshot",
    );
    const sealRes = await POST_SEAL(sealRequest({}), params);
    const sealBody = (await sealRes.json()) as {
      seal: { id: string; stateHash: string };
    };

    const res = await GET_RECORDS(recordsRequest(), params);
    const body = (await res.json()) as {
      seal: {
        id: string;
        authorEmail: string;
        sealedAt: string;
        stateHash: string;
        integrity: string;
      };
    };
    expect(body.seal.id).toBe(sealBody.seal.id);
    expect(body.seal.authorEmail).toBe("editor@example.com");
    expect(body.seal.stateHash).toBe(sealBody.seal.stateHash);
    expect(body.seal.integrity).toBe("verified");
  });
});

describe("GET /records/delta", () => {
  it("returns 404 when no seal exists", async () => {
    asUser(VIEWER_ID);
    const res = await GET_DELTA(deltaRequest(), params);
    expect(res.status).toBe(404);
  });

  it("returns the delta lists after changes, visible to any role", async () => {
    asUser(EDITOR_ID);
    await createSnapshot(
      [
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
      ],
      "sealed snapshot",
    );
    await POST_SEAL(sealRequest({}), params);

    await createSnapshot(
      [
        {
          id: "block-b",
          type: "text",
          position: { x: 10, y: 0 },
          data: { blockType: "text", content: "b modified" },
        },
        {
          id: "block-c",
          type: "text",
          position: { x: 20, y: 0 },
          data: { blockType: "text", content: "c" },
        },
      ],
      "changed snapshot",
    );

    asUser(VIEWER_ID);
    const res = await GET_DELTA(deltaRequest(), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      added: string[];
      modified: string[];
      removed: string[];
      removedBlocks: { id: string }[];
    };
    expect(body.added).toEqual(["block-c"]);
    expect(body.modified).toEqual(["block-b"]);
    expect(body.removed).toEqual(["block-a"]);
    expect(body.removedBlocks[0]?.id).toBe("block-a");
  });
});

describe("sealed state immutability (temporal API guard)", () => {
  const firstBlocks = [
    {
      id: "block-a",
      type: "text",
      position: { x: 0, y: 0 },
      data: { blockType: "text", content: "a" },
    },
  ];
  const secondBlocks = [
    {
      id: "block-b",
      type: "text",
      position: { x: 5, y: 5 },
      data: { blockType: "text", content: "b" },
    },
  ];

  it("refuses delete and rename of a sealed state (409) and journals both attempts", async () => {
    asUser(EDITOR_ID);
    const sealedState = await createSnapshot(firstBlocks, "sealed snapshot");
    await createSnapshot(secondBlocks, "later snapshot");
    await POST_SEAL(sealRequest({ stateId: sealedState }), params);

    asUser(OWNER_ID);

    const deleteRes = await POST_TEMPORAL(
      temporalRequest({ action: "delete", stateId: sealedState }),
      params,
    );
    expect(deleteRes.status).toBe(409);

    const updateRes = await POST_TEMPORAL(
      temporalRequest({
        action: "update",
        stateId: sealedState,
        intent: "renamed",
      }),
      params,
    );
    expect(updateRes.status).toBe(409);

    const guardEvents = await getDb()
      .selectFrom("auditEvents")
      .select(["action", "metadata"])
      .where("action", "=", "records.seal_guard")
      .orderBy("createdAt", "asc")
      .execute();
    expect(guardEvents).toHaveLength(2);
    expect(
      guardEvents.map((event) => JSON.parse(event.metadata).action).sort(),
    ).toEqual(["delete", "update"]);
    expect(JSON.parse(guardEvents[0].metadata).stateId).toBe(sealedState);

    const stillThere = await getDb()
      .selectFrom("temporalStates")
      .select("id")
      .where("id", "=", sealedState)
      .executeTakeFirst();
    expect(stillThere).toBeDefined();
  });

  it("still allows deleting a state that is not sealed", async () => {
    asUser(EDITOR_ID);
    const sealedState = await createSnapshot(firstBlocks, "sealed snapshot");
    const openState = await createSnapshot(secondBlocks, "later snapshot");
    await createSnapshot(
      [
        {
          id: "block-c",
          type: "text",
          position: { x: 9, y: 9 },
          data: { blockType: "text", content: "c" },
        },
      ],
      "newest snapshot",
    );
    await POST_SEAL(sealRequest({ stateId: sealedState }), params);

    asUser(OWNER_ID);
    const deleteRes = await POST_TEMPORAL(
      temporalRequest({ action: "delete", stateId: openState }),
      params,
    );
    expect(deleteRes.status).toBe(200);
  });
});
