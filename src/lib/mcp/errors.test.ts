import { describe, it, expect, vi } from "vitest";
import { ZodError, z } from "zod";
import {
  McpError,
  NotFoundError,
  PermissionError,
  ValidationError,
  MCP_ERROR_CODES,
  mapError,
  validateContentSize,
} from "./errors";

vi.mock("../../app/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("errors", () => {
  describe("error classes", () => {
    it("McpError extends Error with code", () => {
      const err = new McpError("test", -32000);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("McpError");
      expect(err.message).toBe("test");
      expect(err.code).toBe(-32000);
    });

    it("NotFoundError has correct defaults", () => {
      const err = new NotFoundError();
      expect(err).toBeInstanceOf(McpError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("NotFoundError");
      expect(err.message).toBe("Resource not found");
      expect(err.code).toBe(MCP_ERROR_CODES.NOT_FOUND);
    });

    it("NotFoundError accepts custom message", () => {
      const err = new NotFoundError("Project not found");
      expect(err.message).toBe("Project not found");
      expect(err.code).toBe(MCP_ERROR_CODES.NOT_FOUND);
    });

    it("PermissionError has correct defaults", () => {
      const err = new PermissionError();
      expect(err).toBeInstanceOf(McpError);
      expect(err.name).toBe("PermissionError");
      expect(err.message).toBe("Insufficient permissions");
      expect(err.code).toBe(MCP_ERROR_CODES.PERMISSION_DENIED);
    });

    it("ValidationError has correct defaults", () => {
      const err = new ValidationError();
      expect(err).toBeInstanceOf(McpError);
      expect(err.name).toBe("ValidationError");
      expect(err.message).toBe("Validation failed");
      expect(err.code).toBe(MCP_ERROR_CODES.VALIDATION_ERROR);
    });
  });

  describe("MCP_ERROR_CODES", () => {
    it("has the expected code values", () => {
      expect(MCP_ERROR_CODES.INVALID_PARAMS).toBe(-32602);
      expect(MCP_ERROR_CODES.NOT_FOUND).toBe(-32003);
      expect(MCP_ERROR_CODES.PERMISSION_DENIED).toBe(-32002);
      expect(MCP_ERROR_CODES.INTERNAL_ERROR).toBe(-32603);
      expect(MCP_ERROR_CODES.VALIDATION_ERROR).toBe(-32004);
    });
  });

  describe("mapError", () => {
    it("maps ZodError to INVALID_PARAMS (-32602)", () => {
      const schema = z.object({ name: z.string() });
      let zodErr: ZodError | undefined;
      try {
        schema.parse({ name: 123 });
      } catch (e) {
        zodErr = e as ZodError;
      }
      const result = mapError(zodErr!);
      expect(result.code).toBe(-32602);
      expect(result.message).toContain("Invalid parameters");
      expect(result.message).toContain("name");
    });

    it("maps NotFoundError to NOT_FOUND (-32003)", () => {
      const result = mapError(new NotFoundError("Block not found"));
      expect(result.code).toBe(-32003);
      expect(result.message).toBe("Block not found");
    });

    it("maps PermissionError to PERMISSION_DENIED (-32002)", () => {
      const result = mapError(new PermissionError("Not an editor"));
      expect(result.code).toBe(-32002);
      expect(result.message).toBe("Not an editor");
    });

    it("maps ValidationError to VALIDATION_ERROR (-32004)", () => {
      const result = mapError(new ValidationError("Content too long"));
      expect(result.code).toBe(-32004);
      expect(result.message).toBe("Content too long");
    });

    it("maps generic McpError preserving its code", () => {
      const result = mapError(new McpError("custom", -32099));
      expect(result.code).toBe(-32099);
      expect(result.message).toBe("custom");
    });

    it("maps unknown errors to INTERNAL_ERROR (-32603) with generic message", async () => {
      const { logger } = await import("../../app/lib/logger");
      const result = mapError(new Error("db connection lost"));
      expect(result.code).toBe(-32603);
      expect(result.message).toBe("Internal server error");
      expect(logger.error).toHaveBeenCalled();
    });

    it("maps non-Error values to INTERNAL_ERROR (-32603)", async () => {
      const { logger } = await import("../../app/lib/logger");
      const result = mapError("string error");
      expect(result.code).toBe(-32603);
      expect(result.message).toBe("Internal server error");
      expect(logger.error).toHaveBeenCalled();
    });

    it("maps null/undefined to INTERNAL_ERROR (-32603)", () => {
      expect(mapError(null).code).toBe(-32603);
      expect(mapError(undefined).code).toBe(-32603);
    });
  });

  describe("validateContentSize", () => {
    it("does nothing for undefined content", () => {
      expect(() => validateContentSize(undefined)).not.toThrow();
    });

    it("does nothing for empty string", () => {
      expect(() => validateContentSize("")).not.toThrow();
    });

    it("does nothing for content at the limit (100k)", () => {
      const content = "a".repeat(100_000);
      expect(() => validateContentSize(content)).not.toThrow();
    });

    it("throws ValidationError for content exceeding 100k", () => {
      const content = "a".repeat(100_001);
      expect(() => validateContentSize(content)).toThrow(ValidationError);
    });

    it("includes size info in the error message", () => {
      const content = "a".repeat(100_001);
      try {
        validateContentSize(content);
      } catch (e) {
        expect((e as ValidationError).message).toContain("100000");
        expect((e as ValidationError).message).toContain("100001");
      }
    });
  });
});
