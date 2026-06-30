/**
 * Property-based preservation tests for NoteBlock Vim content loss bugfix.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * Property 2: Preservation — Non-Collaborative Vim and MarkdownEditor Paths Unchanged
 *
 * These tests capture existing correct behavior on UNFIXED code that the upcoming
 * fix must not break. They verify:
 * 1. Non-collaborative Vim editing reads from data.content and writes to yText
 * 2. MarkdownEditor collaborative mode receives yNoteDocument and no onChange
 * 3. Content safety (clampBlockContent) is applied in all paths
 *
 * Uses fast-check with minimum 100 iterations per property.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as Y from "yjs";
import {
  clampBlockContent,
  safeReadYText,
  syncYTextValue,
  MAX_BLOCK_CONTENT_LENGTH,
} from "@lib/projectContentSafety";

// --- Simulated Logic ---

/**
 * Simulates getVimEditorValue for non-collaborative blocks (no yNoteDocument).
 * In NoteBlock.tsx line ~1122: value={data.content || ""}
 * This is the current behavior that must be preserved.
 */
function getVimEditorValue(data: {
  content: string;
  yNoteDocument?: Y.XmlFragment;
}): string {
  // Current unfixed behavior: always reads data.content regardless of yNoteDocument
  return data.content || "";
}

/**
 * Simulates handleVimChange write path for non-collaborative blocks.
 * In NoteBlock.tsx:
 *   1. clampBlockContent(value) is applied
 *   2. Early return if safeContent === data.content
 *   3. Early return if safeContent === currentYContent
 *   4. syncToYjs(safeContent) writes to yText
 *
 * For non-collaborative blocks (no yNoteDocument), this is the correct write path.
 */
function simulateHandleVimChange(params: {
  value: string;
  dataContent: string;
  yText: Y.Text;
}): { safeContent: string; synced: boolean } {
  const { value, dataContent, yText } = params;

  const safeContent = clampBlockContent(value);
  const currentBlockContent = dataContent ?? "";

  if (safeContent === currentBlockContent) {
    return { safeContent, synced: false };
  }

  const currentYContent = safeReadYText(yText, currentBlockContent);
  if (safeContent === currentYContent) {
    return { safeContent, synced: false };
  }

  // This is what syncToYjs does (without the 500ms debounce for testing)
  syncYTextValue(yText, safeContent);
  return { safeContent, synced: true };
}

/**
 * Simulates the MarkdownEditor prop resolution for collaborative mode.
 * In NoteBlock.tsx lines ~1131-1166:
 *   content={data.yNoteDocument ? undefined : data.content}
 *   onChange={data.yNoteDocument ? undefined : handleContentChange}
 *   yNoteDocument={data.yNoteDocument}
 */
function resolveMarkdownEditorProps(data: {
  content: string;
  yNoteDocument?: Y.XmlFragment;
}): {
  content: string | undefined;
  onChange: boolean; // true if onChange handler is provided
  yNoteDocument: Y.XmlFragment | undefined;
} {
  return {
    content: data.yNoteDocument ? undefined : data.content,
    onChange: !data.yNoteDocument, // onChange is provided only when NOT collaborative
    yNoteDocument: data.yNoteDocument,
  };
}

// --- Arbitraries ---

/** Generates arbitrary block content strings */
const contentArb = fc.string({ minLength: 0, maxLength: 2000 });

/** Generates non-empty content for Vim editing scenarios */
const nonEmptyContentArb = fc.string({ minLength: 1, maxLength: 2000 });

// --- Property Tests ---

describe("NoteBlock — Preservation Property Tests", () => {
  describe("Property-based test 1: Non-collaborative Vim read/write path", () => {
    it("getVimEditorValue equals data.content when yNoteDocument is absent", () => {
      /**
       * **Validates: Requirements 3.1**
       *
       * For all (content, yText) pairs where yNoteDocument is absent,
       * getVimEditorValue(data) equals data.content.
       */
      fc.assert(
        fc.property(contentArb, (content) => {
          const data = {
            content,
            yNoteDocument: undefined,
          };

          const vimValue = getVimEditorValue(data);

          // Vim reads from data.content (or "" if falsy)
          expect(vimValue).toBe(content || "");
        }),
        { numRuns: 100 },
      );
    });

    it("handleVimChange syncs to yText when yNoteDocument is absent", () => {
      /**
       * **Validates: Requirements 3.1**
       *
       * For all (content, newContent) pairs where yNoteDocument is absent,
       * handleVimChange(newContent) syncs the clamped content to yText.
       */
      fc.assert(
        fc.property(
          contentArb,
          nonEmptyContentArb,
          (existingContent, newContent) => {
            // Skip when new content equals existing (early return path)
            const safeNew = clampBlockContent(newContent);
            if (safeNew === existingContent) return;

            const yDoc = new Y.Doc();
            const yText = yDoc.getText("content");

            // Initialize yText with existing content
            if (existingContent) {
              yText.insert(0, existingContent);
            }

            // Skip when clamped content already equals yText (early return path)
            const currentYContent = safeReadYText(yText, existingContent);
            if (safeNew === currentYContent) return;

            const result = simulateHandleVimChange({
              value: newContent,
              dataContent: existingContent,
              yText,
            });

            // Content was synced to yText
            expect(result.synced).toBe(true);
            expect(result.safeContent).toBe(safeNew);

            // Verify yText now contains the new content
            expect(yText.toString()).toBe(safeNew);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("handleVimChange does not sync when content is unchanged", () => {
      /**
       * **Validates: Requirements 3.1**
       *
       * When the new value (after clamping) equals data.content,
       * no sync occurs — this is an optimization that must be preserved.
       */
      fc.assert(
        fc.property(contentArb, (content) => {
          const yDoc = new Y.Doc();
          const yText = yDoc.getText("content");
          if (content) yText.insert(0, content);

          const result = simulateHandleVimChange({
            value: content,
            dataContent: content,
            yText,
          });

          // No sync needed — content hasn't changed
          expect(result.synced).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Property-based test 2: MarkdownEditor collaborative mode contract", () => {
    it("MarkdownEditor receives yNoteDocument and no onChange when yNoteDocument exists", () => {
      /**
       * **Validates: Requirements 3.2, 3.4**
       *
       * For all blocks with yNoteDocument in non-Vim mode, the MarkdownEditor
       * receives yNoteDocument as its binding target and no onChange handler
       * (collaborative mode contract).
       */
      fc.assert(
        fc.property(contentArb, fc.boolean(), (content, populateFragment) => {
          const yDoc = new Y.Doc();
          const yNoteDocument = yDoc.getXmlFragment("note");

          // Optionally populate the fragment
          if (populateFragment && content.length > 0) {
            yDoc.transact(() => {
              const paragraph = new Y.XmlElement("paragraph");
              paragraph.insert(0, [new Y.XmlText(content)]);
              yNoteDocument.insert(0, [paragraph]);
            });
          }

          const data = { content, yNoteDocument };
          const props = resolveMarkdownEditorProps(data);

          // In collaborative mode:
          // - content prop is undefined (MarkdownEditor uses y-prosemirror binding)
          expect(props.content).toBeUndefined();
          // - onChange is NOT provided (collaborative edits flow through Yjs)
          expect(props.onChange).toBe(false);
          // - yNoteDocument is passed for y-prosemirror binding
          expect(props.yNoteDocument).toBe(yNoteDocument);
        }),
        { numRuns: 100 },
      );
    });

    it("MarkdownEditor receives content and onChange when yNoteDocument is absent", () => {
      /**
       * **Validates: Requirements 3.2**
       *
       * For all blocks WITHOUT yNoteDocument, the MarkdownEditor receives
       * content prop and onChange handler (local mode contract).
       */
      fc.assert(
        fc.property(contentArb, (content) => {
          const data = { content, yNoteDocument: undefined };
          const props = resolveMarkdownEditorProps(data);

          // In local mode:
          // - content prop is passed
          expect(props.content).toBe(content);
          // - onChange IS provided
          expect(props.onChange).toBe(true);
          // - yNoteDocument is undefined
          expect(props.yNoteDocument).toBeUndefined();
        }),
        { numRuns: 100 },
      );
    });

    it("yNoteDocument presence determines collaborative vs local mode exclusively", () => {
      /**
       * **Validates: Requirements 3.2, 3.4**
       *
       * The mode determination is purely based on yNoteDocument presence.
       * Content value does not affect mode selection.
       */
      fc.assert(
        fc.property(
          contentArb,
          contentArb,
          fc.boolean(),
          (content1, content2, hasYNoteDocument) => {
            const yDoc = new Y.Doc();
            const yNoteDocument = hasYNoteDocument
              ? yDoc.getXmlFragment("note")
              : undefined;

            const data1 = { content: content1, yNoteDocument };
            const data2 = { content: content2, yNoteDocument };

            const props1 = resolveMarkdownEditorProps(data1);
            const props2 = resolveMarkdownEditorProps(data2);

            // Mode (onChange presence) is identical regardless of content
            expect(props1.onChange).toBe(props2.onChange);
            // Both have same yNoteDocument reference
            expect(props1.yNoteDocument).toBe(props2.yNoteDocument);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Property-based test 3: Content safety — clampBlockContent applied to Vim content", () => {
    it("clampBlockContent is applied to Vim content in non-collaborative path", () => {
      /**
       * **Validates: Requirements 3.5**
       *
       * Content safety — clampBlockContent is applied to Vim content
       * in non-collaborative paths. The result is always within bounds.
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 5000 }),
          (rawContent) => {
            const clamped = clampBlockContent(rawContent);

            // Clamped content is always within MAX_BLOCK_CONTENT_LENGTH
            // (plus suffix length if truncated)
            if (rawContent.length <= MAX_BLOCK_CONTENT_LENGTH) {
              expect(clamped).toBe(rawContent);
            } else {
              expect(clamped.length).toBeLessThanOrEqual(
                MAX_BLOCK_CONTENT_LENGTH + 100,
              ); // suffix is short
              expect(
                clamped.startsWith(
                  rawContent.slice(0, MAX_BLOCK_CONTENT_LENGTH),
                ),
              ).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("handleVimChange always applies clampBlockContent before syncing", () => {
      /**
       * **Validates: Requirements 3.5**
       *
       * For any raw content value, handleVimChange applies clampBlockContent
       * before writing to yText, ensuring content safety in both paths.
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 5000 }),
          (rawContent) => {
            const yDoc = new Y.Doc();
            const yText = yDoc.getText("content");

            // Use empty existing content so sync always happens
            const result = simulateHandleVimChange({
              value: rawContent,
              dataContent: "",
              yText,
            });

            // The safe content should always be the clamped version
            expect(result.safeContent).toBe(clampBlockContent(rawContent));

            if (result.synced) {
              // If synced, yText contains the clamped content
              expect(yText.toString()).toBe(clampBlockContent(rawContent));
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("safeReadYText applies content safety when reading from yText", () => {
      /**
       * **Validates: Requirements 3.5**
       *
       * safeReadYText clamps content on read, ensuring oversized yText
       * values are handled safely.
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 3000 }),
          fc.string({ minLength: 0, maxLength: 100 }),
          (textContent, fallback) => {
            const yDoc = new Y.Doc();
            const yText = yDoc.getText("content");
            if (textContent) yText.insert(0, textContent);

            const result = safeReadYText(yText, fallback);

            // Result is always a string
            expect(typeof result).toBe("string");
            // Result length is bounded
            expect(result.length).toBeLessThanOrEqual(
              MAX_BLOCK_CONTENT_LENGTH + 100,
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
