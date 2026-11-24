import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../mcp/auth", () => ({
  authenticateApiKey: vi.fn(),
}));

vi.mock("../mcp/tools/projects", () => ({
  checkProjectAccess: vi.fn(),
}));

import { authenticateApiKey } from "../mcp/auth";
import { checkProjectAccess } from "../mcp/tools/projects";
import { authorizeWebhookApiKey } from "./api-key-access";

const mockedAuthenticate = vi.mocked(authenticateApiKey);
const mockedCheckAccess = vi.mocked(checkProjectAccess);

describe("authorizeWebhookApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unknown API key", async () => {
    mockedAuthenticate.mockResolvedValue(null);

    await expect(
      authorizeWebhookApiKey("Bearer sk-ideon-unknown", "project-1"),
    ).resolves.toBe(false);
    expect(mockedCheckAccess).not.toHaveBeenCalled();
  });

  it("requires the editor role on the rule's project", async () => {
    mockedAuthenticate.mockResolvedValue({ userId: "user-1", keyId: "key-1" });
    mockedCheckAccess.mockResolvedValue("editor");

    await expect(
      authorizeWebhookApiKey("Bearer sk-ideon-valid", "project-1"),
    ).resolves.toBe(true);
    expect(mockedCheckAccess).toHaveBeenCalledWith(
      "user-1",
      "project-1",
      "editor",
    );
  });

  it("rejects a valid key whose owner has no access to the project", async () => {
    mockedAuthenticate.mockResolvedValue({ userId: "user-2", keyId: "key-2" });
    mockedCheckAccess.mockRejectedValue(new Error("Project not found"));

    await expect(
      authorizeWebhookApiKey("Bearer sk-ideon-other", "project-1"),
    ).resolves.toBe(false);
  });

  it("rejects a valid key whose owner is only a viewer", async () => {
    mockedAuthenticate.mockResolvedValue({ userId: "user-3", keyId: "key-3" });
    mockedCheckAccess.mockRejectedValue(
      new Error("Insufficient permissions: requires editor, has viewer"),
    );

    await expect(
      authorizeWebhookApiKey("Bearer sk-ideon-viewer", "project-1"),
    ).resolves.toBe(false);
  });
});
