import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import type { CommentThread } from "./types";

/**
 * Synchronizes CommentHighlight marks in the editor with the comment store state.
 * - Applies highlights for newly created threads (from remote)
 * - Removes highlights for deleted threads (from remote)
 */
export function useHighlightSync(
  editor: Editor | null,
  threads: CommentThread[],
): void {
  const prevThreadsRef = useRef<CommentThread[]>([]);

  useEffect(() => {
    if (!editor) return;

    const prevThreads = prevThreadsRef.current;
    const prevMap = new Map(prevThreads.map((t) => [t.id, t]));
    const currentMap = new Map(threads.map((t) => [t.id, t]));

    // New threads: exist in current but not in prev → apply highlight
    for (const thread of threads) {
      if (!prevMap.has(thread.id)) {
        const color = thread.messages[0]?.authorColor ?? "#6B7280";
        editor
          .chain()
          .setTextSelection({ from: thread.from, to: thread.to })
          .setCommentHighlight({ threadId: thread.id, color })
          .run();
      }
    }

    // Deleted threads: existed in prev but not in current → remove highlight
    for (const prev of prevThreads) {
      if (!currentMap.has(prev.id)) {
        editor.commands.unsetCommentHighlight(prev.id);
      }
    }

    prevThreadsRef.current = threads;
  }, [editor, threads]);
}
