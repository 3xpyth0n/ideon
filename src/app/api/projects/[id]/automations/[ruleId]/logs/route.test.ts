import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
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

const PROJECT_ID = "77777777-8888-4999-8aaa-bbbbbbbbbbbb";
const RULE_ID = "missing-rule";
const CREATOR_ID = "logs-creator";
const EDITOR_ID = "logs-editor";
const VIEWER_ID = "logs-viewer";

async function seed() {
  const db = getDb();
  const now = new Date().toISOString();

  for (const id of [CREATOR_ID, EDITOR_ID, VIEWER_ID]) {
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
      name: "Automation logs test project",
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

function readLogsAs(id: string) {
  (getAuthUser as Mock).mockResolvedValue({
    id,
    email: `${id}@example.com`,
    role: "member",
  });
  return GET(
    new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/automations/${RULE_ID}/logs`,
    ),
    { params: Promise.resolve({ id: PROJECT_ID, ruleId: RULE_ID }) },
  );
}

describe("GET /api/projects/[id]/automations/[ruleId]/logs", () => {
  beforeEach(async () => {
    const db = getDb();
    await db.deleteFrom("projectCollaborators").execute();
    await db.deleteFrom("projects").execute();
    await db.deleteFrom("users").execute();
    await seed();
    vi.clearAllMocks();
  });

  it("forbids viewers from reading automation logs", async () => {
    const res = await readLogsAs(VIEWER_ID);
    expect(res.status).toBe(403);
  });

  it("lets editors past the role check", async () => {
    const res = await readLogsAs(EDITOR_ID);
    expect(res.status).toBe(404);
  });
});
