import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { getDb } from "@lib/db";

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

const PROJECT_ID = "88888888-9999-4aaa-8bbb-cccccccccccc";
const RULE_ID = "secret-rule";
const SECRET = "initial-secret";
const CREATOR_ID = "secret-creator";
const OWNER_ID = "secret-owner";
const EDITOR_ID = "secret-editor";
const VIEWER_ID = "secret-viewer";

async function seed() {
  const db = getDb();
  const now = new Date().toISOString();

  for (const id of [CREATOR_ID, OWNER_ID, EDITOR_ID, VIEWER_ID]) {
    await db
      .insertInto("users")
      .values({
        id,
        email: `${id}@example.com`,
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
      name: "Webhook secret test project",
      description: null,
      ownerId: CREATOR_ID,
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
        userId: OWNER_ID,
        role: "owner",
        createdAt: now,
      },
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

  await db
    .insertInto("automationRules")
    .values({
      id: RULE_ID,
      projectId: PROJECT_ID,
      name: "Webhook",
      enabled: 1,
      source: "custom",
      triggerEvent: "*",
      conditions: null,
      targetBlockId: null,
      action: "set_state",
      actionParams: null,
      webhookSecret: SECRET,
      sourceBlockId: null,
      lastTriggeredAt: null,
      createdAt: Date.now(),
    })
    .execute();
}

function call(handler: typeof GET, userId: string, method: "GET" | "POST") {
  (getAuthUser as Mock).mockResolvedValue({
    id: userId,
    email: `${userId}@example.com`,
    role: "member",
  });
  return handler(
    new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/automations/${RULE_ID}/secret`,
      { method },
    ),
    { params: Promise.resolve({ id: PROJECT_ID, ruleId: RULE_ID }) },
  );
}

async function storedSecret() {
  const rule = await getDb()
    .selectFrom("automationRules")
    .select("webhookSecret")
    .where("id", "=", RULE_ID)
    .executeTakeFirstOrThrow();
  return rule.webhookSecret;
}

describe("/api/projects/[id]/automations/[ruleId]/secret", () => {
  beforeEach(async () => {
    const db = getDb();
    await db.deleteFrom("automationRules").execute();
    await db.deleteFrom("projectCollaborators").execute();
    await db.deleteFrom("projects").execute();
    await db.deleteFrom("users").execute();
    await seed();
    vi.clearAllMocks();
  });

  it.each([CREATOR_ID, OWNER_ID])("returns the secret to %s", async (id) => {
    const res = await call(GET, id, "GET");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ webhookSecret: SECRET });
  });

  it.each([EDITOR_ID, VIEWER_ID])("hides the secret from %s", async (id) => {
    const res = await call(GET, id, "GET");
    expect(res.status).toBe(403);
  });

  it("lets an owner regenerate the secret", async () => {
    const res = await call(POST, OWNER_ID, "POST");
    const { webhookSecret } = (await res.json()) as { webhookSecret: string };

    expect(res.status).toBe(200);
    expect(webhookSecret).not.toBe(SECRET);
    expect(await storedSecret()).toBe(webhookSecret);
  });

  it("forbids an editor from regenerating the secret", async () => {
    const res = await call(POST, EDITOR_ID, "POST");

    expect(res.status).toBe(403);
    expect(await storedSecret()).toBe(SECRET);
  });
});
