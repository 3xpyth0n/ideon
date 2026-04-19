import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { GET, POST } from "./route";
import { getDb } from "@lib/db";
import { NextRequest } from "next/server";

// Mock @auth to control the session
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

describe("Projects API", () => {
  beforeEach(async () => {
    const db = getDb();
    // Clear database before each test
    await db.deleteFrom("links").execute();
    await db.deleteFrom("blocks").execute();
    await db.deleteFrom("projects").execute();
    await db.deleteFrom("users").execute();
    vi.clearAllMocks();
  });

  it("should return 401 if user is not authenticated", async () => {
    (getAuthUser as Mock).mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/projects");
    const response = await GET(req, { params: Promise.resolve({}) });

    expect(response.status).toBe(401);
  });

  it("should return empty list if user has no projects", async () => {
    const db = getDb();
    const user = {
      id: "user-1",
      email: "user1@example.com",
      role: "member" as const,
    };
    (getAuthUser as Mock).mockResolvedValue(user);

    // Insert user into DB to avoid foreign key issues if any (though SQLite might not enforce them by default depending on setup)
    await db
      .insertInto("users")
      .values({
        id: user.id,
        email: user.email,
        username: "user1",
        role: "member",
        createdAt: new Date().toISOString(),
      })
      .execute();

    const req = new NextRequest("http://localhost/api/projects");
    const response = await GET(req, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it("should create a new project", async () => {
    const db = getDb();
    const user = {
      id: "user-1",
      email: "user1@example.com",
      role: "member" as const,
    };
    (getAuthUser as Mock).mockResolvedValue(user);

    await db
      .insertInto("users")
      .values({
        id: user.id,
        email: user.email,
        username: "user1",
        role: "member",
        createdAt: new Date().toISOString(),
      })
      .execute();

    const projectData = {
      name: "Test Project",
      description: "A test project description",
    };

    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectData),
    });

    const response = await POST(req, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBeDefined();
    expect(data.name).toBe(projectData.name);

    // Verify in DB
    const project = await db
      .selectFrom("projects")
      .selectAll()
      .where("id", "=", data.id)
      .executeTakeFirst();
    expect(project).toBeDefined();
    expect(project?.name).toBe(projectData.name);
    expect(project?.ownerId).toBe(user.id);

    const blocks = await db
      .selectFrom("blocks")
      .selectAll()
      .where("projectId", "=", data.id)
      .execute();

    const links = await db
      .selectFrom("links")
      .selectAll()
      .where("projectId", "=", data.id)
      .execute();

    expect(blocks).toHaveLength(5);
    expect(links).toHaveLength(4);

    const blockTypes = blocks.map((block) => block.blockType).sort();
    expect(blockTypes).toEqual(["checklist", "core", "github", "link", "text"]);

    const coreBlock = blocks.find((block) => block.blockType === "core");
    const checklistBlock = blocks.find(
      (block) => block.blockType === "checklist",
    );
    const linkBlock = blocks.find((block) => block.blockType === "link");
    const gitBlock = blocks.find((block) => block.blockType === "github");
    const noteBlock = blocks.find((block) => block.blockType === "text");

    expect(coreBlock?.positionX).toBe(0);
    expect(coreBlock?.positionY).toBe(0);
    expect(coreBlock?.content).toBe(projectData.name);
    expect(JSON.parse(coreBlock?.data || "{}").title).toBe(projectData.name);

    expect(checklistBlock?.positionX).toBe(-1000);
    expect(checklistBlock?.positionY).toBe(-420);
    expect(checklistBlock?.width).toBe(550);
    expect(checklistBlock?.height).toBe(400);
    expect(JSON.parse(checklistBlock?.data || "{}").title).toBe("Checklist");
    expect(JSON.parse(checklistBlock?.metadata || "{}").items).toHaveLength(3);

    expect(linkBlock?.positionX).toBe(-1000);
    expect(linkBlock?.positionY).toBe(20);
    expect(linkBlock?.width).toBe(550);
    expect(linkBlock?.height).toBe(400);
    expect(JSON.parse(linkBlock?.data || "{}").title).toBe("Link");
    expect(linkBlock?.content).toBe("https://www.theideon.com/docs/");

    expect(gitBlock?.positionX).toBe(450);
    expect(gitBlock?.positionY).toBe(-420);
    expect(gitBlock?.width).toBe(550);
    expect(gitBlock?.height).toBe(400);
    expect(JSON.parse(gitBlock?.data || "{}").title).toBe("Git Repo");
    expect(gitBlock?.content).toBe("https://github.com/3xpyth0n/ideon");
    expect(JSON.parse(gitBlock?.metadata || "{}").github.url).toBe(
      "https://github.com/3xpyth0n/ideon",
    );

    expect(noteBlock?.positionX).toBe(450);
    expect(noteBlock?.positionY).toBe(20);
    expect(noteBlock?.width).toBe(550);
    expect(noteBlock?.height).toBe(400);
    expect(JSON.parse(noteBlock?.data || "{}").title).toBe("Note");
    expect(noteBlock?.content).toContain("context");

    expect(
      links.map((link) => ({
        sourceHandle: link.sourceHandle,
        targetHandle: link.targetHandle,
      })),
    ).toEqual([
      { sourceHandle: "left", targetHandle: "right" },
      { sourceHandle: "left", targetHandle: "right" },
      { sourceHandle: "right", targetHandle: "left" },
      { sourceHandle: "right", targetHandle: "left" },
    ]);
  });

  it("should create a root project when folderId is null", async () => {
    const db = getDb();
    const user = {
      id: "user-1",
      email: "user1@example.com",
      role: "member" as const,
    };
    (getAuthUser as Mock).mockResolvedValue(user);

    await db
      .insertInto("users")
      .values({
        id: user.id,
        email: user.email,
        username: "user1",
        role: "member",
        createdAt: new Date().toISOString(),
      })
      .execute();

    const req = new NextRequest("http://localhost/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Root Project",
        description: "Created at root",
        folderId: null,
      }),
    });

    const response = await POST(req, { params: Promise.resolve({}) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.folderId).toBeNull();

    const project = await db
      .selectFrom("projects")
      .select(["id", "folderId"])
      .where("id", "=", data.id)
      .executeTakeFirst();

    expect(project).toBeDefined();
    expect(project?.folderId).toBeNull();
  });
});
