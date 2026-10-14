import { describe, expect, it } from "vitest";
import { VALID_BLOCK_TYPES } from "./blocks";

describe("MCP block types", () => {
  it("allows Mermaid blocks through the shared create schemas", () => {
    expect(VALID_BLOCK_TYPES).toContain("mermaid");
  });
});
