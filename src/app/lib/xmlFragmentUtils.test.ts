import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import {
  extractTextFromXmlFragment,
  syncTextToXmlFragment,
} from "./xmlFragmentUtils";
import {
  MAX_BLOCK_CONTENT_LENGTH,
  CLIENT_TRUNCATION_SUFFIX,
} from "./projectContentSafety";

/**
 * Unit tests for extractTextFromXmlFragment
 *
 * **Validates: Requirements 2.1, 2.3, 2.4**
 *
 * Tests the recursive XmlFragment → plain text extraction with various
 * ProseMirror document structures.
 */

// --- Helpers ---

function createFragmentWithContent(
  buildContent: (doc: Y.Doc, fragment: Y.XmlFragment) => void,
): Y.XmlFragment {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("test-fragment");
  doc.transact(() => {
    buildContent(doc, fragment);
  });
  return fragment;
}

function makeParagraph(text: string): Y.XmlElement {
  const paragraph = new Y.XmlElement("paragraph");
  const textNode = new Y.XmlText();
  textNode.insert(0, text);
  paragraph.insert(0, [textNode]);
  return paragraph;
}

function makeHeading(text: string, level = 1): Y.XmlElement {
  const heading = new Y.XmlElement("heading");
  heading.setAttribute("level", String(level));
  const textNode = new Y.XmlText();
  textNode.insert(0, text);
  heading.insert(0, [textNode]);
  return heading;
}

function makeCodeBlock(text: string): Y.XmlElement {
  const codeBlock = new Y.XmlElement("codeBlock");
  const textNode = new Y.XmlText();
  textNode.insert(0, text);
  codeBlock.insert(0, [textNode]);
  return codeBlock;
}

function makeBulletList(items: string[]): Y.XmlElement {
  const list = new Y.XmlElement("bulletList");
  for (const item of items) {
    const listItem = new Y.XmlElement("listItem");
    const paragraph = makeParagraph(item);
    listItem.insert(listItem.length, [paragraph]);
    list.insert(list.length, [listItem]);
  }
  return list;
}

// --- Tests ---

describe("extractTextFromXmlFragment", () => {
  describe("edge cases", () => {
    it("returns empty string for an empty fragment", () => {
      const fragment = createFragmentWithContent(() => {});
      expect(extractTextFromXmlFragment(fragment)).toBe("");
    });

    it("returns empty string for a fragment with an empty paragraph", () => {
      const fragment = createFragmentWithContent((_doc, frag) => {
        const paragraph = new Y.XmlElement("paragraph");
        const textNode = new Y.XmlText();
        paragraph.insert(0, [textNode]);
        frag.insert(0, [paragraph]);
      });
      expect(extractTextFromXmlFragment(fragment)).toBe("");
    });
  });

  describe("single paragraph", () => {
    it("extracts text from a single paragraph", () => {
      const fragment = createFragmentWithContent((_doc, frag) => {
        frag.insert(0, [makeParagraph("Hello World")]);
      });
      expect(extractTextFromXmlFragment(fragment)).toBe("Hello World");
    });

    it("extracts text with special characters", () => {
      const fragment = createFragmentWithContent((_doc, frag) => {
        frag.insert(0, [makeParagraph("Hello <World> & 'Friends' \"Others\"")]);
      });
      expect(extractTextFromXmlFragment(fragment)).toBe(
        "Hello <World> & 'Friends' \"Others\"",
      );
    });
  });

  describe("multiple paragraphs", () => {
    it("joins multiple paragraphs with newline", () => {
      const fragment = createFragmentWithContent((_doc, frag) => {
        frag.insert(0, [makeParagraph("Line 1")]);
        frag.insert(1, [makeParagraph("Line 2")]);
        frag.insert(2, [makeParagraph("Line 3")]);
      });
      expect(extractTextFromXmlFragment(fragment)).toBe(
        "Line 1\nLine 2\nLine 3",
      );
    });

    it("handles empty paragraphs between content paragraphs", () => {
      const fragment = createFragmentWithContent((_doc, frag) => {
        frag.insert(0, [makeParagraph("Before")]);
        const emptyPara = new Y.XmlElement("paragraph");
        emptyPara.insert(0, [new Y.XmlText()]);
        frag.insert(1, [emptyPara]);
        frag.insert(2, [makeParagraph("After")]);
      });
      expect(extractTextFromXmlFragment(fragment)).toBe("Before\n\nAfter");
    });
  });

  describe("headings", () => {
    it("extracts text from headings as plain text with newline separators", () => {
      const fragment = createFragmentWithContent((_doc, frag) => {
        frag.insert(0, [makeHeading("Title", 1)]);
        frag.insert(1, [makeParagraph("Body text")]);
      });
      expect(extractTextFromXmlFragment(fragment)).toBe("Title\nBody text");
    });
  });

  describe("code blocks", () => {
    it("extracts text from code blocks", () => {
      const fragment = createFragmentWithContent((_doc, frag) => {
        frag.insert(0, [makeParagraph("Before code")]);
        frag.insert(1, [makeCodeBlock("const x = 1;\nreturn x;")]);
        frag.insert(2, [makeParagraph("After code")]);
      });
      expect(extractTextFromXmlFragment(fragment)).toBe(
        "Before code\nconst x = 1;\nreturn x;\nAfter code",
      );
    });
  });

  describe("lists", () => {
    it("extracts text from bullet list items with newline separators", () => {
      const fragment = createFragmentWithContent((_doc, frag) => {
        frag.insert(0, [makeParagraph("Items:")]);
        frag.insert(1, [makeBulletList(["First", "Second", "Third"])]);
      });
      expect(extractTextFromXmlFragment(fragment)).toBe(
        "Items:\nFirst\nSecond\nThird",
      );
    });
  });

  describe("mixed content", () => {
    it("handles a complex document with headings, paragraphs, code, and lists", () => {
      const fragment = createFragmentWithContent((_doc, frag) => {
        frag.insert(0, [makeHeading("My Document", 1)]);
        frag.insert(1, [makeParagraph("Introduction text")]);
        frag.insert(2, [makeHeading("Section 1", 2)]);
        frag.insert(3, [makeParagraph("Section content")]);
        frag.insert(4, [makeCodeBlock("console.log('hello')")]);
        frag.insert(5, [makeBulletList(["Item A", "Item B"])]);
      });
      expect(extractTextFromXmlFragment(fragment)).toBe(
        "My Document\nIntroduction text\nSection 1\nSection content\nconsole.log('hello')\nItem A\nItem B",
      );
    });
  });

  describe("inline content", () => {
    it("concatenates multiple inline text nodes within a paragraph", () => {
      const fragment = createFragmentWithContent((_doc, frag) => {
        const paragraph = new Y.XmlElement("paragraph");
        const text1 = new Y.XmlText();
        text1.insert(0, "Hello ");
        const text2 = new Y.XmlText();
        text2.insert(0, "World");
        paragraph.insert(0, [text1, text2]);
        frag.insert(0, [paragraph]);
      });
      expect(extractTextFromXmlFragment(fragment)).toBe("Hello World");
    });
  });

  describe("content safety", () => {
    it("applies clampBlockContent to oversized content", () => {
      const longText = "x".repeat(MAX_BLOCK_CONTENT_LENGTH + 100);
      const fragment = createFragmentWithContent((_doc, frag) => {
        frag.insert(0, [makeParagraph(longText)]);
      });
      const result = extractTextFromXmlFragment(fragment);
      expect(result.length).toBeLessThanOrEqual(
        MAX_BLOCK_CONTENT_LENGTH + CLIENT_TRUNCATION_SUFFIX.length,
      );
      expect(result.endsWith(CLIENT_TRUNCATION_SUFFIX)).toBe(true);
    });
  });

  describe("bare XmlText at fragment root", () => {
    it("extracts text from XmlText nodes directly in the fragment", () => {
      const fragment = createFragmentWithContent((_doc, frag) => {
        const textNode = new Y.XmlText();
        textNode.insert(0, "Bare text");
        frag.insert(0, [textNode]);
      });
      expect(extractTextFromXmlFragment(fragment)).toBe("Bare text");
    });
  });
});

// --- syncTextToXmlFragment Tests ---

/**
 * Unit tests for syncTextToXmlFragment
 *
 * **Validates: Requirements 2.2, 2.3**
 *
 * Tests plain text → XmlFragment sync including ProseMirror structure,
 * no-op detection, content safety clamping, and round-trip correctness.
 */

function createEmptyFragment(): Y.XmlFragment {
  const doc = new Y.Doc();
  return doc.getXmlFragment("test-sync-fragment");
}

describe("syncTextToXmlFragment", () => {
  describe("basic writing", () => {
    it("writes single line text as one paragraph node", () => {
      const fragment = createEmptyFragment();
      syncTextToXmlFragment(fragment, "Hello");
      expect(extractTextFromXmlFragment(fragment)).toBe("Hello");
      expect(fragment.length).toBe(1);

      const child = fragment.get(0) as Y.XmlElement;
      expect(child.nodeName).toBe("paragraph");
    });

    it("writes multiple lines as multiple paragraph nodes", () => {
      const fragment = createEmptyFragment();
      syncTextToXmlFragment(fragment, "Line 1\nLine 2\nLine 3");
      expect(fragment.length).toBe(3);
      expect(extractTextFromXmlFragment(fragment)).toBe(
        "Line 1\nLine 2\nLine 3",
      );
    });

    it("handles empty string input on non-empty fragment", () => {
      const fragment = createEmptyFragment();
      syncTextToXmlFragment(fragment, "Some existing content");
      expect(fragment.length).toBe(1);

      // Sync empty string to replace content
      syncTextToXmlFragment(fragment, "");
      // Empty string splits to [""] → one paragraph with empty text
      expect(fragment.length).toBe(1);
      expect(extractTextFromXmlFragment(fragment)).toBe("");
    });

    it("handles text with special characters", () => {
      const fragment = createEmptyFragment();
      const specialText = "Hello <world> & \"friends\" 'here'";
      syncTextToXmlFragment(fragment, specialText);
      expect(extractTextFromXmlFragment(fragment)).toBe(specialText);
    });
  });

  describe("replaces existing content", () => {
    it("clears existing content before writing new content", () => {
      const fragment = createEmptyFragment();
      // First write
      syncTextToXmlFragment(fragment, "Old content\nOld line 2");
      expect(fragment.length).toBe(2);

      // Second write replaces
      syncTextToXmlFragment(fragment, "New content");
      expect(fragment.length).toBe(1);
      expect(extractTextFromXmlFragment(fragment)).toBe("New content");
    });
  });

  describe("no-op detection", () => {
    it("skips sync when content is identical", () => {
      const fragment = createEmptyFragment();
      syncTextToXmlFragment(fragment, "Same content");

      // Get the first paragraph reference before second sync
      const firstChild = fragment.get(0);

      // Sync same content again — should be a no-op
      syncTextToXmlFragment(fragment, "Same content");

      // Fragment structure should be unchanged (same reference)
      expect(fragment.get(0)).toBe(firstChild);
    });

    it("detects content change and applies update", () => {
      const fragment = createEmptyFragment();
      syncTextToXmlFragment(fragment, "Version 1");

      const firstChild = fragment.get(0);

      // Different content should trigger a write
      syncTextToXmlFragment(fragment, "Version 2");

      // Fragment should have new content (different reference)
      expect(fragment.get(0)).not.toBe(firstChild);
      expect(extractTextFromXmlFragment(fragment)).toBe("Version 2");
    });
  });

  describe("content safety", () => {
    it("applies clampBlockContent before writing", () => {
      const fragment = createEmptyFragment();
      const hugeText = "x".repeat(MAX_BLOCK_CONTENT_LENGTH + 100);
      syncTextToXmlFragment(fragment, hugeText);

      const result = extractTextFromXmlFragment(fragment);
      expect(result.length).toBeLessThanOrEqual(
        MAX_BLOCK_CONTENT_LENGTH + CLIENT_TRUNCATION_SUFFIX.length,
      );
      expect(result.endsWith(CLIENT_TRUNCATION_SUFFIX)).toBe(true);
    });
  });

  describe("ProseMirror structure", () => {
    it("creates proper XmlElement(paragraph) > XmlText structure", () => {
      const fragment = createEmptyFragment();
      syncTextToXmlFragment(fragment, "First\nSecond");

      for (let i = 0; i < fragment.length; i++) {
        const child = fragment.get(i);
        expect(child).toBeInstanceOf(Y.XmlElement);
        const element = child as Y.XmlElement;
        expect(element.nodeName).toBe("paragraph");
        expect(element.length).toBe(1);
        expect(element.get(0)).toBeInstanceOf(Y.XmlText);
      }
    });

    it("each paragraph text node contains the correct line text", () => {
      const fragment = createEmptyFragment();
      syncTextToXmlFragment(fragment, "Alpha\nBeta\nGamma");

      const lines = ["Alpha", "Beta", "Gamma"];
      for (let i = 0; i < fragment.length; i++) {
        const element = fragment.get(i) as Y.XmlElement;
        const textNode = element.get(0) as Y.XmlText;
        expect(textNode.toString()).toBe(lines[i]);
      }
    });
  });

  describe("atomic transaction", () => {
    it("uses a Y.Doc transaction for the update", () => {
      const doc = new Y.Doc();
      const fragment = doc.getXmlFragment("transact-test");

      // Track transaction events
      let transactionCount = 0;
      doc.on("afterTransaction", () => {
        transactionCount++;
      });

      syncTextToXmlFragment(fragment, "Line 1\nLine 2\nLine 3");

      // Should complete in a single transaction (1 event)
      expect(transactionCount).toBe(1);
    });
  });
});

describe("round-trip: syncTextToXmlFragment <-> extractTextFromXmlFragment", () => {
  it("preserves single line text", () => {
    const fragment = createEmptyFragment();
    syncTextToXmlFragment(fragment, "Hello World");
    expect(extractTextFromXmlFragment(fragment)).toBe("Hello World");
  });

  it("preserves multi-line text", () => {
    const fragment = createEmptyFragment();
    const text = "First paragraph\nSecond paragraph\nThird paragraph";
    syncTextToXmlFragment(fragment, text);
    expect(extractTextFromXmlFragment(fragment)).toBe(text);
  });

  it("preserves empty lines between content", () => {
    const fragment = createEmptyFragment();
    const text = "Before\n\nAfter";
    syncTextToXmlFragment(fragment, text);
    expect(extractTextFromXmlFragment(fragment)).toBe(text);
  });

  it("round-trips multiple times without corruption", () => {
    const fragment = createEmptyFragment();

    syncTextToXmlFragment(fragment, "Version 1\nLine 2");
    expect(extractTextFromXmlFragment(fragment)).toBe("Version 1\nLine 2");

    syncTextToXmlFragment(fragment, "Version 2\nNew line 2\nLine 3");
    expect(extractTextFromXmlFragment(fragment)).toBe(
      "Version 2\nNew line 2\nLine 3",
    );

    syncTextToXmlFragment(fragment, "Short");
    expect(extractTextFromXmlFragment(fragment)).toBe("Short");
  });
});
