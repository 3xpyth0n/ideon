import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withToolAudit } from "./tool-audit";
import { appendAuditEvent } from "../../app/lib/audit-trail";
import { mcpContextStorage } from "./context";

vi.mock("../../app/lib/audit-trail", () => ({
  appendAuditEvent: vi.fn(() => Promise.resolve()),
}));

const PROJECT = "11111111-1111-1111-1111-111111111111";
const BLOCK = "22222222-2222-2222-2222-222222222222";
const USER = "33333333-3333-3333-3333-333333333333";
const KEY = "44444444-4444-4444-4444-444444444444";

interface LooseServer {
  tool: (name: string, ...rest: unknown[]) => unknown;
}

interface FakeServer {
  server: LooseServer;
  handlers: Map<string, (...args: unknown[]) => Promise<unknown>>;
}

function makeFakeServer(): FakeServer {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const server: LooseServer = {
    tool: (name: string, ...rest: unknown[]) => {
      handlers.set(
        name,
        rest[rest.length - 1] as (...args: unknown[]) => Promise<unknown>,
      );
      return server;
    },
  };
  return { server, handlers };
}

function register(
  server: LooseServer,
  name: string,
  handler: (...args: unknown[]) => Promise<unknown>,
) {
  server.tool(
    name,
    "description",
    z.object({ projectId: z.string() }),
    handler,
  );
}

async function callTool(
  handlers: FakeServer["handlers"],
  name: string,
  args: unknown,
) {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`Tool ${name} not registered`);
  return mcpContextStorage.run({ userId: USER, keyId: KEY }, () =>
    handler(args),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withToolAudit", () => {
  it("audits a successful write tool", async () => {
    const { server, handlers } = makeFakeServer();
    withToolAudit(server as unknown as McpServer);
    register(server, "create_block", async () => ({
      content: [],
    }));

    const result = await callTool(handlers, "create_block", {
      projectId: PROJECT,
    });

    expect(result).toEqual({ content: [] });
    expect(appendAuditEvent).toHaveBeenCalledTimes(1);
    const call = vi.mocked(appendAuditEvent).mock.calls[0][0];
    expect(call.action).toBe("mcp.create_block");
    expect(call.projectId).toBe(PROJECT);
    expect(call.userId).toBe(USER);
    expect(call.entityType).toBe("block");
    expect(call.entityId).toBeNull();
    expect(call.metadata).toEqual({ tool: "create_block" });
  });

  it("does not audit read tools", async () => {
    const { server, handlers } = makeFakeServer();
    withToolAudit(server as unknown as McpServer);
    register(server, "list_blocks", async () => ({ content: [] }));

    await callTool(handlers, "list_blocks", { projectId: PROJECT });

    expect(appendAuditEvent).not.toHaveBeenCalled();
  });

  it("does not audit failed write tools", async () => {
    const { server, handlers } = makeFakeServer();
    withToolAudit(server as unknown as McpServer);
    register(server, "create_block", async () => {
      throw new Error("boom");
    });

    await expect(
      callTool(handlers, "create_block", { projectId: PROJECT }),
    ).rejects.toThrow("boom");

    expect(appendAuditEvent).not.toHaveBeenCalled();
  });

  it("extracts entity id and type from tool args", async () => {
    const { server, handlers } = makeFakeServer();
    withToolAudit(server as unknown as McpServer);
    register(server, "update_block", async () => ({ content: [] }));
    register(server, "delete_link", async () => ({ content: [] }));
    register(server, "move_kanban_task", async () => ({
      content: [],
    }));
    register(server, "manage_kanban_columns", async () => ({ content: [] }));
    register(server, "manage_kanban_fields", async () => ({
      content: [],
    }));
    register(server, "update_table_cell", async () => ({
      content: [],
    }));
    register(server, "manage_table_columns", async () => ({
      content: [],
    }));

    await callTool(handlers, "update_block", {
      projectId: PROJECT,
      blockId: BLOCK,
    });
    await callTool(handlers, "delete_link", {
      projectId: PROJECT,
      linkId: "55555555-5555-5555-5555-555555555555",
    });
    await callTool(handlers, "move_kanban_task", {
      projectId: PROJECT,
      taskId: "66666666-6666-6666-6666-666666666666",
    });
    await callTool(handlers, "manage_kanban_columns", { projectId: PROJECT });
    await callTool(handlers, "manage_kanban_fields", { projectId: PROJECT });
    await callTool(handlers, "update_table_cell", {
      projectId: PROJECT,
      rowId: "77777777-7777-7777-7777-777777777777",
    });
    await callTool(handlers, "manage_table_columns", { projectId: PROJECT });

    const calls = vi.mocked(appendAuditEvent).mock.calls.map((c) => c[0]);
    const byTool = new Map(calls.map((c) => [c.metadata?.tool as string, c]));

    expect(byTool.get("update_block")?.entityType).toBe("block");
    expect(byTool.get("update_block")?.entityId).toBe(BLOCK);
    expect(byTool.get("delete_link")?.entityType).toBe("link");
    expect(byTool.get("move_kanban_task")?.entityType).toBe("kanbanTask");
    expect(byTool.get("move_kanban_task")?.entityId).toBe(
      "66666666-6666-6666-6666-666666666666",
    );
    expect(byTool.get("manage_kanban_columns")?.entityType).toBe(
      "kanbanColumn",
    );
    expect(byTool.get("manage_kanban_fields")?.entityType).toBe("kanbanField");
    expect(byTool.get("update_table_cell")?.entityType).toBe("tableRow");
    expect(byTool.get("update_table_cell")?.entityId).toBe(
      "77777777-7777-7777-7777-777777777777",
    );
    expect(byTool.get("manage_table_columns")?.entityType).toBe("tableColumn");
  });

  it("skips tools without a projectId argument", async () => {
    const { server, handlers } = makeFakeServer();
    withToolAudit(server as unknown as McpServer);
    register(server, "create_block", async () => ({ content: [] }));

    await callTool(handlers, "create_block", {});

    expect(appendAuditEvent).not.toHaveBeenCalled();
  });
});
