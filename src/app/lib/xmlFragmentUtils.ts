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

/**
 * Syncs plain text into a Y.XmlFragment as ProseMirror-compatible paragraph nodes.
 *
 * - Applies `clampBlockContent` before writing
 * - Skips sync if extracted text already equals the new text (no-op detection)
 * - Clears existing XmlFragment content and replaces with paragraph nodes
 * - Each line becomes a Y.XmlElement("paragraph") containing a Y.XmlText
 * - Uses a single Y.Doc transaction for atomic update
 *
 * @param fragment - A Y.XmlFragment to write the text into
 * @param text - Plain text to sync (newlines create paragraph boundaries)
 */
export function syncTextToXmlFragment(
  fragment: Y.XmlFragment,
  text: string,
): void {
  const safeText = clampBlockContent(text);

  // No-op detection: skip if current content matches
  const currentText = extractTextFromXmlFragment(fragment);
  if (currentText === safeText) {
    return;
  }

  const doc = fragment.doc;
  const apply = () => {
    // Clear existing content
    while (fragment.length > 0) {
      fragment.delete(0, 1);
    }

    // Split into paragraphs and create ProseMirror-compatible nodes
    const lines = safeText.split("\n");
    for (const line of lines) {
      const paragraph = new Y.XmlElement("paragraph");
      const textNode = new Y.XmlText();
      textNode.insert(0, line);
      paragraph.insert(0, [textNode]);
      fragment.push([paragraph]);
    }
  };

  if (doc) {
    doc.transact(apply, doc.clientID);
  } else {
    apply();
  }
}
