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
}));

import { getAuthUser } from "@auth";

describe("Projects API", () => {
  beforeEach(async () => {
    const db = getDb();
    // Clear database before each test
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
  });
});
