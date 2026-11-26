import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
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

const PROJECT_ID = "55555555-6666-4777-8888-999999999999";
const CREATOR_ID = "creator-user-1";
const OWNER_ID = "owner-user-1";
const OTHER_OWNER_ID = "owner-user-2";
const EDITOR_ID = "editor-user-1";

const refreshUserAccess = vi.fn();

async function seed() {
  const db = getDb();
  const now = new Date().toISOString();

  for (const id of [CREATOR_ID, OWNER_ID, OTHER_OWNER_ID, EDITOR_ID]) {
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
      name: "Collaborators test project",
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
        userId: OTHER_OWNER_ID,
        role: "owner",
        createdAt: now,
      },
      {
        projectId: PROJECT_ID,
        userId: EDITOR_ID,
        role: "editor",
        createdAt: now,
      },
    ])
    .execute();
}

function actAs(id: string) {
  (getAuthUser as Mock).mockResolvedValue({
    id,
    email: `${id}@example.com`,
    role: "member",
  });
}

function setRole(userId: string, role: string) {
  return POST(
    new NextRequest(
      `http://localhost/api/projects/${PROJECT_ID}/collaborators`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      },
    ),
    { params: Promise.resolve({ id: PROJECT_ID }) },
  );
}

async function roleOf(userId: string) {
  const row = await getDb()
    .selectFrom("projectCollaborators")
    .select("role")
    .where("projectId", "=", PROJECT_ID)
    .where("userId", "=", userId)
    .executeTakeFirst();
  return row?.role;
}

describe("POST /api/projects/[id]/collaborators", () => {
  beforeEach(async () => {
    const db = getDb();
    await db.deleteFrom("projectCollaborators").execute();
    await db.deleteFrom("projects").execute();
    await db.deleteFrom("users").execute();
    await seed();
    vi.clearAllMocks();
    globalThis.refreshUserAccess = refreshUserAccess;
  });

  afterEach(() => {
    delete (globalThis as { refreshUserAccess?: unknown }).refreshUserAccess;
  });

  it("forbids an owner from demoting another owner", async () => {
    actAs(OWNER_ID);

    const res = await setRole(OTHER_OWNER_ID, "viewer");

    expect(res.status).toBe(403);
    expect(await roleOf(OTHER_OWNER_ID)).toBe("owner");
  });

  it("lets the creator demote an owner and refreshes their live access", async () => {
    actAs(CREATOR_ID);

    const res = await setRole(OWNER_ID, "viewer");

    expect(res.status).toBe(200);
    expect(await roleOf(OWNER_ID)).toBe("viewer");
    expect(refreshUserAccess).toHaveBeenCalledWith(PROJECT_ID, OWNER_ID);
  });

  it("lets an owner change an editor's role", async () => {
    actAs(OWNER_ID);

    const res = await setRole(EDITOR_ID, "viewer");

    expect(res.status).toBe(200);
    expect(await roleOf(EDITOR_ID)).toBe("viewer");
  });

  it("does not refresh live access when the role is unchanged", async () => {
    actAs(OWNER_ID);

    const res = await setRole(EDITOR_ID, "editor");

    expect(res.status).toBe(200);
    expect(refreshUserAccess).not.toHaveBeenCalled();
  });

  it("rejects assigning a collaborator role to the creator", async () => {
    actAs(OWNER_ID);

    const res = await setRole(CREATOR_ID, "viewer");

    expect(res.status).toBe(400);
    expect(await roleOf(CREATOR_ID)).toBeUndefined();
  });
});
