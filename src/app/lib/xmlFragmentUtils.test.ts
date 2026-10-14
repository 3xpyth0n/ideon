import * as Y from "yjs";
import { describe, expect, it } from "vitest";

import { extractTextFromXmlFragment } from "./xmlFragmentUtils";
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
