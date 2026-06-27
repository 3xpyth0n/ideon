/**
 * MCP HTTP handler.
 *
 * Integrates with the existing custom HTTP server (src/server.ts).
 * Handles POST /api/mcp requests: validates method, content-type, body size,
 * authenticates the API key, applies rate limiting, then delegates to the
 * MCP SDK StreamableHTTPServerTransport.
 */

import type { IncomingMessage, ServerResponse } from "http";
import type { LeveldbPersistence } from "y-leveldb";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authenticateApiKey } from "./auth";
import { checkRateLimit, MAX_REQUESTS } from "./rate-limiter";
import { createMcpServer } from "./server";
import { mcpContextStorage } from "./context";

/** Maximum request body size: 1 MB */
const MAX_BODY_SIZE = 1024 * 1024;

/**
 * Sets rate limit headers on the response.
 */
function setRateLimitHeaders(
  res: ServerResponse,
  remaining: number,
  resetAt: number,
): void {
  res.setHeader("X-RateLimit-Limit", MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, remaining));
  res.setHeader("X-RateLimit-Reset", resetAt);
}

/**
 * Sends a JSON-RPC error response.
 */
function sendJsonRpcError(
  res: ServerResponse,
  statusCode: number,
  code: number,
  message: string,
): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
  );
}

/**
 * Reads the request body with a size limit.
 * Returns the raw body string, or null if the body exceeds the limit.
 */
function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (size > MAX_BODY_SIZE) {
        resolve(null);
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });

    req.on("error", () => {
      resolve(null);
    });
  });
}

/**
 * Handles an incoming MCP HTTP request.
 *
 * Pipeline:
 * 1. Method check: POST only (else 405)
 * 2. Content-Type check: application/json (else 415)
 * 3. Body size: max 1MB (else 400)
 * 4. Authentication: API key (else 401)
 * 5. Rate limit (else 429)
 * 6. Delegate to SDK StreamableHTTPServerTransport
 */
export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ldb: LeveldbPersistence,
): Promise<void> {
  // 1. Method check
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJsonRpcError(res, 405, -32600, "Method not allowed. Use POST.");
    return;
  }

  // 2. Content-Type check
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("application/json")) {
    sendJsonRpcError(
      res,
      415,
      -32600,
      "Unsupported Media Type. Use application/json.",
    );
    return;
  }

  // 3. Read body (max 1MB)
  const rawBody = await readBody(req);
  if (rawBody === null) {
    sendJsonRpcError(res, 400, -32600, "Request body too large. Max 1MB.");
    return;
  }

  // Parse JSON
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    sendJsonRpcError(res, 400, -32600, "Invalid JSON in request body.");
    return;
  }

  // 4. Authentication
  const authResult = await authenticateApiKey(req.headers.authorization);
  if (!authResult) {
    sendJsonRpcError(
      res,
      401,
      -32001,
      "Authentication failed. Invalid or missing API key.",
    );
    return;
  }

  // 5. Rate limit
  const rateLimitResult = checkRateLimit(authResult.keyId);
  setRateLimitHeaders(res, rateLimitResult.remaining, rateLimitResult.resetAt);

  if (!rateLimitResult.allowed) {
    if (rateLimitResult.retryAfter) {
      res.setHeader("Retry-After", rateLimitResult.retryAfter);
    }
    sendJsonRpcError(res, 429, -32600, "Rate limit exceeded. Try again later.");
    return;
  }

  // 6. Delegate to SDK transport — create a fresh server per request
  //    (Streamable HTTP stateless mode requires a new server↔transport pair)
  const mcpServer = createMcpServer(ldb);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless mode
  });

  await mcpServer.connect(transport);

  // Run within AsyncLocalStorage context so tools can access userId
  await mcpContextStorage.run(
    { userId: authResult.userId, keyId: authResult.keyId },
    async () => {
      await transport.handleRequest(req, res, parsedBody);
    },
  );

  // Close the transport after the request is handled
  await transport.close();
}
