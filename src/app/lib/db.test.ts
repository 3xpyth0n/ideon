import { describe, it, expect } from "vitest";
import { getDb } from "./db";

describe("database integration", () => {
  it("should be able to query the users table in-memory", async () => {
    const db = getDb();
    const result = await db
      .selectFrom("users")
      .select(({ fn }) => fn.count<number>("id").as("count"))
      .executeTakeFirst();

    // Should be 0 since it's a fresh in-memory DB
    expect(Number(result?.count || 0)).toBe(0);
  });

  it("should be able to insert and retrieve a user", async () => {
    const db = getDb();
    const testUser = {
      id: "test-user-id",
      email: "test@example.com",
      username: "testuser",
      displayName: "Test User",
      role: "member" as const,
      color: "#000000",
      createdAt: new Date().toISOString(),
    };

    await db.insertInto("users").values(testUser).execute();

    const user = await db
      .selectFrom("users")
      .selectAll()
      .where("id", "=", "test-user-id")
      .executeTakeFirst();
    expect(user).toBeDefined();
    expect(user?.email).toBe("test@example.com");
  });
});
