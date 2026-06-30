import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Y from "yjs";
import type { Node } from "@xyflow/react";
import type { BlockData } from "../../../app/components/project/CanvasBlock";

// Mock getMcpContext
vi.mock("../context", () => ({
  getMcpContext: () => ({ userId: "user-1", keyId: "key-1" }),
}));

// Mock checkProjectAccess
vi.mock("./projects", () => ({
  checkProjectAccess: vi.fn().mockResolvedValue(undefined),
}));

// We'll use real Yjs docs but mock getProjectDoc
vi.mock("../yjs-bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../yjs-bridge")>();
  return {
    ...actual,
    getProjectDoc: vi.fn(),
  };
});

import { getProjectDoc } from "../yjs-bridge";
import { checkProjectAccess } from "./projects";

// Helper to create a Yjs doc with blocks for testing
function createTestDoc(
  blocks: Array<{
    id: string;
    type?: string;
    content?: string;
    metadata?: Record<string, unknown>;
    x?: number;
    y?: number;
  }>,
): Y.Doc {
  const ydoc = new Y.Doc();
  const yBlocks = ydoc.getMap<Node<BlockData>>("blocks");

  for (const block of blocks) {
    yBlocks.set(block.id, {
      id: block.id,
      type: block.type ?? "text",
      position: { x: block.x ?? 0, y: block.y ?? 0 },
      data: {
        blockType: block.type ?? "text",
        content: block.content ?? "",
        ownerId: "user-1",
        metadata: block.metadata,
      },
    } as unknown as Node<BlockData>);
  }

  return ydoc;
}

// We need to test the tool callback directly. Let's import and call the register
// function on a mock server, then capture the callback.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchTools } from "./search";

describe("search_blocks tool", () => {
  let toolCallback: (params: { projectId: string; query: string }) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Capture the tool callback by mocking McpServer.tool
    const mockServer = {
      tool: vi.fn(),
    } as unknown as McpServer;

    registerSearchTools(mockServer, {} as never);

    // The tool() call: (name, description, schema, callback)
    const toolCall = (mockServer.tool as ReturnType<typeof vi.fn>).mock
      .calls[0];
    toolCallback = toolCall[3]; // callback is the 4th argument
  });

  it("validates query length (too short after trim)", async () => {
    await expect(
      toolCallback({ projectId: "proj-1", query: "   " }),
    ).rejects.toThrow(/between 1 and 200 characters/);
  });

  it("validates query length (too long)", async () => {
    const longQuery = "a".repeat(201);
    await expect(
      toolCallback({ projectId: "proj-1", query: longQuery }),
    ).rejects.toThrow(/between 1 and 200 characters/);
  });

  it("accepts query at max length (200 chars)", async () => {
    const doc = createTestDoc([{ id: "b1", content: "a".repeat(300) }]);
    vi.mocked(getProjectDoc).mockResolvedValue({ ydoc: doc, isLive: false });

    const result = await toolCallback({
      projectId: "proj-1",
      query: "a".repeat(200),
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toHaveLength(1);
  });

  it("returns matching blocks by content (case-insensitive)", async () => {
    const doc = createTestDoc([
      { id: "b1", content: "Hello World", x: 10, y: 20 },
      { id: "b2", content: "Goodbye World", x: 100, y: 200 },
      { id: "b3", content: "No match here" },
    ]);
    vi.mocked(getProjectDoc).mockResolvedValue({ ydoc: doc, isLive: false });

    const result = await toolCallback({
      projectId: "proj-1",
      query: "world",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].id).toBe("b1");
    expect(parsed.results[0].type).toBe("text");
    expect(parsed.results[0].x).toBe(10);
    expect(parsed.results[0].y).toBe(20);
    expect(parsed.results[1].id).toBe("b2");
  });

  it("returns matching blocks by metadata", async () => {
    const doc = createTestDoc([
      { id: "b1", content: "no match", metadata: { tag: "important" } },
      { id: "b2", content: "no match", metadata: { tag: "trivial" } },
    ]);
    vi.mocked(getProjectDoc).mockResolvedValue({ ydoc: doc, isLive: false });

    const result = await toolCallback({
      projectId: "proj-1",
      query: "important",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].id).toBe("b1");
  });

  it("provides contentPreview (max 200 chars)", async () => {
    const longContent = "x".repeat(500);
    const doc = createTestDoc([{ id: "b1", content: longContent }]);
    vi.mocked(getProjectDoc).mockResolvedValue({ ydoc: doc, isLive: false });

    const result = await toolCallback({
      projectId: "proj-1",
      query: "xxx",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results[0].contentPreview).toHaveLength(200);
  });

  it("provides matchContext with surrounding text", async () => {
    const content =
      "The quick brown fox jumps over the lazy dog and then runs through the forest";
    const doc = createTestDoc([{ id: "b1", content }]);
    vi.mocked(getProjectDoc).mockResolvedValue({ ydoc: doc, isLive: false });

    const result = await toolCallback({
      projectId: "proj-1",
      query: "lazy dog",
    });
    const parsed = JSON.parse(result.content[0].text);

    const ctx = parsed.results[0].matchContext;
    expect(ctx).toContain("lazy dog");
    // Context should be roughly 100 chars (50 before + match + 50 after)
    expect(ctx.length).toBeLessThanOrEqual(120);
  });

  it("limits results to 50", async () => {
    const blocks = Array.from({ length: 60 }, (_, i) => ({
      id: `b${i}`,
      content: `Match term here ${i}`,
    }));
    const doc = createTestDoc(blocks);
    vi.mocked(getProjectDoc).mockResolvedValue({ ydoc: doc, isLive: false });

    const result = await toolCallback({
      projectId: "proj-1",
      query: "Match term",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(50);
  });

  it("returns empty results when nothing matches", async () => {
    const doc = createTestDoc([{ id: "b1", content: "Hello World" }]);
    vi.mocked(getProjectDoc).mockResolvedValue({ ydoc: doc, isLive: false });

    const result = await toolCallback({
      projectId: "proj-1",
      query: "nonexistent",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(0);
  });

  it("checks project access with viewer role", async () => {
    const doc = createTestDoc([]);
    vi.mocked(getProjectDoc).mockResolvedValue({ ydoc: doc, isLive: false });

    await toolCallback({ projectId: "proj-1", query: "test" });

    expect(checkProjectAccess).toHaveBeenCalledWith(
      "user-1",
      "proj-1",
      "viewer",
    );
  });

  it("trims whitespace from query before matching", async () => {
    const doc = createTestDoc([{ id: "b1", content: "hello world" }]);
    vi.mocked(getProjectDoc).mockResolvedValue({ ydoc: doc, isLive: false });

    const result = await toolCallback({
      projectId: "proj-1",
      query: "  hello  ",
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results).toHaveLength(1);
  });
});
