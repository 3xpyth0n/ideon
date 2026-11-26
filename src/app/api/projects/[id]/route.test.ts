import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "./route";
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

const PROJECT_ID = "22222222-3333-4444-8555-666666666666";
const CREATOR_ID = "creator-user-1";
const OWNER_ID = "owner-user-1";
const CREATOR_FOLDER_ID = "33333333-4444-4555-8666-777777777777";
const OWNER_FOLDER_ID = "44444444-5555-4666-8777-888888888888";

async function seed() {
  const db = getDb();
  const now = new Date().toISOString();

  for (const [id, email] of [
    [CREATOR_ID, "creator@example.com"],
    [OWNER_ID, "owner@example.com"],
  ] as const) {
    await db
      .insertInto("users")
      .values({ id, email, username: id, role: "member", createdAt: now })
      .execute();
  }

  await db
    .insertInto("folders")
    .values([
      { id: CREATOR_FOLDER_ID, name: "Creator folder", ownerId: CREATOR_ID },
      { id: OWNER_FOLDER_ID, name: "Owner folder", ownerId: OWNER_ID },
    ])
    .execute();

  await db
    .insertInto("projects")
    .values({
      id: PROJECT_ID,
      name: "Move test project",
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
    .values({
      projectId: PROJECT_ID,
      userId: OWNER_ID,
      role: "owner",
      createdAt: now,
    })
    .execute();
}

function moveRequest(folderId: string | null) {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId }),
  });
}

function actAs(id: string) {
  (getAuthUser as Mock).mockResolvedValue({
    id,
    email: `${id}@example.com`,
    role: "member",
  });
}

async function currentFolderId() {
  const project = await getDb()
    .selectFrom("projects")
    .select("folderId")
    .where("id", "=", PROJECT_ID)
    .executeTakeFirstOrThrow();
  return project.folderId;
}

describe("PATCH /api/projects/[id] folder move", () => {
  beforeEach(async () => {
    const db = getDb();
    await db.deleteFrom("projectCollaborators").execute();
    await db.deleteFrom("projects").execute();
    await db.deleteFrom("folderCollaborators").execute();
    await db.deleteFrom("folders").execute();
    await db.deleteFrom("users").execute();
    await seed();
    vi.clearAllMocks();
  });

  it("lets the creator move the project into their folder", async () => {
    actAs(CREATOR_ID);

    const res = await PATCH(moveRequest(CREATOR_FOLDER_ID), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });

    expect(res.status).toBe(200);
    expect(await currentFolderId()).toBe(CREATOR_FOLDER_ID);
  });

  it("forbids a project owner from moving the project into their own folder", async () => {
    actAs(OWNER_ID);

    const res = await PATCH(moveRequest(OWNER_FOLDER_ID), {
      params: Promise.resolve({ id: PROJECT_ID }),
    });

    expect(res.status).toBe(403);
    expect(await currentFolderId()).toBeNull();
  });
});
