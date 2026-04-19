import { beforeEach, describe, expect, it, Mock, vi } from "vitest";
import { NextRequest } from "next/server";
import { getDb } from "@lib/db";
import { GET } from "./route";

vi.mock("@auth", () => ({
  getAuthUser: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue("127.0.0.1"),
  }),
}));

import { getAuthUser } from "@auth";

describe("Folders API", () => {
  beforeEach(async () => {
    const db = getDb();
    await db.deleteFrom("projects").execute();
    await db.deleteFrom("folderCollaborators").execute();
    await db.deleteFrom("folders").execute();
    await db.deleteFrom("users").execute();
    vi.clearAllMocks();
  });

  it("returns recursive project counts for top-level folders", async () => {
    const db = getDb();
    const user = {
      id: "user-1",
      email: "user1@example.com",
      role: "member" as const,
    };
    const now = new Date().toISOString();

    (getAuthUser as Mock).mockResolvedValue(user);

    await db
      .insertInto("users")
      .values({
        id: user.id,
        email: user.email,
        username: "user1",
        role: "member",
        createdAt: now,
      })
      .execute();

    await db
      .insertInto("folders")
      .values([
        {
          id: "folder-root",
          name: "Root folder",
          ownerId: user.id,
          parentFolderId: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "folder-child",
          name: "Child folder",
          ownerId: user.id,
          parentFolderId: "folder-root",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "folder-sibling",
          name: "Sibling folder",
          ownerId: user.id,
          parentFolderId: null,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    await db
      .insertInto("projects")
      .values([
        {
          id: "project-root",
          name: "Root project",
          description: null,
          ownerId: user.id,
          folderId: "folder-root",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "project-child-1",
          name: "Child project 1",
          description: null,
          ownerId: user.id,
          folderId: "folder-child",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "project-child-2",
          name: "Child project 2",
          description: null,
          ownerId: user.id,
          folderId: "folder-child",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "project-deleted-child",
          name: "Deleted child project",
          description: null,
          ownerId: user.id,
          folderId: "folder-child",
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
        },
        {
          id: "project-sibling",
          name: "Sibling project",
          description: null,
          ownerId: user.id,
          folderId: "folder-sibling",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    const request = new NextRequest(
      "http://localhost/api/folders?view=my-projects",
    );
    const response = await GET(request, { params: Promise.resolve({}) });
    const data = (await response.json()) as Array<{
      id: string;
      projectCount: number;
    }>;

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "folder-root",
          projectCount: 3,
        }),
        expect.objectContaining({
          id: "folder-sibling",
          projectCount: 1,
        }),
      ]),
    );
    expect(data).toHaveLength(2);
  });
});
