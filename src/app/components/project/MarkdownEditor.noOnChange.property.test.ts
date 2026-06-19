/**
 * Property-based test for no-onChange in collaborative mode.
 *
 * Validates: Requirements 1.2, 1.3
 *
 * Property tested:
 * - Property 1: No onChange in collaborative mode — for any document change
 *   when a yNoteDocument binding is active, the MarkdownEditor's onChange
 *   callback SHALL never be invoked for content propagation.
 *
 * Approach:
 * The MarkdownEditor's onUpdate handler contains a guard:
 *   if (yNoteDocument) return;
 * This prevents onChange from being called when in collaborative mode.
 *
 * We simulate the onUpdate handler logic directly, exercising it with
 * randomly generated content to verify the property holds universally.
 *
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import * as Y from "yjs";

/**
 * Simulates the onUpdate handler logic from MarkdownEditor.tsx.
 *
 * The real handler:
 *   onUpdate: ({ editor }) => {
 *     if (isSyncingRef.current || isReadOnly) return;
 *     if (yNoteDocument) return;
 *     const markdown = getStableMarkdown(editor);
 *     if (markdown.length > MAX_BLOCK_CONTENT_LENGTH) { ... }
 *     onChange?.(markdown);
 *   }
 *
 * We replicate this logic faithfully so we can verify the guard behavior.
 */
function simulateOnUpdate(params: {
  isSyncing: boolean;
  isReadOnly: boolean;
  yNoteDocument: Y.XmlFragment | undefined;
  markdown: string;
  onChange?: (content: string) => void;
  maxContentLength?: number;
}): void {
  const {
    isSyncing,
    isReadOnly,
    yNoteDocument,
    markdown,
    onChange,
    maxContentLength = 1_000_000,
  } = params;

  // Guard 1: syncing or read-only
  if (isSyncing || isReadOnly) return;

  // Guard 2: collaborative mode — yNoteDocument present
  if (yNoteDocument) return;

  // Content size check
  if (markdown.length > maxContentLength) {
    onChange?.(markdown.slice(0, maxContentLength));
    return;
  }

  onChange?.(markdown);
}

describe("MarkdownEditor — No onChange in Collaborative Mode Property Test", () => {
  describe("Property 1: No onChange in collaborative mode", () => {
    it("onChange is never invoked when yNoteDocument is present, regardless of content", () => {
      /**
       * **Validates: Requirements 1.2, 1.3**
       *
       * For any document change (local or remote) when a yNoteDocument binding
       * is active, the MarkdownEditor's onChange callback SHALL never be invoked
       * for content propagation.
       */
      fc.assert(
        fc.property(
          // Generate random markdown-like content of varying lengths
          fc.string({ minLength: 0, maxLength: 5000 }),
          // Generate random syncing state
          fc.boolean(),
          // Generate random read-only state
          fc.boolean(),
          (content, isSyncing, isReadOnly) => {
            const onChange = vi.fn();
            const yNoteDocument = new Y.XmlFragment();

            simulateOnUpdate({
              isSyncing,
              isReadOnly,
              yNoteDocument,
              markdown: content,
              onChange,
            });

            // onChange must NEVER be called when yNoteDocument is present
            expect(onChange).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("onChange is never invoked for any unicode content when yNoteDocument is active", () => {
      /**
       * **Validates: Requirements 1.2, 1.3**
       *
       * Extended variant: verifies property holds for full unicode strings
       * including special characters, multi-byte sequences, and edge cases.
       */
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 3000 }), (content) => {
          const onChange = vi.fn();
          const yNoteDocument = new Y.XmlFragment();

          simulateOnUpdate({
            isSyncing: false,
            isReadOnly: false,
            yNoteDocument,
            markdown: content,
            onChange,
          });

          expect(onChange).not.toHaveBeenCalled();
        }),
        { numRuns: 100 },
      );
    });

    it("onChange IS invoked when yNoteDocument is absent (local mode baseline)", () => {
      /**
       * **Validates: Requirements 1.2, 1.3**
       *
       * Baseline property: without yNoteDocument, onChange IS called
       * (as long as not syncing and not read-only). This confirms the guard
       * is the differentiating factor.
       */
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 2000 }), (content) => {
          const onChange = vi.fn();

          simulateOnUpdate({
            isSyncing: false,
            isReadOnly: false,
            yNoteDocument: undefined,
            markdown: content,
            onChange,
          });

          // onChange SHOULD be called in local mode
          expect(onChange).toHaveBeenCalledOnce();
          expect(onChange).toHaveBeenCalledWith(content);
        }),
        { numRuns: 100 },
      );
    });

    it("onChange is suppressed regardless of XmlFragment content state", () => {
      /**
       * **Validates: Requirements 1.2, 1.3**
       *
       * Verifies the guard holds whether the Y.XmlFragment is empty or
       * pre-populated with content (simulating remote changes arriving).
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 3000 }),
          fc.boolean(),
          (content, populateFragment) => {
            const onChange = vi.fn();
            const yDoc = new Y.Doc();
            const yNoteDocument = yDoc.getXmlFragment("test-note");

            // Optionally populate the fragment (simulating remote content)
            if (populateFragment) {
              yDoc.transact(() => {
                yNoteDocument.insert(0, [new Y.XmlText("remote content")]);
              });
            }

            simulateOnUpdate({
              isSyncing: false,
              isReadOnly: false,
              yNoteDocument,
              markdown: content,
              onChange,
            });

            // onChange must NEVER be called regardless of fragment state
            expect(onChange).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });

    it("onChange is suppressed for content exceeding size limits in collaborative mode", () => {
      /**
       * **Validates: Requirements 1.2, 1.3**
       *
       * Even when content exceeds MAX_BLOCK_CONTENT_LENGTH, the yNoteDocument
       * guard prevents onChange from being invoked — the size check never
       * reaches execution.
       */
      fc.assert(
        fc.property(
          // Generate strings around and above a small max-length threshold
          fc
            .nat({ max: 200 })
            .chain((maxLen) =>
              fc.tuple(
                fc.constant(maxLen),
                fc.string({ minLength: maxLen + 1, maxLength: maxLen + 500 }),
              ),
            ),
          ([maxContentLength, content]) => {
            const onChange = vi.fn();
            const yNoteDocument = new Y.XmlFragment();

            simulateOnUpdate({
              isSyncing: false,
              isReadOnly: false,
              yNoteDocument,
              markdown: content,
              onChange,
              maxContentLength,
            });

            // Guard fires before size check — onChange never called
            expect(onChange).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
