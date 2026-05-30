import { describe, it, expect } from "vitest";
import { evaluateConditions } from "./conditions";

describe("evaluateConditions", () => {
  const payload = { score: 42, name: "Alice", active: true };

  it("eq matches equal values", () => {
    expect(
      evaluateConditions([{ field: "score", op: "eq", value: 42 }], payload),
    ).toBe(true);
    expect(
      evaluateConditions([{ field: "score", op: "eq", value: 99 }], payload),
    ).toBe(false);
  });

  it("neq matches non-equal values", () => {
    expect(
      evaluateConditions([{ field: "score", op: "neq", value: 99 }], payload),
    ).toBe(true);
    expect(
      evaluateConditions([{ field: "score", op: "neq", value: 42 }], payload),
    ).toBe(false);
  });

  it("contains checks substring", () => {
    expect(
      evaluateConditions(
        [{ field: "name", op: "contains", value: "Ali" }],
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(
        [{ field: "name", op: "contains", value: "Bob" }],
        payload,
      ),
    ).toBe(false);
  });

  it("exists checks for non-null presence", () => {
    expect(
      evaluateConditions([{ field: "active", op: "exists" }], payload),
    ).toBe(true);
    expect(
      evaluateConditions([{ field: "missing", op: "exists" }], payload),
    ).toBe(false);
  });

  it("gt returns true when field is greater than value", () => {
    expect(
      evaluateConditions([{ field: "score", op: "gt", value: 40 }], payload),
    ).toBe(true);
    expect(
      evaluateConditions([{ field: "score", op: "gt", value: 42 }], payload),
    ).toBe(false);
    expect(
      evaluateConditions([{ field: "score", op: "gt", value: 50 }], payload),
    ).toBe(false);
  });

  it("lt returns true when field is less than value", () => {
    expect(
      evaluateConditions([{ field: "score", op: "lt", value: 50 }], payload),
    ).toBe(true);
    expect(
      evaluateConditions([{ field: "score", op: "lt", value: 42 }], payload),
    ).toBe(false);
  });

  it("gte returns true when field is greater than or equal to value", () => {
    expect(
      evaluateConditions([{ field: "score", op: "gte", value: 42 }], payload),
    ).toBe(true);
    expect(
      evaluateConditions([{ field: "score", op: "gte", value: 43 }], payload),
    ).toBe(false);
  });

  it("lte returns true when field is less than or equal to value", () => {
    expect(
      evaluateConditions([{ field: "score", op: "lte", value: 42 }], payload),
    ).toBe(true);
    expect(
      evaluateConditions([{ field: "score", op: "lte", value: 41 }], payload),
    ).toBe(false);
  });

  it("numeric operators return false for non-numeric fields", () => {
    expect(
      evaluateConditions([{ field: "name", op: "gt", value: 10 }], payload),
    ).toBe(false);
  });

  it("multiple conditions require all to pass", () => {
    expect(
      evaluateConditions(
        [
          { field: "score", op: "gte", value: 40 },
          { field: "score", op: "lte", value: 50 },
        ],
        payload,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(
        [
          { field: "score", op: "gte", value: 40 },
          { field: "score", op: "lt", value: 42 },
        ],
        payload,
      ),
    ).toBe(false);
  });
});
