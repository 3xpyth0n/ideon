import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import type { UseCommentStoreReturn } from "./types";

/**
 * Detects orphaned threads (all highlighted text deleted) with debouncing.
 * Only runs when the document actually changes (not on selection-only transactions).
 */
export function usePositionTracking(
  editor: Editor | null,
  store: UseCommentStoreReturn,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editor) return;

    const checkOrphans = () => {
      const { doc } = editor.state;
      const markType = editor.schema.marks.commentHighlight;
      if (!markType || store.activeThreads.length === 0) return;

      const foundThreadIds = new Set<string>();

      doc.descendants((node) => {
        if (!node.isInline) return true;
        for (const mark of node.marks) {
          if (mark.type === markType && mark.attrs.threadId) {
            foundThreadIds.add(mark.attrs.threadId as string);
          }
        }
        return true;
      });

      for (const thread of store.activeThreads) {
        if (!foundThreadIds.has(thread.id)) {
          store.deleteThread(thread.id);
        }
      }
    };

    const handleTransaction = ({
      transaction,
    }: {
      transaction: { docChanged: boolean };
    }) => {
      if (!transaction.docChanged) return;

      // Debounce to avoid running on every keystroke
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(checkOrphans, 500);
    };

    editor.on("transaction", handleTransaction);
    return () => {
      editor.off("transaction", handleTransaction);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [editor, store]);
}
