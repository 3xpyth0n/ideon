import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateCommentText } from "./validation";
import { truncateDisplayName, truncateCommentText } from "./truncateText";

/**
 * Feature: note-comments, Property 2: Comment and Reply Text Validation
 * Validates: Requirements 2.4, 6.3, 6.4
 */
describe("Property 2: Comment and Reply Text Validation", () => {
  it("rejects all whitespace-only strings (including empty, spaces, tabs, newlines, zero-width spaces)", () => {
    const whitespaceChars = [
      " ",
      "\t",
      "\n",
      "\r",
      "\f",
      "\v",
      "\u200B",
      "\uFEFF",
      "\u00A0",
      "\u2000",
      "\u2001",
      "\u2002",
      "\u2003",
      "\u2004",
      "\u2005",
      "\u2006",
      "\u2007",
      "\u2008",
      "\u2009",
      "\u200A",
      "\u202F",
      "\u205F",
      "\u3000",
    ];

    const whitespaceArbitrary = fc
      .array(fc.constantFrom(...whitespaceChars), {
        minLength: 0,
        maxLength: 50,
      })
      .map((chars) => chars.join(""));

    fc.assert(
      fc.property(whitespaceArbitrary, (whitespaceStr) => {
        const result = validateCommentText(whitespaceStr);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("Comment cannot be empty");
      }),
      { numRuns: 100 },
    );
  });

  it("rejects all strings exceeding 2000 characters", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 2001, maxLength: 5000 }),
        (longStr) => {
          const result = validateCommentText(longStr);
          expect(result.valid).toBe(false);
          expect(result.reason).toBe("Comment exceeds 2000 character limit");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("accepts all strings with at least one non-whitespace character and length ≤ 2000", () => {
    const nonWhitespaceChar = fc
      .integer({ min: 0x21, max: 0x7e })
      .map((code) => String.fromCharCode(code));

    const validCommentText = fc
      .tuple(
        fc.string({ minLength: 0, maxLength: 999 }),
        nonWhitespaceChar,
        fc.string({ minLength: 0, maxLength: 999 }),
      )
      .map(([prefix, nonWs, suffix]) => {
        const combined = prefix + nonWs + suffix;
        return combined.slice(0, 2000);
      });

    fc.assert(
      fc.property(validCommentText, (text) => {
        const result = validateCommentText(text);
        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: note-comments, Property 13: Text Truncation
 * Validates: Requirements 5.1, 5.4
 */
describe("Property 13: Text Truncation", () => {
  describe("truncateDisplayName", () => {
    it("for any string with length > 20, returns first 20 chars followed by ellipsis (length 21)", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 21, maxLength: 200 }), (name) => {
          const result = truncateDisplayName(name);
          expect(result).toBe(name.slice(0, 20) + "\u2026");
          expect(result.length).toBe(21);
        }),
        { numRuns: 100 },
      );
    });

    it("for any string with length <= 20, returns the string unchanged", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 20 }), (name) => {
          const result = truncateDisplayName(name);
          expect(result).toBe(name);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("truncateCommentText", () => {
    it("for any string with length > 300, returns { truncated: first 300 chars + ellipsis, isOverflow: true }", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 301, maxLength: 1000 }), (text) => {
          const result = truncateCommentText(text);
          expect(result.truncated).toBe(text.slice(0, 300) + "\u2026");
          expect(result.isOverflow).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it("for any string with length <= 300, returns { truncated: original string, isOverflow: false }", () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 300 }), (text) => {
          const result = truncateCommentText(text);
          expect(result.truncated).toBe(text);
          expect(result.isOverflow).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });
});
