import type { Editor } from "@tiptap/react";

/**
 * Checks whether a document range [from, to] is still valid in the current editor state.
 * Returns true if the range is valid and contains text; false if the text has been deleted
 * or the positions are out of bounds.
 */
export function isRangeValid(
  editor: Editor,
  from: number,
  to: number,
): boolean {
  const { doc } = editor.state;

  // Check bounds
  if (from < 0 || to < 0 || from >= doc.content.size || to > doc.content.size) {
    return false;
  }

  // Check that from < to (non-empty range)
  if (from >= to) {
    return false;
  }

  // Check that the range contains some text content
  const slice = doc.slice(from, to);
  const textContent = slice.content.textBetween(0, slice.content.size, "", "");

  return textContent.length > 0;
}
