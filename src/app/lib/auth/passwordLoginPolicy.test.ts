import { describe, it, expect, vi } from "vitest";
import type { Kysely } from "kysely";
import type { database } from "../types/db";
import { isPasswordLoginEnabled } from "./passwordLoginPolicy";

function createMockDb(row: { passwordLoginEnabled: number } | undefined) {
  const executeTakeFirst = vi.fn().mockResolvedValue(row);
  const select = vi.fn().mockReturnValue({ executeTakeFirst });
  const selectFrom = vi.fn().mockReturnValue({ select });
  return { selectFrom } as unknown as Kysely<database>;
}

describe("isPasswordLoginEnabled", () => {
  it("returns false when the setting is disabled", async () => {
    await expect(
      isPasswordLoginEnabled(createMockDb({ passwordLoginEnabled: 0 })),
    ).resolves.toBe(false);
  });

  it("returns true when the setting is enabled", async () => {
    await expect(
      isPasswordLoginEnabled(createMockDb({ passwordLoginEnabled: 1 })),
    ).resolves.toBe(true);
  });

  it("defaults to enabled when no settings row exists", async () => {
    await expect(isPasswordLoginEnabled(createMockDb(undefined))).resolves.toBe(
      true,
    );
  });
});
