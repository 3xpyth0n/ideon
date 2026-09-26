import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { resolveCommittedTitle } from "./subcanvas/subCanvasUtils";

describe("Title whitespace rejection — resolveCommittedTitle", () => {
  it("rejects any whitespace-only/empty submission, preserving the previous title", () => {
    const whitespaceArb = fc
      .array(fc.constantFrom(" ", "\t", "\n", "\r"), {
        minLength: 0,
        maxLength: 100,
      })
      .map((parts) => parts.join(""));
    const previousTitleArb = fc.string({ minLength: 0, maxLength: 100 });

    fc.assert(
      fc.property(whitespaceArb, previousTitleArb, (submitted, previous) => {
        const result = resolveCommittedTitle(submitted, previous);
        expect(result.changed).toBe(false);
        expect(result.title).toBe(previous);
      }),
      { numRuns: 100 },
    );
  });

  it("commits a trimmed non-whitespace title", () => {
    const wordArb = fc
      .array(
        fc.constantFrom("a", "b", "c", "1", "2", "3", "A", "B", "C", "-", "_"),
        { minLength: 1, maxLength: 50 },
      )
      .map((chars) => chars.join(""));
    fc.assert(
      fc.property(wordArb, fc.constantFrom("", " ", "\t"), (word, wrapper) => {
        const submitted = `${wrapper}${word}${wrapper}`;
        const previous = "old";
        const result = resolveCommittedTitle(submitted, previous);
        expect(result.changed).toBe(true);
        expect(result.title).toBe(word);
      }),
      { numRuns: 100 },
    );
  });
});
