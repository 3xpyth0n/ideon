import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import fc from "fast-check";
import { GET, POST } from "./route";
import { getDb } from "@lib/db";
import { docs } from "../../../../../lib/y-websocket/utils";
import { NextRequest } from "next/server";
import type { Node } from "@xyflow/react";
import * as Y from "yjs";

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

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const OWNER_ID = "owner-user-1";
const EDITOR_ID = "editor-user-1";
const VIEWER_ID = "viewer-user-1";

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
      name: "Temporal test project",
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

function postRequest(body: unknown) {
  return new NextRequest(
    `http://localhost/api/projects/${PROJECT_ID}/temporal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function getRequest(query: string) {
  return new NextRequest(
    `http://localhost/api/projects/${PROJECT_ID}/temporal?${query}`,
  );
}

describe("P2 — reconstruct fidelity (property)", () => {
  beforeEach(async () => {
    const db = getDb();
    await db.deleteFrom("temporalStates").execute();
    await db.deleteFrom("links").execute();
    await db.deleteFrom("blocks").execute();
    await db.deleteFrom("projectCollaborators").execute();
    await db.deleteFrom("projects").execute();
    await db.deleteFrom("users").execute();
    await seedProject();
    vi.clearAllMocks();
    (getAuthUser as Mock).mockResolvedValue({
      id: OWNER_ID,
      email: "owner@example.com",
      role: "member",
    });
  });

  it("create via API then reconstruct returns the submitted blocks and links", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 8 }), {
          minLength: 1,
          maxLength: 5,
        }),
        async (blockIds) => {
          const uniqueIds = Array.from(new Set(blockIds));
          const blocks = uniqueIds.map((id, index) => ({
            id,
            type: "text",
            position: { x: index, y: index },
            data: { blockType: "text", content: `content-${index}` },
          }));
          const links =
            uniqueIds.length >= 2
              ? [
                  {
                    id: "link-0",
                    source: uniqueIds[0],
                    target: uniqueIds[1],
                  },
                ]
              : [];

          const createRes = await POST(
            postRequest({
              action: "create",
              blocks,
              links,
              intent: "property snapshot",
            }),
            { params: Promise.resolve({ id: PROJECT_ID }) },
          );

          expect(createRes.status).toBe(200);
          const created = await createRes.json();
          expect(created.success).toBe(true);
          expect(typeof created.stateId).toBe("string");

          const reconstructRes = await GET(
            getRequest(`action=reconstruct&stateId=${created.stateId}`),
            { params: Promise.resolve({ id: PROJECT_ID }) },
          );

          expect(reconstructRes.status).toBe(200);
          const graph = await reconstructRes.json();

          expect(graph.blocks).toEqual(blocks);
          expect(graph.links).toEqual(links);
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe("P4 — temporal API roles", () => {
  beforeEach(async () => {
    const db = getDb();
    await db.deleteFrom("temporalStates").execute();
    await db.deleteFrom("links").execute();
    await db.deleteFrom("blocks").execute();
    await db.deleteFrom("projectCollaborators").execute();
    await db.deleteFrom("projects").execute();
    await db.deleteFrom("users").execute();
    await seedProject();
    vi.clearAllMocks();
  });

  const sampleBlocks = [
    {
      id: "block-a",
      type: "text",
      position: { x: 0, y: 0 },
      data: { blockType: "text", content: "hello" },
    },
  ];

  const asUser = (id: string) => {
    (getAuthUser as Mock).mockResolvedValue({
      id,
      email: `${id}@example.com`,
      role: "member",
    });
  };

  it("viewer cannot create a snapshot (403)", async () => {
    asUser(VIEWER_ID);

    const res = await POST(
      postRequest({ action: "create", blocks: sampleBlocks, links: [] }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );

    expect(res.status).toBe(403);
  });

  it("editor can create a snapshot (200)", async () => {
    asUser(EDITOR_ID);

    const res = await POST(
      postRequest({ action: "create", blocks: sampleBlocks, links: [] }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );

    expect(res.status).toBe(200);
  });

  it("viewer cannot apply, update or delete states (403)", async () => {
    asUser(EDITOR_ID);
    const createRes = await POST(
      postRequest({ action: "create", blocks: sampleBlocks, links: [] }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );
    const created = await createRes.json();
    const stateId = created.stateId as string;

    asUser(VIEWER_ID);
    const applyRes = await POST(postRequest({ action: "apply", stateId }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(applyRes.status).toBe(403);

    const updateRes = await POST(
      postRequest({ action: "update", stateId, intent: "hacked" }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );
    expect(updateRes.status).toBe(403);

    const deleteRes = await POST(postRequest({ action: "delete", stateId }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(deleteRes.status).toBe(403);
  });

  it("owner can apply, update and delete states (200)", async () => {
    asUser(EDITOR_ID);
    const first = await (
      await POST(
        postRequest({ action: "create", blocks: sampleBlocks, links: [] }),
        { params: Promise.resolve({ id: PROJECT_ID }) },
      )
    ).json();
    const stateId = first.stateId as string;

    asUser(OWNER_ID);

    const applyRes = await POST(postRequest({ action: "apply", stateId }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(applyRes.status).toBe(200);

    const updateRes = await POST(
      postRequest({ action: "update", stateId, intent: "renamed by owner" }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );
    expect(updateRes.status).toBe(200);

    // Create a second state so the first is no longer the current state
    await POST(
      postRequest({
        action: "create",
        blocks: [
          {
            id: "block-b",
            type: "text",
            position: { x: 1, y: 1 },
            data: { blockType: "text", content: "second" },
          },
        ],
        links: [],
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );

    const deleteRes = await POST(postRequest({ action: "delete", stateId }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(deleteRes.status).toBe(200);
  });

  it("editor cannot apply, update or delete states (403)", async () => {
    asUser(EDITOR_ID);
    const createRes = await POST(
      postRequest({ action: "create", blocks: sampleBlocks, links: [] }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );
    const created = await createRes.json();
    const stateId = created.stateId as string;

    const applyRes = await POST(postRequest({ action: "apply", stateId }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(applyRes.status).toBe(403);

    const updateRes = await POST(
      postRequest({ action: "update", stateId, intent: "hacked" }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );
    expect(updateRes.status).toBe(403);

    const deleteRes = await POST(postRequest({ action: "delete", stateId }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(deleteRes.status).toBe(403);
  });
});

describe("P5 — apply convergence", () => {
  beforeEach(async () => {
    const db = getDb();
    await db.deleteFrom("temporalStates").execute();
    await db.deleteFrom("links").execute();
    await db.deleteFrom("blocks").execute();
    await db.deleteFrom("projectCollaborators").execute();
    await db.deleteFrom("projects").execute();
    await db.deleteFrom("users").execute();
    await seedProject();
    vi.clearAllMocks();
  });

  it("apply rewrites the DB and converges the live Y.Doc to the target", async () => {
    const targetBlocks = [
      {
        id: "y-block-1",
        type: "text",
        position: { x: 0, y: 0 },
        data: { blockType: "text", content: "converged" },
      },
    ];
    const canvasStates = [
      {
        canvasId: "root",
        blocks: targetBlocks,
        links: [],
        contents: {},
        noteDocuments: {},
      },
    ];

    (getAuthUser as Mock).mockResolvedValue({
      id: EDITOR_ID,
      email: "editor@example.com",
      role: "member",
    });

    const createRes = await POST(
      postRequest({
        action: "create",
        blocks: targetBlocks,
        links: [],
        canvasStates,
      }),
      { params: Promise.resolve({ id: PROJECT_ID }) },
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    const stateId = created.stateId as string;

    const liveDoc = new Y.Doc();
    docs.set(
      `project-${PROJECT_ID}`,
      liveDoc as unknown as import("../../../../../lib/y-websocket/utils").WSSharedDoc,
    );

    (getAuthUser as Mock).mockResolvedValue({
      id: OWNER_ID,
      email: "owner@example.com",
      role: "member",
    });

    const applyRes = await POST(postRequest({ action: "apply", stateId }), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });
    expect(applyRes.status).toBe(200);
    const applied = await applyRes.json();
    expect(applied.legacyRestore).not.toBe(true);

    const db = getDb();
    const dbBlocks = await db
      .selectFrom("blocks")
      .select("id")
      .where("projectId", "=", PROJECT_ID)
      .execute();
    expect(dbBlocks.map((block) => block.id)).toEqual(["y-block-1"]);

    const liveBlocks = liveDoc.getMap<Node>("blocks");
    const restoredBlock = liveBlocks.get("y-block-1");
    expect(restoredBlock).toBeDefined();
    expect(restoredBlock?.data).toMatchObject({ content: "converged" });

    docs.delete(`project-${PROJECT_ID}`);
  });
});
