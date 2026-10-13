import { describe, it, expect } from "vitest";
import { assertValidCell, assertValidColumnOrder } from "./table";
import { ValidationError } from "../errors";
import type { TableColumn } from "../../../app/components/project/tableModel";

// The shared parser, exporters, and cell-value helpers are tested in
// tableModel.test.ts. These tests cover the MCP-specific helpers that sit
// between the tools and the shared model: cell validation re-raised as
// the MCP ValidationError, and reorder validation.

describe("assertValidCell", () => {
  const textColumn: TableColumn = { id: "c1", name: "Name", type: "text" };
  const numberColumn: TableColumn = { id: "c2", name: "Count", type: "number" };
  const relationColumn: TableColumn = {
    id: "c3",
    name: "Ref",
    type: "relation",
  };

  it("returns the value for matching column types", () => {
    expect(assertValidCell(textColumn, "hello", new Set())).toBe("hello");
    expect(assertValidCell(numberColumn, 42, new Set())).toBe(42);
    expect(
      assertValidCell(relationColumn, { blockId: "b1" }, new Set(["b1"])),
    ).toEqual({ blockId: "b1" });
  });

  it("throws ValidationError on type mismatch", () => {
    expect(() => assertValidCell(numberColumn, "5", new Set())).toThrow(
      ValidationError,
    );
    expect(() => assertValidCell(textColumn, 5, new Set())).toThrow(
      ValidationError,
    );
    expect(() => assertValidCell(relationColumn, "b1", new Set())).toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError for unknown relation targets", () => {
    expect(() =>
      assertValidCell(relationColumn, { blockId: "missing" }, new Set(["b1"])),
    ).toThrow(ValidationError);
  });

  it("accepts null to clear a cell", () => {
    expect(assertValidCell(numberColumn, null, new Set())).toBeNull();
  });
});

describe("assertValidColumnOrder", () => {
  const existing = ["c1", "c2", "c3"];

  it("accepts a complete permutation", () => {
    expect(() =>
      assertValidColumnOrder(["c3", "c1", "c2"], existing),
    ).not.toThrow();
  });

  it("rejects a missing column id", () => {
    expect(() => assertValidColumnOrder(["c1", "c2"], existing)).toThrow(
      ValidationError,
    );
  });

  it("rejects an unknown column id", () => {
    expect(() =>
      assertValidColumnOrder(["c1", "c2", "c3", "c4"], existing),
    ).toThrow(ValidationError);
  });

  it("rejects duplicate column ids", () => {
    expect(() => assertValidColumnOrder(["c1", "c1", "c2"], existing)).toThrow(
      ValidationError,
    );
  });
});
