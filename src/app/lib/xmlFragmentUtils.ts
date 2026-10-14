import * as Y from "yjs";

import { clampBlockContent } from "./projectContentSafety";

/**
 * Recursively extracts plain text from a Y.XmlFragment (ProseMirror document structure).
 *
 * Walks the XmlFragment tree: iterates children, extracts text from Y.XmlText nodes,
 * and joins paragraph-level elements (paragraphs, headings, code blocks, list items)
 * with newline separators.
 *
 * The result is clamped via `clampBlockContent` for content safety.
 *
 * @param fragment - A Y.XmlFragment representing a ProseMirror document
 * @returns Plain text representation of the document
 */
export function extractTextFromXmlFragment(fragment: Y.XmlFragment): string {
  if (fragment.length === 0) {
    return "";
  }

  const blocks: string[] = [];

  for (let i = 0; i < fragment.length; i++) {
    const child = fragment.get(i);
    if (child instanceof Y.XmlText) {
      blocks.push(child.toString());
    } else if (child instanceof Y.XmlElement) {
      blocks.push(extractTextFromElement(child));
    }
  }

  const rawText = blocks.join("\n");
  return clampBlockContent(rawText);
}

/** Block-level container node names that join children with newlines */
const BLOCK_CONTAINERS = new Set([
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "taskList",
  "taskItem",
]);

/**
 * Extracts text content from a Y.XmlElement node.
 * Block containers (lists, blockquotes) join their children with newlines.
 * Leaf block elements (paragraph, heading, codeBlock) concatenate inline text.
 */
function extractTextFromElement(element: Y.XmlElement): string {
  const isBlockContainer = BLOCK_CONTAINERS.has(element.nodeName);
  const parts: string[] = [];

  for (let i = 0; i < element.length; i++) {
    const child = element.get(i);
    if (child instanceof Y.XmlText) {
      parts.push(child.toString());
    } else if (child instanceof Y.XmlElement) {
      parts.push(extractTextFromElement(child));
    }
  }

  return isBlockContainer ? parts.join("\n") : parts.join("");
}
