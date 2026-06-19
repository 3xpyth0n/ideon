import { useState, useEffect, useCallback, useMemo } from "react";
import * as Y from "yjs";
import { v4 as uuidv4 } from "uuid";
import { useYDoc } from "../YDocContext";
import type {
  CommentThread,
  CommentMessage,
  UseCommentStoreReturn,
  Author,
} from "./types";

/**
 * Deserializes a Y.Map representing a single message into a CommentMessage.
 */
function deserializeMessage(messageMap: Y.Map<unknown>): CommentMessage {
  return {
    id: (messageMap.get("id") as string) ?? "",
    authorId: (messageMap.get("authorId") as string) ?? "",
    authorName: (messageMap.get("authorName") as string) ?? "",
    authorColor: (messageMap.get("authorColor") as string) ?? "",
    text: (messageMap.get("text") as string) ?? "",
    createdAt: (messageMap.get("createdAt") as string) ?? "",
  };
}

/**
 * Deserializes a Y.Map representing a thread into a CommentThread.
 */
function deserializeThread(threadMap: Y.Map<unknown>): CommentThread {
  const messagesArray = threadMap.get("messages") as Y.Array<Y.Map<unknown>>;
  const messages: CommentMessage[] = [];
  if (messagesArray) {
    messagesArray.forEach((msgMap) => {
      messages.push(deserializeMessage(msgMap));
    });
  }

  return {
    id: (threadMap.get("id") as string) ?? "",
    blockId: (threadMap.get("blockId") as string) ?? "",
    from: (threadMap.get("from") as number) ?? 0,
    to: (threadMap.get("to") as number) ?? 0,
    status: (threadMap.get("status") as "open" | "resolved") ?? "open",
    messages,
    resolvedBy: threadMap.get("resolvedBy") as string | undefined,
    resolvedByName: threadMap.get("resolvedByName") as string | undefined,
    resolvedAt: threadMap.get("resolvedAt") as string | undefined,
    createdAt: (threadMap.get("createdAt") as string) ?? "",
  };
}

/**
 * Reads all threads from a block's Y.Map and returns them as an array.
 */
function readAllThreads(blockMap: Y.Map<unknown>): CommentThread[] {
  const threads: CommentThread[] = [];
  blockMap.forEach((value) => {
    if (value instanceof Y.Map) {
      threads.push(deserializeThread(value));
    }
  });
  return threads;
}

/**
 * Hook that provides a CRDT-backed comment store for a specific NoteBlock.
 * Uses Y.Map("comments") from the shared Y.Doc for real-time synchronization.
 */
export function useCommentStore(blockId: string): UseCommentStoreReturn {
  const yDoc = useYDoc();
  const [threads, setThreads] = useState<CommentThread[]>([]);

  // Get the top-level comments Y.Map
  const commentsMap = useMemo(() => {
    return yDoc.getMap("comments");
  }, [yDoc]);

  // Get the block-specific Y.Map (do NOT create eagerly — only create when needed)
  const blockMap = useMemo(() => {
    return commentsMap.get(blockId) as Y.Map<unknown> | undefined;
  }, [commentsMap, blockId]);

  // Helper to get or create blockMap lazily (only when writing)
  const getOrCreateBlockMap = useCallback(() => {
    let map = commentsMap.get(blockId) as Y.Map<unknown> | undefined;
    if (!map) {
      map = new Y.Map<unknown>();
      commentsMap.set(blockId, map);
    }
    return map;
  }, [commentsMap, blockId]);

  // Subscribe to deep changes on the block map for reactive updates
  useEffect(() => {
    if (!blockMap) {
      setThreads([]);
      return;
    }

    const updateThreads = () => {
      setThreads(readAllThreads(blockMap));
    };

    // Initial read
    updateThreads();

    // Observe deep changes
    blockMap.observeDeep(updateThreads);

    return () => {
      blockMap.unobserveDeep(updateThreads);
    };
  }, [blockMap]);

  const createThread = useCallback(
    (params: {
      from: number;
      to: number;
      text: string;
      author: Author;
    }): CommentThread | null => {
      const threadId = uuidv4();
      const now = new Date().toISOString();

      const messageMap = new Y.Map<unknown>();
      messageMap.set("id", uuidv4());
      messageMap.set("authorId", params.author.id);
      messageMap.set("authorName", params.author.name);
      messageMap.set("authorColor", params.author.color);
      messageMap.set("text", params.text);
      messageMap.set("createdAt", now);

      const messagesArray = new Y.Array<Y.Map<unknown>>();
      messagesArray.push([messageMap]);

      const threadMap = new Y.Map<unknown>();
      threadMap.set("id", threadId);
      threadMap.set("blockId", blockId);
      threadMap.set("from", params.from);
      threadMap.set("to", params.to);
      threadMap.set("status", "open");
      threadMap.set("messages", messagesArray);
      threadMap.set("createdAt", now);

      getOrCreateBlockMap().set(threadId, threadMap);

      return {
        id: threadId,
        blockId,
        from: params.from,
        to: params.to,
        status: "open",
        messages: [
          {
            id: messageMap.get("id") as string,
            authorId: params.author.id,
            authorName: params.author.name,
            authorColor: params.author.color,
            text: params.text,
            createdAt: now,
          },
        ],
        createdAt: now,
      };
    },
    [getOrCreateBlockMap, blockId],
  );

  const addReply = useCallback(
    (threadId: string, params: { text: string; author: Author }): void => {
      if (!blockMap) return;
      const threadMap = blockMap.get(threadId) as Y.Map<unknown> | undefined;
      if (!threadMap) return;

      const messagesArray = threadMap.get("messages") as
        | Y.Array<Y.Map<unknown>>
        | undefined;
      if (!messagesArray) return;

      const replyMap = new Y.Map<unknown>();
      replyMap.set("id", uuidv4());
      replyMap.set("authorId", params.author.id);
      replyMap.set("authorName", params.author.name);
      replyMap.set("authorColor", params.author.color);
      replyMap.set("text", params.text);
      replyMap.set("createdAt", new Date().toISOString());

      messagesArray.push([replyMap]);
    },
    [blockMap],
  );

  const resolveThread = useCallback(
    (threadId: string, resolver: { id: string; name: string }): void => {
      if (!blockMap) return;
      const threadMap = blockMap.get(threadId) as Y.Map<unknown> | undefined;
      if (!threadMap) return;

      threadMap.set("status", "resolved");
      threadMap.set("resolvedBy", resolver.id);
      threadMap.set("resolvedByName", resolver.name);
      threadMap.set("resolvedAt", new Date().toISOString());
    },
    [blockMap],
  );

  const reopenThread = useCallback(
    (threadId: string): void => {
      if (!blockMap) return;
      const threadMap = blockMap.get(threadId) as Y.Map<unknown> | undefined;
      if (!threadMap) return;

      threadMap.set("status", "open");
      threadMap.delete("resolvedBy");
      threadMap.delete("resolvedByName");
      threadMap.delete("resolvedAt");
    },
    [blockMap],
  );

  const deleteThread = useCallback(
    (threadId: string): void => {
      if (!blockMap) return;
      blockMap.delete(threadId);
    },
    [blockMap],
  );

  const getThread = useCallback(
    (threadId: string): CommentThread | undefined => {
      if (!blockMap) return undefined;
      const threadMap = blockMap.get(threadId) as Y.Map<unknown> | undefined;
      if (!threadMap) return undefined;
      return deserializeThread(threadMap);
    },
    [blockMap],
  );

  const activeThreads = useMemo(
    () => threads.filter((t) => t.status === "open"),
    [threads],
  );

  return {
    threads,
    activeThreads,
    createThread,
    addReply,
    resolveThread,
    reopenThread,
    deleteThread,
    getThread,
  };
}
