/**
 * MCP request context using AsyncLocalStorage.
 *
 * Stores the authenticated user identity (userId, keyId) for the duration
 * of each MCP request. Tools can call `getMcpContext()` to retrieve the
 * current user without needing explicit parameter passing.
 */

import { AsyncLocalStorage } from "async_hooks";

export interface McpContext {
  userId: string;
  keyId: string;
}

export const mcpContextStorage = new AsyncLocalStorage<McpContext>();

/**
 * Returns the current MCP request context (userId/keyId).
 * Throws if called outside of an MCP request handler.
 */
export function getMcpContext(): McpContext {
  const ctx = mcpContextStorage.getStore();
  if (!ctx) {
    throw new Error("getMcpContext() called outside of MCP request context");
  }
  return ctx;
}
