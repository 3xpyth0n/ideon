import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";
import { authenticateApiKey } from "./auth";

// Mock getGlobalDb
vi.mock("../../app/lib/db", () => ({
  getGlobalDb: vi.fn(),
}));

import { getGlobalDb } from "../../app/lib/db";

const mockedGetGlobalDb = vi.mocked(getGlobalDb);

function createMockDb(result: { id: string; userId: string } | undefined) {
  const execute = vi.fn().mockResolvedValue(undefined);
  const updateWhere = vi.fn().mockReturnValue({ execute });
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const updateTable = vi.fn().mockReturnValue({ set: updateSet });

  const executeTakeFirst = vi.fn().mockResolvedValue(result);
  const selectWhere = vi.fn().mockReturnValue({ executeTakeFirst });
  const select = vi.fn().mockReturnValue({ where: selectWhere });
  const selectFrom = vi.fn().mockReturnValue({ select });

  return {
    selectFrom,
    updateTable,
  } as unknown as ReturnType<typeof getGlobalDb>;
}

describe("auth - authenticateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns userId and keyId for a valid API key", async () => {
    const rawKey = "sk-ideon-test-key-12345";
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const mockResult = { id: "key-abc", userId: "user-xyz" };
    const mockDb = createMockDb(mockResult);
    mockedGetGlobalDb.mockReturnValue(mockDb);

    const result = await authenticateApiKey(`Bearer ${rawKey}`);

    expect(result).toEqual({ userId: "user-xyz", keyId: "key-abc" });

    // Verify correct hash was used in the query
    expect(mockDb.selectFrom).toHaveBeenCalledWith("apiKeys");
    const selectReturn = (mockDb.selectFrom as ReturnType<typeof vi.fn>).mock
      .results[0].value;
    const selectFn = selectReturn.select;
    expect(selectFn).toHaveBeenCalledWith(["id", "userId"]);
    const whereReturn = selectFn.mock.results[0].value;
    expect(whereReturn.where).toHaveBeenCalledWith("keyHash", "=", keyHash);
  });

  it("returns null when Authorization header is undefined", async () => {
    const result = await authenticateApiKey(undefined);
    expect(result).toBeNull();
  });

  it("returns null when Authorization header is missing Bearer prefix", async () => {
    const result = await authenticateApiKey("sk-ideon-test-key");
    expect(result).toBeNull();
  });

  it("returns null when token has wrong prefix (not sk-ideon-)", async () => {
    const result = await authenticateApiKey("Bearer sk-other-test-key");
    expect(result).toBeNull();
  });

  it("returns null when key hash is not found in database", async () => {
    const mockDb = createMockDb(undefined);
    mockedGetGlobalDb.mockReturnValue(mockDb);

    const result = await authenticateApiKey("Bearer sk-ideon-unknown-key");
    expect(result).toBeNull();
  });

  it("updates lastUsedAt on successful authentication", async () => {
    const rawKey = "sk-ideon-valid-key-999";
    const mockResult = { id: "key-update-test", userId: "user-update" };
    const mockDb = createMockDb(mockResult);
    mockedGetGlobalDb.mockReturnValue(mockDb);

    await authenticateApiKey(`Bearer ${rawKey}`);

    // Verify updateTable was called for lastUsedAt
    expect(mockDb.updateTable).toHaveBeenCalledWith("apiKeys");
  });
});
