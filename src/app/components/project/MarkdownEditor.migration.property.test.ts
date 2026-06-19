/**
 * Property-based tests for content migration (migrateContentToFragment).
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 8.1, 8.2
 *
 * Properties tested:
 * - Property 8: Migration idempotency — pre-populated fragments (length > 0)
 *   are never modified by calling migration with any markdown string.
 * - Property 7: Markdown-to-fragment round-trip — migration correctly invokes
 *   setContent when fragment is empty and content exists, enabling the
 *   ySyncPlugin to propagate ProseMirror doc changes to Y.XmlFragment.
 *
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import * as Y from "yjs";

import { migrateContentToFragment } from "./MarkdownEditor";

// --- Mock Editor type matching the Editor interface used by the function ---

interface MockEditor {
  commands: {
    setContent: (content: string) => boolean;
  };
}

function createMockEditor(): MockEditor & {
  setContentSpy: ReturnType<typeof vi.fn>;
} {
  const setContentSpy = vi.fn().mockReturnValue(true);
  return {
    commands: {
      setContent: setContentSpy,
    },
    setContentSpy,
  };
}

// --- Arbitraries ---

/** Generates non-empty markdown content (at least one non-whitespace char) */
const nonEmptyMarkdownArb = fc
  .string({ minLength: 1, maxLength: 2000 })
  .filter((s) => s.trim().length > 0);

/** Generates whitespace-only or empty strings */
const emptyOrWhitespaceArb = fc.oneof(
  fc.constant(""),
  fc
    .array(fc.constantFrom(" ", "\t", "\n", "\r"), {
      minLength: 1,
      maxLength: 50,
    })
    .map((chars) => chars.join("")),
);

/**
 * Generates realistic markdown content with supported features:
 * headings, bold, italic, underline, strikethrough, code, links, task lists.
 */
const supportedMarkdownArb = fc.oneof(
  // Headings
  fc
    .tuple(
      fc.integer({ min: 1, max: 6 }),
      fc.string({ minLength: 1, maxLength: 80 }),
    )
    .map(([level, text]) => `${"#".repeat(level)} ${text.replace(/\n/g, " ")}`),
  // Bold text
  fc
    .string({ minLength: 1, maxLength: 100 })
    .map((t) => `**${t.replace(/\*/g, "")}**`),
  // Italic text
  fc
    .string({ minLength: 1, maxLength: 100 })
    .map((t) => `*${t.replace(/\*/g, "")}*`),
  // Strikethrough
  fc
    .string({ minLength: 1, maxLength: 100 })
    .map((t) => `~~${t.replace(/~/g, "")}~~`),
  // Inline code
  fc
    .string({ minLength: 1, maxLength: 100 })
    .map((t) => `\`${t.replace(/`/g, "")}\``),
  // Links
  fc
    .tuple(fc.string({ minLength: 1, maxLength: 50 }), fc.webUrl())
    .map(([text, url]) => `[${text.replace(/[[\]]/g, "")}](${url})`),
  // Task lists
  fc
    .tuple(fc.boolean(), fc.string({ minLength: 1, maxLength: 80 }))
    .map(
      ([checked, text]) =>
        `- [${checked ? "x" : " "}] ${text.replace(/\n/g, " ")}`,
    ),
  // Plain paragraphs
  fc
    .string({ minLength: 1, maxLength: 200 })
    .filter((s) => s.trim().length > 0),
);

/**
 * Generates multi-line markdown combining supported features.
 */
const multiLineMarkdownArb = fc
  .array(supportedMarkdownArb, { minLength: 1, maxLength: 5 })
  .map((lines) => lines.join("\n\n"));

// --- Property Tests ---

describe("MarkdownEditor — Content Migration Property Tests", () => {
  describe("Property 8: Migration idempotency", () => {
    it("pre-populated fragments are never modified by migration calls", () => {
      /**
       * **Validates: Requirements 10.2**
       *
       * For any Y.XmlFragment that already contains document content (length > 0),
       * calling the migration function with any markdown string SHALL NOT modify
       * the fragment's content.
       */
      fc.assert(
        fc.property(
          nonEmptyMarkdownArb,
          fc.string({ minLength: 1, maxLength: 3000 }),
          (existingContent, newMarkdown) => {
            const yDoc = new Y.Doc();
            const yNoteDocument = yDoc.getXmlFragment("test-note");

            // Pre-populate the fragment so length > 0
            yDoc.transact(() => {
              yNoteDocument.insert(0, [new Y.XmlText(existingContent)]);
            });

            const originalLength = yNoteDocument.length;
            expect(originalLength).toBeGreaterThan(0);

            // Capture the fragment content before migration
            const contentBefore = yNoteDocument.toString();

            const mockEditor = createMockEditor();

            // Call migration — should be a no-op
            migrateContentToFragment(
              mockEditor as unknown as Parameters<
                typeof migrateContentToFragment
              >[0],
              yNoteDocument,
              newMarkdown,
            );

            // Fragment must be unchanged
            expect(yNoteDocument.length).toBe(originalLength);
            expect(yNoteDocument.toString()).toBe(contentBefore);

            // setContent must NOT have been called
            expect(mockEditor.setContentSpy).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("fragments with any positive length remain unchanged regardless of markdown input", () => {
      /**
       * **Validates: Requirements 10.2**
       *
       * Variant: tests with multiple XML elements to ensure various fragment
       * structures are never overwritten.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.array(fc.string({ minLength: 1, maxLength: 200 }), {
            minLength: 1,
            maxLength: 5,
          }),
          nonEmptyMarkdownArb,
          (elementCount, textContents, migrationMarkdown) => {
            const yDoc = new Y.Doc();
            const yNoteDocument = yDoc.getXmlFragment("test-note");

            // Pre-populate with multiple elements
            yDoc.transact(() => {
              for (
                let i = 0;
                i < Math.min(elementCount, textContents.length);
                i++
              ) {
                yNoteDocument.insert(i, [new Y.XmlText(textContents[i])]);
              }
            });

            expect(yNoteDocument.length).toBeGreaterThan(0);
            const lengthBefore = yNoteDocument.length;
            const contentBefore = yNoteDocument.toString();

            const mockEditor = createMockEditor();

            migrateContentToFragment(
              mockEditor as unknown as Parameters<
                typeof migrateContentToFragment
              >[0],
              yNoteDocument,
              migrationMarkdown,
            );

            // Nothing changes
            expect(yNoteDocument.length).toBe(lengthBefore);
            expect(yNoteDocument.toString()).toBe(contentBefore);
            expect(mockEditor.setContentSpy).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("migration with empty/whitespace markdown on populated fragment is still a no-op", () => {
      /**
       * **Validates: Requirements 10.2**
       *
       * Even when the markdown input is empty or whitespace, a populated
       * fragment is never touched (the length > 0 guard fires first).
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 500 }),
          emptyOrWhitespaceArb,
          (existingContent, emptyMarkdown) => {
            const yDoc = new Y.Doc();
            const yNoteDocument = yDoc.getXmlFragment("test-note");

            yDoc.transact(() => {
              yNoteDocument.insert(0, [new Y.XmlText(existingContent)]);
            });

            const contentBefore = yNoteDocument.toString();
            const mockEditor = createMockEditor();

            migrateContentToFragment(
              mockEditor as unknown as Parameters<
                typeof migrateContentToFragment
              >[0],
              yNoteDocument,
              emptyMarkdown,
            );

            expect(yNoteDocument.toString()).toBe(contentBefore);
            expect(mockEditor.setContentSpy).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Property 7: Markdown-to-fragment round-trip", () => {
    it("migration calls setContent with the markdown when fragment is empty and content exists", () => {
      /**
       * **Validates: Requirements 10.1, 10.3, 8.1, 8.2**
       *
       * For any valid markdown string using supported features, migrating that
       * markdown into an empty Y.XmlFragment SHALL invoke editor.commands.setContent
       * with the original markdown, enabling ySyncPlugin to populate the fragment.
       *
       * Since full TipTap editor instantiation requires a DOM environment, we verify
       * the migration logic: empty fragment + non-empty content → setContent called
       * with the exact markdown string.
       */
      fc.assert(
        fc.property(multiLineMarkdownArb, (markdown) => {
          const yDoc = new Y.Doc();
          const yNoteDocument = yDoc.getXmlFragment("test-note");

          // Fragment is empty
          expect(yNoteDocument.length).toBe(0);

          const mockEditor = createMockEditor();

          migrateContentToFragment(
            mockEditor as unknown as Parameters<
              typeof migrateContentToFragment
            >[0],
            yNoteDocument,
            markdown,
          );

          // setContent MUST be called with the exact markdown
          expect(mockEditor.setContentSpy).toHaveBeenCalledOnce();
          expect(mockEditor.setContentSpy).toHaveBeenCalledWith(markdown);
        }),
        { numRuns: 100 },
      );
    });

    it("all supported markdown features trigger migration into empty fragments", () => {
      /**
       * **Validates: Requirements 10.1, 10.3, 8.1, 8.2**
       *
       * Each individually generated supported markdown feature (headings, bold,
       * italic, strikethrough, code, links, task lists) results in setContent
       * being called when the fragment is empty.
       */
      fc.assert(
        fc.property(supportedMarkdownArb, (markdown) => {
          const yDoc = new Y.Doc();
          const yNoteDocument = yDoc.getXmlFragment("test-note");

          expect(yNoteDocument.length).toBe(0);

          const mockEditor = createMockEditor();

          migrateContentToFragment(
            mockEditor as unknown as Parameters<
              typeof migrateContentToFragment
            >[0],
            yNoteDocument,
            markdown,
          );

          // All supported markdown features should trigger migration
          if (markdown.trim().length > 0) {
            expect(mockEditor.setContentSpy).toHaveBeenCalledOnce();
            expect(mockEditor.setContentSpy).toHaveBeenCalledWith(markdown);
          }
        }),
        { numRuns: 100 },
      );
    });

    it("empty or whitespace-only markdown does NOT trigger migration", () => {
      /**
       * **Validates: Requirements 10.1**
       *
       * When the markdown content is empty or contains only whitespace,
       * migration should not call setContent (there is nothing to migrate).
       */
      fc.assert(
        fc.property(emptyOrWhitespaceArb, (markdown) => {
          const yDoc = new Y.Doc();
          const yNoteDocument = yDoc.getXmlFragment("test-note");

          expect(yNoteDocument.length).toBe(0);

          const mockEditor = createMockEditor();

          migrateContentToFragment(
            mockEditor as unknown as Parameters<
              typeof migrateContentToFragment
            >[0],
            yNoteDocument,
            markdown,
          );

          // setContent must NOT be called for empty/whitespace content
          expect(mockEditor.setContentSpy).not.toHaveBeenCalled();
        }),
        { numRuns: 100 },
      );
    });

    it("migration preserves the exact markdown string passed to setContent", () => {
      /**
       * **Validates: Requirements 10.3, 8.2**
       *
       * The markdown string passed to setContent is identical to the input —
       * no transformation or corruption occurs in the migration path itself.
       * (The editor's internal parse/serialize handles the actual conversion.)
       */
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 5000 })
            .filter((s) => s.trim().length > 0),
          (markdown) => {
            const yDoc = new Y.Doc();
            const yNoteDocument = yDoc.getXmlFragment("test-note");

            const mockEditor = createMockEditor();

            migrateContentToFragment(
              mockEditor as unknown as Parameters<
                typeof migrateContentToFragment
              >[0],
              yNoteDocument,
              markdown,
            );

            // The exact string is passed through without modification
            expect(mockEditor.setContentSpy).toHaveBeenCalledWith(markdown);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("migration guard logic: fragment empty + content present = migration happens", () => {
      /**
       * **Validates: Requirements 10.1, 10.2**
       *
       * Exhaustive verification of the guard matrix:
       * - fragment empty + content present → setContent called
       * - fragment empty + content absent → setContent NOT called
       * - fragment populated + content present → setContent NOT called
       * - fragment populated + content absent → setContent NOT called
       */
      fc.assert(
        fc.property(
          fc.boolean(), // whether fragment has content
          fc.oneof(nonEmptyMarkdownArb, emptyOrWhitespaceArb), // markdown input
          (fragmentPopulated, markdown) => {
            const yDoc = new Y.Doc();
            const yNoteDocument = yDoc.getXmlFragment("test-note");

            if (fragmentPopulated) {
              yDoc.transact(() => {
                yNoteDocument.insert(0, [new Y.XmlText("existing content")]);
              });
            }

            const mockEditor = createMockEditor();

            migrateContentToFragment(
              mockEditor as unknown as Parameters<
                typeof migrateContentToFragment
              >[0],
              yNoteDocument,
              markdown,
            );

            const shouldMigrate =
              !fragmentPopulated && !!markdown && markdown.trim().length > 0;

            if (shouldMigrate) {
              expect(mockEditor.setContentSpy).toHaveBeenCalledOnce();
              expect(mockEditor.setContentSpy).toHaveBeenCalledWith(markdown);
            } else {
              expect(mockEditor.setContentSpy).not.toHaveBeenCalled();
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
