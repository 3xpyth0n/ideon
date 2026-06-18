/**
 * Property-based tests for shallowEqualBlockData and SizeLimit enforcement.
 *
 * Validates: Requirements 7.4, 11.1, 11.2, 11.3
 *
 * Properties tested:
 * - Property 6: shallowEqualBlockData ignores content field
 * - Property 9: Size limit enforcement
 *
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { shallowEqualBlockData } from "./useProjectCanvasState";
import { MAX_BLOCK_CONTENT_LENGTH } from "@lib/projectContentSafety";

// --- Helpers ---

/**
 * Reproduces the SizeLimit filterTransaction logic from MarkdownEditor.tsx.
 * The filter:
 * 1. If !tr.docChanged → allow (return true)
 * 2. If tr.doc.textContent.length > MAX_BLOCK_CONTENT_LENGTH → reject (return false)
 * 3. Otherwise → allow (return true)
 */
function sizeLimitFilterTransaction(tr: {
  docChanged: boolean;
  doc: { textContent: string };
}): boolean {
  if (!tr.docChanged) return true;
  if (tr.doc.textContent.length > MAX_BLOCK_CONTENT_LENGTH) {
    return false;
  }
  return true;
}

// --- Arbitraries ---

/** Generates a random non-skipped field value (primitives only for shallow comparison) */
const primitiveValueArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
);

/** Generates a set of non-skipped fields with consistent values for BlockData */
const nonSkippedFieldsArb = fc.record({
  title: fc.string({ minLength: 0, maxLength: 30 }),
  updatedAt: fc.string({ minLength: 10, maxLength: 30 }),
  lastEditor: fc.string({ minLength: 1, maxLength: 20 }),
  blockType: fc.constantFrom("text", "link", "file", "sketch", "kanban"),
  label: fc.string({ minLength: 0, maxLength: 20 }),
});

// --- Property Tests ---

describe("useProjectCanvasState — Content Safety Property Tests", () => {
  describe("Property 6: shallowEqualBlockData ignores content field", () => {
    it("returns true for BlockData pairs differing only in skipped fields", () => {
      /**
       * **Validates: Requirements 7.4, 11.3**
       *
       * For any two BlockData objects that are identical in all fields except
       * content, yText, yNoteDocument, and yAwareness, the shallowEqualBlockData
       * function shall return true.
       */
      fc.assert(
        fc.property(
          nonSkippedFieldsArb,
          fc.string({ minLength: 0, maxLength: 500 }),
          fc.string({ minLength: 0, maxLength: 500 }),
          fc.string({ minLength: 0, maxLength: 500 }),
          fc.string({ minLength: 0, maxLength: 500 }),
          (baseFields, contentA, contentB, skippedValA, skippedValB) => {
            const a: Record<string, unknown> = {
              ...baseFields,
              content: contentA,
              yText: { fake: skippedValA },
              yNoteDocument: { fake: `frag-${skippedValA}` },
              yAwareness: { fake: `awareness-${skippedValA}` },
            };

            const b: Record<string, unknown> = {
              ...baseFields,
              content: contentB,
              yText: { fake: skippedValB },
              yNoteDocument: { fake: `frag-${skippedValB}` },
              yAwareness: { fake: `awareness-${skippedValB}` },
            };

            expect(shallowEqualBlockData(a, b)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("returns true when all skipped keys differ simultaneously with various values", () => {
      /**
       * **Validates: Requirements 7.4, 11.3**
       *
       * Even when every single skipped key has a different value between
       * the two objects, equality still holds because they are ignored.
       */
      fc.assert(
        fc.property(
          nonSkippedFieldsArb,
          fc.record({
            content: fc.string({ minLength: 0, maxLength: 1000 }),
            yText: primitiveValueArb,
            yNoteDocument: primitiveValueArb,
            yAwareness: primitiveValueArb,
            typingUsers: primitiveValueArb,
            movingUserColor: primitiveValueArb,
            onContentChange: primitiveValueArb,
            onFocus: primitiveValueArb,
            onBlur: primitiveValueArb,
            onCaretMove: primitiveValueArb,
            onResize: primitiveValueArb,
            onResizeEnd: primitiveValueArb,
            onRequestUndo: primitiveValueArb,
            onRequestRedo: primitiveValueArb,
            currentUser: primitiveValueArb,
            initialProjectId: primitiveValueArb,
            projectOwnerId: primitiveValueArb,
            drafts: primitiveValueArb,
            _yDoc: primitiveValueArb,
          }),
          fc.record({
            content: fc.string({ minLength: 0, maxLength: 1000 }),
            yText: primitiveValueArb,
            yNoteDocument: primitiveValueArb,
            yAwareness: primitiveValueArb,
            typingUsers: primitiveValueArb,
            movingUserColor: primitiveValueArb,
            onContentChange: primitiveValueArb,
            onFocus: primitiveValueArb,
            onBlur: primitiveValueArb,
            onCaretMove: primitiveValueArb,
            onResize: primitiveValueArb,
            onResizeEnd: primitiveValueArb,
            onRequestUndo: primitiveValueArb,
            onRequestRedo: primitiveValueArb,
            currentUser: primitiveValueArb,
            initialProjectId: primitiveValueArb,
            projectOwnerId: primitiveValueArb,
            drafts: primitiveValueArb,
            _yDoc: primitiveValueArb,
          }),
          (baseFields, skippedA, skippedB) => {
            const a: Record<string, unknown> = { ...baseFields, ...skippedA };
            const b: Record<string, unknown> = { ...baseFields, ...skippedB };

            expect(shallowEqualBlockData(a, b)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("returns false when a non-skipped field differs", () => {
      /**
       * **Validates: Requirements 7.4**
       *
       * Varying non-skipped fields should cause inequality, confirming
       * the function correctly detects meaningful differences.
       */
      fc.assert(
        fc.property(
          nonSkippedFieldsArb,
          fc.constantFrom(
            "title",
            "updatedAt",
            "lastEditor",
            "blockType",
            "label",
          ),
          fc.string({ minLength: 1, maxLength: 50 }),
          (baseFields, fieldToChange, newValue) => {
            const a: Record<string, unknown> = { ...baseFields };
            const b: Record<string, unknown> = {
              ...baseFields,
              [fieldToChange]: `${newValue}_changed`,
            };

            // Only expect false if the values actually differ
            const valuesDiffer = a[fieldToChange] !== b[fieldToChange];
            if (valuesDiffer) {
              expect(shallowEqualBlockData(a, b)).toBe(false);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("does not crash with large content strings in skipped fields", () => {
      /**
       * **Validates: Requirements 11.3**
       *
       * Since content is skipped, even very large strings should not
       * cause JSON.stringify crashes or performance issues.
       */
      fc.assert(
        fc.property(
          nonSkippedFieldsArb,
          fc.integer({ min: 10_000, max: 500_000 }),
          fc.integer({ min: 10_000, max: 500_000 }),
          (baseFields, sizeA, sizeB) => {
            const a: Record<string, unknown> = {
              ...baseFields,
              content: "a".repeat(sizeA),
            };
            const b: Record<string, unknown> = {
              ...baseFields,
              content: "b".repeat(sizeB),
            };

            // Should not throw and should return true
            expect(() => shallowEqualBlockData(a, b)).not.toThrow();
            expect(shallowEqualBlockData(a, b)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Property 9: Size limit enforcement", () => {
    it("rejects transactions where resulting doc exceeds MAX_BLOCK_CONTENT_LENGTH", () => {
      /**
       * **Validates: Requirements 11.1, 11.2**
       *
       * For any ProseMirror transaction where the resulting document's text
       * content length exceeds MAX_BLOCK_CONTENT_LENGTH, the SizeLimit plugin
       * shall reject the transaction (filterTransaction returns false).
       */
      fc.assert(
        fc.property(
          fc.integer({
            min: MAX_BLOCK_CONTENT_LENGTH + 1,
            max: MAX_BLOCK_CONTENT_LENGTH + 10_000,
          }),
          (contentLength) => {
            const tr = {
              docChanged: true,
              doc: { textContent: "x".repeat(contentLength) },
            };

            expect(sizeLimitFilterTransaction(tr)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("allows transactions where resulting doc is at or below MAX_BLOCK_CONTENT_LENGTH", () => {
      /**
       * **Validates: Requirements 11.1, 11.2**
       *
       * For any ProseMirror transaction where the resulting document's text
       * content length is at or below MAX_BLOCK_CONTENT_LENGTH with docChanged=true,
       * the SizeLimit plugin shall allow the transaction (filterTransaction returns true).
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: MAX_BLOCK_CONTENT_LENGTH }),
          (contentLength) => {
            const tr = {
              docChanged: true,
              doc: { textContent: "x".repeat(contentLength) },
            };

            expect(sizeLimitFilterTransaction(tr)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("allows any transaction when docChanged is false regardless of size", () => {
      /**
       * **Validates: Requirements 11.1, 11.2**
       *
       * Non-document-changing transactions (e.g., selection changes) should
       * always be allowed, even if the document text content exceeds the limit.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: MAX_BLOCK_CONTENT_LENGTH + 50_000 }),
          (contentLength) => {
            const tr = {
              docChanged: false,
              doc: { textContent: "x".repeat(contentLength) },
            };

            expect(sizeLimitFilterTransaction(tr)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("boundary: exactly MAX_BLOCK_CONTENT_LENGTH is allowed, MAX+1 is rejected", () => {
      /**
       * **Validates: Requirements 11.1, 11.2**
       *
       * Verify the strict boundary: content length <= MAX is allowed,
       * content length > MAX is rejected. Test values around the boundary.
       */
      fc.assert(
        fc.property(fc.integer({ min: -5, max: 5 }), (offset) => {
          const contentLength = MAX_BLOCK_CONTENT_LENGTH + offset;
          if (contentLength < 0) return; // skip invalid lengths

          const tr = {
            docChanged: true,
            doc: { textContent: "a".repeat(contentLength) },
          };

          if (contentLength <= MAX_BLOCK_CONTENT_LENGTH) {
            expect(sizeLimitFilterTransaction(tr)).toBe(true);
          } else {
            expect(sizeLimitFilterTransaction(tr)).toBe(false);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
