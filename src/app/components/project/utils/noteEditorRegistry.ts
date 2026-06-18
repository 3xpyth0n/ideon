/**
 * A module-level registry that maps block IDs to their currently mounted
 * TipTap Editor instances. This allows the save/export path in
 * useProjectCanvasState to serialize Y.XmlFragment content to markdown
 * via getStableMarkdown(editor) without prop drilling.
 *
 * NoteBlock registers its editor on mount and unregisters on unmount.
 */
import type { Editor } from "@tiptap/react";

const editors = new Map<string, Editor>();

/**
 * Register a mounted editor instance for a given block ID.
 * Called by NoteBlock when the TipTap editor is ready.
 */
export function registerNoteEditor(blockId: string, editor: Editor): void {
  editors.set(blockId, editor);
}

/**
 * Unregister an editor instance for a given block ID.
 * Called by NoteBlock when the editor unmounts or is destroyed.
 */
export function unregisterNoteEditor(blockId: string): void {
  editors.delete(blockId);
}

/**
 * Get the currently mounted editor for a given block ID, if any.
 * Returns undefined if the block's editor is not mounted.
 */
export function getNoteEditor(blockId: string): Editor | undefined {
  const editor = editors.get(blockId);
  if (editor && editor.isDestroyed) {
    editors.delete(blockId);
    return undefined;
  }
  return editor;
}
