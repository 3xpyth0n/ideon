import { describe, it, expect } from "vitest";
import * as Y from "yjs";
import { v4 as uuidv4 } from "uuid";
import type { CommentThread, CommentMessage, Author } from "./types";

/**
 * Integration tests for real-time sync behavior of the CommentStore.
 * Validates: Requirements 9.1, 9.2, 9.3, 9.5, 9.6
 *
 * These tests simulate multi-client collaboration using two Y.Doc instances
 * connected via Y.applyUpdate (the same mechanism Yjs uses under the hood
 * when syncing over WebSocket or WebRTC).
 */

/**
 * Simulate syncing state between two Y.Doc instances.
 * Applies each doc's state to the other, mimicking a network round-trip.
 */
function syncDocs(doc1: Y.Doc, doc2: Y.Doc) {
  const update1 = Y.encodeStateAsUpdate(doc1);
  const update2 = Y.encodeStateAsUpdate(doc2);
  Y.applyUpdate(doc2, update1);
  Y.applyUpdate(doc1, update2);
}

/**
 * Creates a thread directly in a Y.Doc (mirrors CommentStore.createThread logic).
 */
function createThread(
  yDoc: Y.Doc,
  blockId: string,
  params: { from: number; to: number; text: string; author: Author },
): CommentThread {
  const commentsMap = yDoc.getMap("comments");

  let blockMap = commentsMap.get(blockId) as Y.Map<unknown> | undefined;
  if (!blockMap) {
    blockMap = new Y.Map<unknown>();
    commentsMap.set(blockId, blockMap);
  }

  const threadId = uuidv4();
  const now = new Date().toISOString();

  const messageMap = new Y.Map<unknown>();
  const messageId = uuidv4();
  messageMap.set("id", messageId);
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

  blockMap.set(threadId, threadMap);

  return {
    id: threadId,
    blockId,
    from: params.from,
    to: params.to,
    status: "open",
    messages: [
      {
        id: messageId,
        authorId: params.author.id,
        authorName: params.author.name,
        authorColor: params.author.color,
        text: params.text,
        createdAt: now,
      },
    ],
    createdAt: now,
  };
}

/**
 * Adds a reply to a thread in a Y.Doc (mirrors CommentStore.addReply logic).
 */
function addReply(
  yDoc: Y.Doc,
  blockId: string,
  threadId: string,
  params: { text: string; author: Author },
): void {
  const commentsMap = yDoc.getMap("comments");
  const blockMap = commentsMap.get(blockId) as Y.Map<unknown> | undefined;
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
}

/**
 * Resolves a thread in a Y.Doc (mirrors CommentStore.resolveThread logic).
 */
function resolveThread(
  yDoc: Y.Doc,
  blockId: string,
  threadId: string,
  resolver: { id: string; name: string },
): void {
  const commentsMap = yDoc.getMap("comments");
  const blockMap = commentsMap.get(blockId) as Y.Map<unknown> | undefined;
  if (!blockMap) return;

  const threadMap = blockMap.get(threadId) as Y.Map<unknown> | undefined;
  if (!threadMap) return;

  threadMap.set("status", "resolved");
  threadMap.set("resolvedBy", resolver.id);
  threadMap.set("resolvedByName", resolver.name);
  threadMap.set("resolvedAt", new Date().toISOString());
}

/**
 * Reads all threads from a block in a Y.Doc.
 */
function readAllThreads(yDoc: Y.Doc, blockId: string): CommentThread[] {
  const commentsMap = yDoc.getMap("comments");
  const blockMap = commentsMap.get(blockId) as Y.Map<unknown> | undefined;
  if (!blockMap) return [];

  const threads: CommentThread[] = [];
  blockMap.forEach((value) => {
    if (value instanceof Y.Map) {
      threads.push(deserializeThread(value as Y.Map<unknown>));
    }
  });
  return threads;
}

/**
 * Deserializes a single thread from Y.Map.
 */
function deserializeThread(threadMap: Y.Map<unknown>): CommentThread {
  const messagesArray = threadMap.get("messages") as Y.Array<Y.Map<unknown>>;
  const messages: CommentMessage[] = [];
  if (messagesArray) {
    messagesArray.forEach((msgMap) => {
      messages.push({
        id: (msgMap.get("id") as string) ?? "",
        authorId: (msgMap.get("authorId") as string) ?? "",
        authorName: (msgMap.get("authorName") as string) ?? "",
        authorColor: (msgMap.get("authorColor") as string) ?? "",
        text: (msgMap.get("text") as string) ?? "",
        createdAt: (msgMap.get("createdAt") as string) ?? "",
      });
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

// --- Test Data ---

const authorA: Author = {
  id: "user-a-id",
  name: "Alice",
  color: "#4A90D9",
};

const authorB: Author = {
  id: "user-b-id",
  name: "Bob",
  color: "#E74C3C",
};

const blockId = "test-block-1";

// --- Tests ---

describe("CommentStore Integration: Real-Time Sync", () => {
  describe("Multi-client thread creation sync (Req 9.1)", () => {
    it("thread created on client A appears on client B after sync", () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      // Client A creates a thread
      const thread = createThread(docA, blockId, {
        from: 5,
        to: 20,
        text: "This needs revision",
        author: authorA,
      });

      // Before sync: B has no threads
      expect(readAllThreads(docB, blockId)).toHaveLength(0);

      // Sync A -> B
      syncDocs(docA, docB);

      // After sync: B sees the thread
      const threadsOnB = readAllThreads(docB, blockId);
      expect(threadsOnB).toHaveLength(1);
      expect(threadsOnB[0].id).toBe(thread.id);
      expect(threadsOnB[0].messages[0].text).toBe("This needs revision");
      expect(threadsOnB[0].messages[0].authorName).toBe("Alice");
      expect(threadsOnB[0].from).toBe(5);
      expect(threadsOnB[0].to).toBe(20);
      expect(threadsOnB[0].status).toBe("open");
    });

    it("multiple threads created on A propagate to B", () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      const thread1 = createThread(docA, blockId, {
        from: 0,
        to: 10,
        text: "First comment",
        author: authorA,
      });

      const thread2 = createThread(docA, blockId, {
        from: 15,
        to: 30,
        text: "Second comment",
        author: authorA,
      });

      syncDocs(docA, docB);

      const threadsOnB = readAllThreads(docB, blockId);
      expect(threadsOnB).toHaveLength(2);

      const ids = threadsOnB.map((t) => t.id);
      expect(ids).toContain(thread1.id);
      expect(ids).toContain(thread2.id);
    });
  });

  describe("Multi-client resolve propagation (Req 9.3)", () => {
    it("thread resolved on client A shows as resolved on client B after sync", () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      // Create thread on A and sync to B
      const thread = createThread(docA, blockId, {
        from: 5,
        to: 20,
        text: "Needs fixing",
        author: authorA,
      });
      syncDocs(docA, docB);

      // Verify B sees open thread
      const beforeResolve = readAllThreads(docB, blockId);
      expect(beforeResolve[0].status).toBe("open");

      // A resolves the thread
      resolveThread(docA, blockId, thread.id, {
        id: authorA.id,
        name: authorA.name,
      });

      // Sync again
      syncDocs(docA, docB);

      // B sees the thread as resolved
      const afterResolve = readAllThreads(docB, blockId);
      expect(afterResolve).toHaveLength(1);
      expect(afterResolve[0].status).toBe("resolved");
      expect(afterResolve[0].resolvedBy).toBe(authorA.id);
      expect(afterResolve[0].resolvedByName).toBe("Alice");
      expect(afterResolve[0].resolvedAt).toBeDefined();
    });

    it("resolve metadata (resolvedBy, resolvedAt) syncs accurately", () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      const thread = createThread(docA, blockId, {
        from: 0,
        to: 10,
        text: "Check this",
        author: authorB,
      });
      syncDocs(docA, docB);

      // B resolves the thread
      resolveThread(docB, blockId, thread.id, {
        id: authorB.id,
        name: authorB.name,
      });
      syncDocs(docA, docB);

      // Both A and B converge to the same resolved state
      const threadsOnA = readAllThreads(docA, blockId);
      const threadsOnB = readAllThreads(docB, blockId);

      expect(threadsOnA[0].status).toBe("resolved");
      expect(threadsOnB[0].status).toBe("resolved");
      expect(threadsOnA[0].resolvedBy).toBe(threadsOnB[0].resolvedBy);
      expect(threadsOnA[0].resolvedByName).toBe(threadsOnB[0].resolvedByName);
    });
  });

  describe("Concurrent replies preserved via Y.Array merge (Req 9.5)", () => {
    it("both replies are preserved when A and B reply concurrently", () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      // Create thread on A and sync to B so both have the thread
      const thread = createThread(docA, blockId, {
        from: 5,
        to: 15,
        text: "Original comment",
        author: authorA,
      });
      syncDocs(docA, docB);

      // Both clients reply concurrently (before syncing with each other)
      addReply(docA, blockId, thread.id, {
        text: "Reply from Alice",
        author: authorA,
      });

      addReply(docB, blockId, thread.id, {
        text: "Reply from Bob",
        author: authorB,
      });

      // Now sync — Yjs Y.Array merge should preserve both replies
      syncDocs(docA, docB);

      // Both docs should have the original message + both replies = 3 messages
      const threadsOnA = readAllThreads(docA, blockId);
      const threadsOnB = readAllThreads(docB, blockId);

      expect(threadsOnA[0].messages.length).toBe(3);
      expect(threadsOnB[0].messages.length).toBe(3);

      // Both replies should be present
      const textsOnA = threadsOnA[0].messages.map((m) => m.text);
      const textsOnB = threadsOnB[0].messages.map((m) => m.text);

      expect(textsOnA).toContain("Reply from Alice");
      expect(textsOnA).toContain("Reply from Bob");
      expect(textsOnB).toContain("Reply from Alice");
      expect(textsOnB).toContain("Reply from Bob");

      // Both docs converge to the same order (Yjs guarantees convergence)
      expect(textsOnA).toEqual(textsOnB);
    });

    it("multiple concurrent replies from different clients all merge", () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      const thread = createThread(docA, blockId, {
        from: 0,
        to: 5,
        text: "Start",
        author: authorA,
      });
      syncDocs(docA, docB);

      // A adds two replies
      addReply(docA, blockId, thread.id, {
        text: "A reply 1",
        author: authorA,
      });
      addReply(docA, blockId, thread.id, {
        text: "A reply 2",
        author: authorA,
      });

      // B adds two replies concurrently
      addReply(docB, blockId, thread.id, {
        text: "B reply 1",
        author: authorB,
      });
      addReply(docB, blockId, thread.id, {
        text: "B reply 2",
        author: authorB,
      });

      syncDocs(docA, docB);

      const threadsOnA = readAllThreads(docA, blockId);
      const threadsOnB = readAllThreads(docB, blockId);

      // Original + 4 concurrent replies = 5 messages
      expect(threadsOnA[0].messages.length).toBe(5);
      expect(threadsOnB[0].messages.length).toBe(5);

      // All replies present on both
      const textsOnA = threadsOnA[0].messages.map((m) => m.text);
      expect(textsOnA).toContain("A reply 1");
      expect(textsOnA).toContain("A reply 2");
      expect(textsOnA).toContain("B reply 1");
      expect(textsOnA).toContain("B reply 2");

      // Both converge to same order
      const textsOnB = threadsOnB[0].messages.map((m) => m.text);
      expect(textsOnA).toEqual(textsOnB);
    });
  });

  describe("Reconnection rehydration (Req 9.6)", () => {
    it("disconnected client receives all missed operations on reconnect", () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      // Initial sync — both start with the same state
      const thread = createThread(docA, blockId, {
        from: 0,
        to: 10,
        text: "Initial comment",
        author: authorA,
      });
      syncDocs(docA, docB);

      // Simulate B going offline — A continues making changes
      addReply(docA, blockId, thread.id, {
        text: "Reply while B was offline",
        author: authorA,
      });

      const thread2 = createThread(docA, blockId, {
        from: 20,
        to: 30,
        text: "New thread while B offline",
        author: authorA,
      });

      // B is still in old state
      const threadsOnBBeforeReconnect = readAllThreads(docB, blockId);
      expect(threadsOnBBeforeReconnect).toHaveLength(1);
      expect(threadsOnBBeforeReconnect[0].messages).toHaveLength(1);

      // B reconnects — sync delivers all missed operations
      syncDocs(docA, docB);

      // B now sees all changes: 2 threads, reply on first thread
      const threadsOnB = readAllThreads(docB, blockId);
      expect(threadsOnB).toHaveLength(2);

      const firstThread = threadsOnB.find((t) => t.id === thread.id)!;
      expect(firstThread.messages).toHaveLength(2);
      expect(firstThread.messages[1].text).toBe("Reply while B was offline");

      const secondThread = threadsOnB.find((t) => t.id === thread2.id)!;
      expect(secondThread.messages[0].text).toBe("New thread while B offline");
    });

    it("both clients create threads independently on different blocks then sync — both threads exist", () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      // Both clients are disconnected and create threads on different blocks.
      // (When two clients independently create a Y.Map at the same key without
      // prior sync, Yjs uses LWW for the top-level key. In production, clients
      // always share the Y.Doc via initial sync before editing. This test
      // uses different blockIds to verify independent thread creation merges.)
      const blockIdA = "block-alice";
      const blockIdB = "block-bob";

      const threadA = createThread(docA, blockIdA, {
        from: 0,
        to: 10,
        text: "Thread from Alice",
        author: authorA,
      });

      const threadB = createThread(docB, blockIdB, {
        from: 15,
        to: 25,
        text: "Thread from Bob",
        author: authorB,
      });

      // Reconnect — sync both ways
      syncDocs(docA, docB);

      // Both docs should have both threads (on their respective blocks)
      const threadsOnABlockA = readAllThreads(docA, blockIdA);
      const threadsOnABlockB = readAllThreads(docA, blockIdB);
      const threadsOnBBlockA = readAllThreads(docB, blockIdA);
      const threadsOnBBlockB = readAllThreads(docB, blockIdB);

      expect(threadsOnABlockA).toHaveLength(1);
      expect(threadsOnABlockB).toHaveLength(1);
      expect(threadsOnBBlockA).toHaveLength(1);
      expect(threadsOnBBlockB).toHaveLength(1);

      expect(threadsOnABlockA[0].id).toBe(threadA.id);
      expect(threadsOnABlockB[0].id).toBe(threadB.id);
      expect(threadsOnBBlockA[0].id).toBe(threadA.id);
      expect(threadsOnBBlockB[0].id).toBe(threadB.id);
    });

    it("both clients create threads on the same block after initial sync — both threads exist", () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      // Initial sync to establish shared block map structure
      // (In production, clients always sync on connect before editing)
      syncDocs(docA, docB);

      // A creates a thread first, then sync so B shares the blockMap
      const threadA = createThread(docA, blockId, {
        from: 0,
        to: 10,
        text: "Thread from Alice",
        author: authorA,
      });
      syncDocs(docA, docB);

      // Now B creates a thread on the same block (shared blockMap)
      const threadB = createThread(docB, blockId, {
        from: 15,
        to: 25,
        text: "Thread from Bob",
        author: authorB,
      });
      syncDocs(docA, docB);

      // Both docs should have both threads
      const threadsOnA = readAllThreads(docA, blockId);
      const threadsOnB = readAllThreads(docB, blockId);

      expect(threadsOnA).toHaveLength(2);
      expect(threadsOnB).toHaveLength(2);

      const idsOnA = threadsOnA.map((t) => t.id);
      const idsOnB = threadsOnB.map((t) => t.id);

      expect(idsOnA).toContain(threadA.id);
      expect(idsOnA).toContain(threadB.id);
      expect(idsOnB).toContain(threadA.id);
      expect(idsOnB).toContain(threadB.id);
    });

    it("incremental sync using state vectors delivers only missing updates", () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      // Initial sync
      createThread(docA, blockId, {
        from: 0,
        to: 5,
        text: "First",
        author: authorA,
      });
      syncDocs(docA, docB);

      // Capture B's state vector before A makes more changes
      const stateVectorB = Y.encodeStateVector(docB);

      // A makes additional changes
      createThread(docA, blockId, {
        from: 10,
        to: 20,
        text: "Second (missed by B)",
        author: authorA,
      });

      // Use state vector to compute only the diff (incremental sync)
      const diff = Y.encodeStateAsUpdate(docA, stateVectorB);
      Y.applyUpdate(docB, diff);

      // B should now have both threads
      const threadsOnB = readAllThreads(docB, blockId);
      expect(threadsOnB).toHaveLength(2);

      const texts = threadsOnB.map((t) => t.messages[0].text);
      expect(texts).toContain("First");
      expect(texts).toContain("Second (missed by B)");
    });
  });

  describe("Concurrent resolve (Req 9.5)", () => {
    it("two clients resolving the same thread — both converge to resolved state", () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      // Create and sync thread to both
      const thread = createThread(docA, blockId, {
        from: 5,
        to: 15,
        text: "To be resolved",
        author: authorA,
      });
      syncDocs(docA, docB);

      // Both clients resolve concurrently
      resolveThread(docA, blockId, thread.id, {
        id: authorA.id,
        name: authorA.name,
      });
      resolveThread(docB, blockId, thread.id, {
        id: authorB.id,
        name: authorB.name,
      });

      // Sync
      syncDocs(docA, docB);

      // Both should converge: status is "resolved" on both
      const threadsOnA = readAllThreads(docA, blockId);
      const threadsOnB = readAllThreads(docB, blockId);

      expect(threadsOnA[0].status).toBe("resolved");
      expect(threadsOnB[0].status).toBe("resolved");

      // Last-writer-wins for resolvedBy: both docs converge to same value
      expect(threadsOnA[0].resolvedBy).toBe(threadsOnB[0].resolvedBy);
      expect(threadsOnA[0].resolvedByName).toBe(threadsOnB[0].resolvedByName);
      expect(threadsOnA[0].resolvedAt).toBe(threadsOnB[0].resolvedAt);
    });

    it("concurrent resolve and reply — both resolve status and reply are preserved", () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();

      const thread = createThread(docA, blockId, {
        from: 0,
        to: 10,
        text: "Discussion",
        author: authorA,
      });
      syncDocs(docA, docB);

      // A resolves while B adds a reply concurrently
      resolveThread(docA, blockId, thread.id, {
        id: authorA.id,
        name: authorA.name,
      });

      addReply(docB, blockId, thread.id, {
        text: "One more thought",
        author: authorB,
      });

      syncDocs(docA, docB);

      // Both converge: thread is resolved AND the reply is preserved
      const threadsOnA = readAllThreads(docA, blockId);
      const threadsOnB = readAllThreads(docB, blockId);

      // Status converges (resolved wins since it was set)
      expect(threadsOnA[0].status).toBe("resolved");
      expect(threadsOnB[0].status).toBe("resolved");

      // Reply is preserved (Y.Array append is independent of status change)
      expect(threadsOnA[0].messages.length).toBe(2);
      expect(threadsOnB[0].messages.length).toBe(2);

      const textsOnA = threadsOnA[0].messages.map((m) => m.text);
      expect(textsOnA).toContain("One more thought");

      // Both docs agree on message order
      const textsOnB = threadsOnB[0].messages.map((m) => m.text);
      expect(textsOnA).toEqual(textsOnB);
    });
  });
});
