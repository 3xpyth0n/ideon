/**
 * Error handling layer for the MCP server.
 *
 * Provides custom error classes, a uniform error mapper that converts
 * exceptions into JSON-RPC error codes, and a content size validator.
 */

import { ZodError } from "zod";
import { logger } from "../../app/lib/logger";

// ─── Error Codes ─────────────────────────────────────────────────────────────

export const MCP_ERROR_CODES = {
  INVALID_PARAMS: -32602, // Zod validation failure
  NOT_FOUND: -32003, // Resource not found
  PERMISSION_DENIED: -32002, // Insufficient permissions
  INTERNAL_ERROR: -32603, // Internal server error
  VALIDATION_ERROR: -32004, // Business validation error
} as const;

// ─── Base Error ──────────────────────────────────────────────────────────────

export class McpError extends Error {
  constructor(
    message: string,
    public readonly code: number,
  ) {
    super(message);
    this.name = "McpError";
  }
}

// ─── Custom Error Classes ────────────────────────────────────────────────────

export class NotFoundError extends McpError {
  constructor(message = "Resource not found") {
    super(message, MCP_ERROR_CODES.NOT_FOUND);
    this.name = "NotFoundError";
  }
}

export class PermissionError extends McpError {
  constructor(message = "Insufficient permissions") {
    super(message, MCP_ERROR_CODES.PERMISSION_DENIED);
    this.name = "PermissionError";
  }
}

export class ValidationError extends McpError {
  constructor(message = "Validation failed") {
    super(message, MCP_ERROR_CODES.VALIDATION_ERROR);
    this.name = "ValidationError";
  }
}

// ─── Error Mapper ────────────────────────────────────────────────────────────

export interface MappedError {
  code: number;
  message: string;
}

/**
 * Maps any thrown error into a structured `{ code, message }` suitable for
 * JSON-RPC error responses. Internal/unknown errors are logged and a generic
 * message is returned to the client.
 */
export function mapError(err: unknown): MappedError {
  if (err instanceof ZodError) {
    const fields = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return {
      code: MCP_ERROR_CODES.INVALID_PARAMS,
      message: `Invalid parameters: ${fields.join("; ")}`,
    };
  }

  if (err instanceof NotFoundError) {
    return { code: err.code, message: err.message };
  }

  if (err instanceof PermissionError) {
    return { code: err.code, message: err.message };
  }

  if (err instanceof ValidationError) {
    return { code: err.code, message: err.message };
  }

  if (err instanceof McpError) {
    return { code: err.code, message: err.message };
  }

  // Internal / unknown error — log full details, return generic message
  logger.error({ err }, "[MCP] Internal error");
  return {
    code: MCP_ERROR_CODES.INTERNAL_ERROR,
    message: "Internal server error",
  };
}

// ─── Content Size Validator ──────────────────────────────────────────────────

const MAX_CONTENT_SIZE = 100_000;

/**
 * Validates that content does not exceed the 100k character limit.
 * Throws `ValidationError` if content is too long.
 */
export function validateContentSize(content: string | undefined): void {
  if (content !== undefined && content.length > MAX_CONTENT_SIZE) {
    throw new ValidationError(
      `Content exceeds maximum size of ${MAX_CONTENT_SIZE} characters (got ${content.length})`,
    );
  }
}
