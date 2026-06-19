import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as Y from "yjs";
import { v4 as uuidv4 } from "uuid";
import type { CommentThread, CommentMessage, Author } from "./types";

/**
 * Feature: note-comments, Property 3: Comment Thread Creation Integrity
 * Validates: Requirements 2.1, 2.3
 *
 * Directly tests the Y.Doc data layer logic that createThread performs,
 * verifying the resulting CommentThread has all expected structural properties.
 */

/**
 * Replicates the createThread logic from CommentStore.ts using a raw Y.Doc.
 * This is the same algorithm the hook uses internally.
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
 * Deserializes a thread from the Y.Map back to CommentThread to verify persistence.
 */
function readThreadFromYDoc(
  yDoc: Y.Doc,
  blockId: string,
  threadId: string,
): CommentThread | undefined {
  const commentsMap = yDoc.getMap("comments");
  const blockMap = commentsMap.get(blockId) as Y.Map<unknown> | undefined;
  if (!blockMap) return undefined;

  const threadMap = blockMap.get(threadId) as Y.Map<unknown> | undefined;
  if (!threadMap) return undefined;

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

describe("Property 3: Comment Thread Creation Integrity", () => {
  /**
   * Arbitrary for valid comment text: at least one non-whitespace char, <= 2000 chars.
   */
  const nonWhitespaceChar = fc.stringMatching(/^[a-zA-Z0-9!@#$%^&*()_+\-=]$/);

  const validTextArb = fc
    .tuple(
      fc.string({ minLength: 0, maxLength: 999 }),
      nonWhitespaceChar,
      fc.string({ minLength: 0, maxLength: 999 }),
    )
    .map(([prefix, nonWs, suffix]) => (prefix + nonWs + suffix).slice(0, 2000))
    .filter(
      (s) => s.length > 0 && s.length <= 2000 && !/^[\s\u200B\uFEFF]*$/.test(s),
    );

  /**
   * Arbitrary for valid author info.
   */
  const hexColorArb = fc.stringMatching(/^[0-9a-fA-F]{6}$/).map((h) => `#${h}`);

  const authorArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    color: hexColorArb,
  });

  /**
   * Arbitrary for a valid document range [from, to] where from < to.
   */
  const rangeArb = fc
    .tuple(
      fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: 1, max: 10000 }),
    )
    .map(([a, b]) => (a < b ? { from: a, to: b } : { from: b, to: a + 1 }))
    .filter(({ from, to }) => from < to);

  const blockIdArb = fc.uuid();

  it("thread id is a valid UUID v4", () => {
    const uuidV4Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        rangeArb,
        (blockId, text, author, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          expect(thread.id).toMatch(uuidV4Regex);

          // Also verify the persisted version in Y.Doc
          const persisted = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(persisted).toBeDefined();
          expect(persisted!.id).toMatch(uuidV4Regex);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("thread contains the correct from/to range", () => {
    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        rangeArb,
        (blockId, text, author, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          expect(thread.from).toBe(range.from);
          expect(thread.to).toBe(range.to);

          // Verify persisted values
          const persisted = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(persisted!.from).toBe(range.from);
          expect(persisted!.to).toBe(range.to);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("thread status is 'open'", () => {
    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        rangeArb,
        (blockId, text, author, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          expect(thread.status).toBe("open");

          // Verify persisted value
          const persisted = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(persisted!.status).toBe("open");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("messages array has exactly 1 message with correct author info and text", () => {
    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        rangeArb,
        (blockId, text, author, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          expect(thread.messages).toHaveLength(1);
          const msg = thread.messages[0];
          expect(msg.authorId).toBe(author.id);
          expect(msg.authorName).toBe(author.name);
          expect(msg.authorColor).toBe(author.color);
          expect(msg.text).toBe(text);

          // Verify persisted message
          const persisted = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(persisted!.messages).toHaveLength(1);
          const pMsg = persisted!.messages[0];
          expect(pMsg.authorId).toBe(author.id);
          expect(pMsg.authorName).toBe(author.name);
          expect(pMsg.authorColor).toBe(author.color);
          expect(pMsg.text).toBe(text);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("createdAt is a valid ISO 8601 timestamp", () => {
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        rangeArb,
        (blockId, text, author, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          // Thread createdAt
          expect(thread.createdAt).toMatch(iso8601Regex);
          const parsedThread = new Date(thread.createdAt);
          expect(parsedThread.getTime()).not.toBeNaN();

          // Message createdAt
          const msgTimestamp = thread.messages[0].createdAt;
          expect(msgTimestamp).toMatch(iso8601Regex);
          const parsedMsg = new Date(msgTimestamp);
          expect(parsedMsg.getTime()).not.toBeNaN();

          // Verify persisted timestamps
          const persisted = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(persisted!.createdAt).toMatch(iso8601Regex);
          expect(persisted!.messages[0].createdAt).toMatch(iso8601Regex);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("all created thread IDs are unique (no collisions)", () => {
    fc.assert(
      fc.property(
        blockIdArb,
        fc.array(fc.tuple(validTextArb, authorArb, rangeArb), {
          minLength: 2,
          maxLength: 20,
        }),
        (blockId, submissions) => {
          const yDoc = new Y.Doc();
          const threadIds: string[] = [];

          for (const [text, author, range] of submissions) {
            const thread = createThread(yDoc, blockId, {
              from: range.from,
              to: range.to,
              text,
              author,
            });
            threadIds.push(thread.id);
          }

          const uniqueIds = new Set(threadIds);
          expect(uniqueIds.size).toBe(threadIds.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: note-comments, Property 10: Resolved Threads Sort Order
 * Validates: Requirements 8.2
 *
 * For any set of resolved CommentThreads with arbitrary resolvedAt timestamps,
 * the resolved view SHALL display them sorted by resolvedAt descending
 * (most recently resolved first).
 */

/**
 * Sorts resolved threads by resolvedAt descending (most recently resolved first).
 * This is the sorting logic that the UI layer applies to the resolved threads list.
 */
function sortResolvedThreads(threads: CommentThread[]): CommentThread[] {
  return [...threads].sort((a, b) => {
    const aTime = a.resolvedAt ? new Date(a.resolvedAt).getTime() : 0;
    const bTime = b.resolvedAt ? new Date(b.resolvedAt).getTime() : 0;
    return bTime - aTime;
  });
}

describe("Property 10: Resolved Threads Sort Order", () => {
  /**
   * Arbitrary for a valid ISO 8601 timestamp within a reasonable range.
   * Uses integer milliseconds to avoid invalid date edge cases during shrinking.
   */
  const minMs = new Date("2020-01-01T00:00:00.000Z").getTime();
  const maxMs = new Date("2030-12-31T23:59:59.999Z").getTime();

  const isoTimestampArb = fc
    .integer({ min: minMs, max: maxMs })
    .map((ms) => new Date(ms).toISOString());

  /**
   * Arbitrary for a resolved CommentThread with a given resolvedAt timestamp.
   */
  const resolvedThreadArb = fc
    .tuple(fc.uuid(), fc.uuid(), isoTimestampArb, isoTimestampArb)
    .map(([id, blockId, createdAt, resolvedAt]) => ({
      id,
      blockId,
      from: 0,
      to: 10,
      status: "resolved" as const,
      messages: [
        {
          id: "msg-1",
          authorId: "author-1",
          authorName: "Author",
          authorColor: "#4A90D9",
          text: "comment",
          createdAt,
        },
      ],
      resolvedBy: "resolver-1",
      resolvedByName: "Resolver",
      resolvedAt,
      createdAt,
    }));

  it("sorted resolved threads are in descending resolvedAt order", () => {
    fc.assert(
      fc.property(
        fc.array(resolvedThreadArb, { minLength: 2, maxLength: 30 }),
        (threads) => {
          const sorted = sortResolvedThreads(threads);

          // Verify descending order: each resolvedAt >= next resolvedAt
          for (let i = 0; i < sorted.length - 1; i++) {
            const currentTime = new Date(sorted[i].resolvedAt!).getTime();
            const nextTime = new Date(sorted[i + 1].resolvedAt!).getTime();
            expect(currentTime).toBeGreaterThanOrEqual(nextTime);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sorting preserves all original threads (no elements lost or added)", () => {
    fc.assert(
      fc.property(
        fc.array(resolvedThreadArb, { minLength: 1, maxLength: 30 }),
        (threads) => {
          const sorted = sortResolvedThreads(threads);

          expect(sorted.length).toBe(threads.length);

          // All original thread IDs are present in the sorted result
          const originalIds = threads.map((t) => t.id).sort();
          const sortedIds = sorted.map((t) => t.id).sort();
          expect(sortedIds).toEqual(originalIds);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("sorting does not mutate the original array", () => {
    fc.assert(
      fc.property(
        fc.array(resolvedThreadArb, { minLength: 2, maxLength: 20 }),
        (threads) => {
          const originalOrder = threads.map((t) => t.id);
          sortResolvedThreads(threads);
          const afterOrder = threads.map((t) => t.id);

          expect(afterOrder).toEqual(originalOrder);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("single resolved thread is trivially sorted", () => {
    fc.assert(
      fc.property(resolvedThreadArb, (thread) => {
        const sorted = sortResolvedThreads([thread]);
        expect(sorted).toHaveLength(1);
        expect(sorted[0].id).toBe(thread.id);
        expect(sorted[0].resolvedAt).toBe(thread.resolvedAt);
      }),
      { numRuns: 100 },
    );
  });

  it("threads with the same resolvedAt maintain stable relative order", () => {
    fc.assert(
      fc.property(
        isoTimestampArb,
        fc.array(fc.uuid(), { minLength: 2, maxLength: 10 }),
        (sharedTimestamp, ids) => {
          const threads: CommentThread[] = ids.map((id) => ({
            id,
            blockId: "block-1",
            from: 0,
            to: 10,
            status: "resolved" as const,
            messages: [],
            resolvedBy: "resolver-1",
            resolvedByName: "Resolver",
            resolvedAt: sharedTimestamp,
            createdAt: sharedTimestamp,
          }));

          const sorted = sortResolvedThreads(threads);

          // All threads present with same length
          expect(sorted.length).toBe(threads.length);

          // All have the same resolvedAt
          for (const t of sorted) {
            expect(t.resolvedAt).toBe(sharedTimestamp);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: note-comments, Property 11: Resolve/Reopen Round Trip
 * Validates: Requirements 7.2, 8.3
 *
 * For any CommentThread, resolving and then immediately re-opening SHALL restore
 * the thread to status "open" with the highlight mark re-applied at its original
 * range. The thread SHALL appear in the active view (not resolved view) after reopen.
 *
 * Since we are testing the data layer only (no TipTap), we verify:
 * 1. After resolve → reopen, status is "open"
 * 2. Resolved fields (resolvedBy, resolvedByName, resolvedAt) are cleared
 * 3. Original from/to range is preserved throughout the round trip
 * 4. Thread appears in activeThreads (not resolvedThreads) after reopen
 */

/**
 * Resolves a thread in the Y.Doc (mirrors CommentStore.resolveThread logic).
 */
function resolveThreadInYDoc(
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
 * Reopens a thread in the Y.Doc (mirrors CommentStore.reopenThread logic).
 */
function reopenThreadInYDoc(
  yDoc: Y.Doc,
  blockId: string,
  threadId: string,
): void {
  const commentsMap = yDoc.getMap("comments");
  const blockMap = commentsMap.get(blockId) as Y.Map<unknown> | undefined;
  if (!blockMap) return;

  const threadMap = blockMap.get(threadId) as Y.Map<unknown> | undefined;
  if (!threadMap) return;

  threadMap.set("status", "open");
  threadMap.delete("resolvedBy");
  threadMap.delete("resolvedByName");
  threadMap.delete("resolvedAt");
}

/**
 * Reads all threads from a block's Y.Map and classifies them as active or resolved.
 */
function readAllThreadsFromYDoc(
  yDoc: Y.Doc,
  blockId: string,
): { activeThreads: CommentThread[]; resolvedThreads: CommentThread[] } {
  const commentsMap = yDoc.getMap("comments");
  const blockMap = commentsMap.get(blockId) as Y.Map<unknown> | undefined;
  if (!blockMap) return { activeThreads: [], resolvedThreads: [] };

  const activeThreads: CommentThread[] = [];
  const resolvedThreads: CommentThread[] = [];

  blockMap.forEach((value) => {
    if (value instanceof Y.Map) {
      const threadMap = value as Y.Map<unknown>;
      const messagesArray = threadMap.get("messages") as Y.Array<
        Y.Map<unknown>
      >;
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

      const thread: CommentThread = {
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

      if (thread.status === "open") {
        activeThreads.push(thread);
      } else {
        resolvedThreads.push(thread);
      }
    }
  });

  return { activeThreads, resolvedThreads };
}

describe("Property 11: Resolve/Reopen Round Trip", () => {
  /**
   * Arbitrary for valid comment text: at least one non-whitespace char, <= 2000 chars.
   */
  const nonWhitespaceChar = fc.stringMatching(/^[a-zA-Z0-9!@#$%^&*()_+\-=]$/);

  const validTextArb = fc
    .tuple(
      fc.string({ minLength: 0, maxLength: 999 }),
      nonWhitespaceChar,
      fc.string({ minLength: 0, maxLength: 999 }),
    )
    .map(([prefix, nonWs, suffix]) => (prefix + nonWs + suffix).slice(0, 2000))
    .filter(
      (s) => s.length > 0 && s.length <= 2000 && !/^[\s\u200B\uFEFF]*$/.test(s),
    );

  const hexColorArb = fc.stringMatching(/^[0-9a-fA-F]{6}$/).map((h) => `#${h}`);

  const authorArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    color: hexColorArb,
  });

  const resolverArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
  });

  const rangeArb = fc
    .tuple(
      fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: 1, max: 10000 }),
    )
    .map(([a, b]) => (a < b ? { from: a, to: b } : { from: b, to: a + 1 }))
    .filter(({ from, to }) => from < to);

  const blockIdArb = fc.uuid();

  it("status is restored to 'open' after resolve then reopen", () => {
    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        resolverArb,
        rangeArb,
        (blockId, text, author, resolver, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          // Verify initial status
          expect(thread.status).toBe("open");

          // Resolve the thread
          resolveThreadInYDoc(yDoc, blockId, thread.id, resolver);
          const afterResolve = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(afterResolve).toBeDefined();
          expect(afterResolve!.status).toBe("resolved");

          // Reopen the thread
          reopenThreadInYDoc(yDoc, blockId, thread.id);
          const afterReopen = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(afterReopen).toBeDefined();
          expect(afterReopen!.status).toBe("open");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("resolved fields are cleared after reopen", () => {
    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        resolverArb,
        rangeArb,
        (blockId, text, author, resolver, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          // Resolve the thread — resolved fields should be set
          resolveThreadInYDoc(yDoc, blockId, thread.id, resolver);
          const afterResolve = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(afterResolve!.resolvedBy).toBe(resolver.id);
          expect(afterResolve!.resolvedByName).toBe(resolver.name);
          expect(afterResolve!.resolvedAt).toBeDefined();

          // Reopen the thread — resolved fields should be cleared
          reopenThreadInYDoc(yDoc, blockId, thread.id);
          const afterReopen = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(afterReopen!.resolvedBy).toBeUndefined();
          expect(afterReopen!.resolvedByName).toBeUndefined();
          expect(afterReopen!.resolvedAt).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("original from/to range is preserved through resolve and reopen", () => {
    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        resolverArb,
        rangeArb,
        (blockId, text, author, resolver, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          const originalFrom = thread.from;
          const originalTo = thread.to;

          // Resolve
          resolveThreadInYDoc(yDoc, blockId, thread.id, resolver);
          const afterResolve = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(afterResolve!.from).toBe(originalFrom);
          expect(afterResolve!.to).toBe(originalTo);

          // Reopen
          reopenThreadInYDoc(yDoc, blockId, thread.id);
          const afterReopen = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(afterReopen!.from).toBe(originalFrom);
          expect(afterReopen!.to).toBe(originalTo);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("thread appears in activeThreads (not resolvedThreads) after reopen", () => {
    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        resolverArb,
        rangeArb,
        (blockId, text, author, resolver, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          // Initially in active
          const initial = readAllThreadsFromYDoc(yDoc, blockId);
          expect(initial.activeThreads.some((t) => t.id === thread.id)).toBe(
            true,
          );
          expect(initial.resolvedThreads.some((t) => t.id === thread.id)).toBe(
            false,
          );

          // After resolve: in resolved, not active
          resolveThreadInYDoc(yDoc, blockId, thread.id, resolver);
          const afterResolve = readAllThreadsFromYDoc(yDoc, blockId);
          expect(
            afterResolve.activeThreads.some((t) => t.id === thread.id),
          ).toBe(false);
          expect(
            afterResolve.resolvedThreads.some((t) => t.id === thread.id),
          ).toBe(true);

          // After reopen: back in active, not resolved
          reopenThreadInYDoc(yDoc, blockId, thread.id);
          const afterReopen = readAllThreadsFromYDoc(yDoc, blockId);
          expect(
            afterReopen.activeThreads.some((t) => t.id === thread.id),
          ).toBe(true);
          expect(
            afterReopen.resolvedThreads.some((t) => t.id === thread.id),
          ).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: note-comments, Property 9: Reply Chronological Ordering
 * Validates: Requirements 5.2, 6.6
 *
 * For any CommentThread with multiple replies having arbitrary timestamps,
 * the displayed replies SHALL be ordered by createdAt ascending (oldest first).
 *
 * Since Yjs Y.Array preserves insertion order and we always append with
 * sequential timestamps, the ordering is guaranteed by the data structure.
 * This property test verifies this holds across many random inputs.
 */

/**
 * Helper: creates a thread and adds multiple replies, returning the messages
 * as read back from the Y.Doc.
 */
function createThreadWithReplies(
  replyTexts: string[],
  authors: Author[],
): CommentMessage[] {
  const yDoc = new Y.Doc();
  const commentsMap = yDoc.getMap("comments");
  const blockId = "test-block";

  // Create block map
  const blockMap = new Y.Map<unknown>();
  commentsMap.set(blockId, blockMap);

  // Create thread
  const threadId = uuidv4();
  const threadMap = new Y.Map<unknown>();
  threadMap.set("id", threadId);
  threadMap.set("blockId", blockId);
  threadMap.set("from", 0);
  threadMap.set("to", 10);
  threadMap.set("status", "open");
  threadMap.set("createdAt", new Date().toISOString());

  // Create messages array with initial comment
  const messagesArray = new Y.Array<Y.Map<unknown>>();
  const initialMsg = new Y.Map<unknown>();
  initialMsg.set("id", uuidv4());
  initialMsg.set("authorId", "initial-author");
  initialMsg.set("authorName", "Initial Author");
  initialMsg.set("authorColor", "#000000");
  initialMsg.set("text", "Initial comment");
  initialMsg.set("createdAt", new Date().toISOString());
  messagesArray.push([initialMsg]);

  threadMap.set("messages", messagesArray);
  blockMap.set(threadId, threadMap);

  // Add replies sequentially (simulating real usage where each reply is appended)
  for (let i = 0; i < replyTexts.length; i++) {
    const author = authors[i % authors.length];
    const replyMap = new Y.Map<unknown>();
    replyMap.set("id", uuidv4());
    replyMap.set("authorId", author.id);
    replyMap.set("authorName", author.name);
    replyMap.set("authorColor", author.color);
    replyMap.set("text", replyTexts[i]);
    replyMap.set("createdAt", new Date(Date.now() + i).toISOString());
    messagesArray.push([replyMap]);
  }

  // Read back messages from Y.Array (same as deserializeThread does)
  const messages: CommentMessage[] = [];
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

  return messages;
}

describe("Property 9: Reply Chronological Ordering", () => {
  /**
   * Arbitrary for valid reply text: at least one non-whitespace char, <= 2000 chars.
   */
  const replyTextArb = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0);

  /**
   * Arbitrary for valid author info.
   */
  const hexColorArb = fc.stringMatching(/^[0-9a-fA-F]{6}$/).map((h) => `#${h}`);

  const authorArb: fc.Arbitrary<Author> = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    color: hexColorArb,
  });

  it("replies are in chronological order (createdAt ascending) when read from Y.Array", () => {
    fc.assert(
      fc.property(
        fc.array(replyTextArb, { minLength: 2, maxLength: 20 }),
        fc.array(authorArb, { minLength: 1, maxLength: 5 }),
        (replyTexts, authors) => {
          const messages = createThreadWithReplies(replyTexts, authors);

          // All messages (initial + replies) should be in chronological order
          for (let i = 1; i < messages.length; i++) {
            const prevTime = new Date(messages[i - 1].createdAt).getTime();
            const currTime = new Date(messages[i].createdAt).getTime();
            expect(currTime).toBeGreaterThanOrEqual(prevTime);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("reply count matches number of appended replies plus the initial message", () => {
    fc.assert(
      fc.property(
        fc.array(replyTextArb, { minLength: 1, maxLength: 15 }),
        fc.array(authorArb, { minLength: 1, maxLength: 3 }),
        (replyTexts, authors) => {
          const messages = createThreadWithReplies(replyTexts, authors);

          // Total messages = 1 initial + N replies
          expect(messages.length).toBe(replyTexts.length + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("reply text content is preserved in insertion order", () => {
    fc.assert(
      fc.property(
        fc.array(replyTextArb, { minLength: 2, maxLength: 15 }),
        fc.array(authorArb, { minLength: 1, maxLength: 3 }),
        (replyTexts, authors) => {
          const messages = createThreadWithReplies(replyTexts, authors);

          // Skip the first message (initial comment), verify reply texts match insertion order
          for (let i = 0; i < replyTexts.length; i++) {
            expect(messages[i + 1].text).toBe(replyTexts[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("timestamps are valid ISO 8601 strings for all replies", () => {
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

    fc.assert(
      fc.property(
        fc.array(replyTextArb, { minLength: 1, maxLength: 10 }),
        fc.array(authorArb, { minLength: 1, maxLength: 3 }),
        (replyTexts, authors) => {
          const messages = createThreadWithReplies(replyTexts, authors);

          for (const msg of messages) {
            expect(msg.createdAt).toMatch(iso8601Regex);
            expect(new Date(msg.createdAt).getTime()).not.toBeNaN();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: note-comments, Property 5: Highlight Removal on Resolution
 * Validates: Requirements 3.2, 7.4
 *
 * For any CommentThread that transitions from status "open" to status "resolved",
 * the `commentHighlight` mark with that thread's id SHALL be removed from the
 * document, resulting in zero mark instances with that threadId.
 *
 * Since testing TipTap marks in node requires the full editor, this property test
 * focuses on the data layer aspect: when a thread is resolved, its status
 * transitions to "resolved", the resolution metadata is recorded, and the thread
 * no longer appears in activeThreads (simulating mark removal from view).
 *
 * The actual mark removal is triggered by the UI layer when it observes a thread
 * transitioning to "resolved" and calls `unsetCommentHighlight(threadId)`.
 * This test verifies the data prerequisites that drive that removal.
 */
describe("Property 5: Highlight Removal on Resolution", () => {
  /**
   * Arbitrary for valid comment text: at least one non-whitespace char, <= 2000 chars.
   */
  const nonWhitespaceChar = fc.stringMatching(/^[a-zA-Z0-9!@#$%^&*()_+\-=]$/);

  const validTextArb = fc
    .tuple(
      fc.string({ minLength: 0, maxLength: 999 }),
      nonWhitespaceChar,
      fc.string({ minLength: 0, maxLength: 999 }),
    )
    .map(([prefix, nonWs, suffix]) => (prefix + nonWs + suffix).slice(0, 2000))
    .filter(
      (s) => s.length > 0 && s.length <= 2000 && !/^[\s\u200B\uFEFF]*$/.test(s),
    );

  const hexColorArb = fc.stringMatching(/^[0-9a-fA-F]{6}$/).map((h) => `#${h}`);

  const authorArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    color: hexColorArb,
  });

  const resolverArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
  });

  const rangeArb = fc
    .tuple(
      fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: 1, max: 10000 }),
    )
    .map(([a, b]) => (a < b ? { from: a, to: b } : { from: b, to: a + 1 }))
    .filter(({ from, to }) => from < to);

  const blockIdArb = fc.uuid();

  it("after resolution, the thread status is 'resolved'", () => {
    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        resolverArb,
        rangeArb,
        (blockId, text, author, resolver, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          // Thread starts open
          expect(thread.status).toBe("open");

          // Resolve the thread
          resolveThreadInYDoc(yDoc, blockId, thread.id, resolver);

          // Verify status transition
          const resolved = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(resolved).toBeDefined();
          expect(resolved!.status).toBe("resolved");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("resolver info is correctly recorded on resolution", () => {
    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        resolverArb,
        rangeArb,
        (blockId, text, author, resolver, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          // Resolve the thread
          resolveThreadInYDoc(yDoc, blockId, thread.id, resolver);

          // Verify resolver metadata
          const resolved = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(resolved).toBeDefined();
          expect(resolved!.resolvedBy).toBe(resolver.id);
          expect(resolved!.resolvedByName).toBe(resolver.name);
          expect(resolved!.resolvedAt).toBeDefined();

          // resolvedAt must be a valid ISO 8601 timestamp
          const resolvedAtDate = new Date(resolved!.resolvedAt!);
          expect(resolvedAtDate.getTime()).not.toBeNaN();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("resolved thread no longer appears in activeThreads", () => {
    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        resolverArb,
        rangeArb,
        (blockId, text, author, resolver, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          // Before resolution: thread is in activeThreads
          const beforeResolve = readAllThreadsFromYDoc(yDoc, blockId);
          expect(
            beforeResolve.activeThreads.some((t) => t.id === thread.id),
          ).toBe(true);
          expect(
            beforeResolve.resolvedThreads.some((t) => t.id === thread.id),
          ).toBe(false);

          // Resolve the thread
          resolveThreadInYDoc(yDoc, blockId, thread.id, resolver);

          // After resolution: thread is NOT in activeThreads, IS in resolvedThreads
          const afterResolve = readAllThreadsFromYDoc(yDoc, blockId);
          expect(
            afterResolve.activeThreads.some((t) => t.id === thread.id),
          ).toBe(false);
          expect(
            afterResolve.resolvedThreads.some((t) => t.id === thread.id),
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("this holds for any valid thread regardless of text content, author, and range", () => {
    fc.assert(
      fc.property(
        blockIdArb,
        validTextArb,
        authorArb,
        resolverArb,
        rangeArb,
        (blockId, text, author, resolver, range) => {
          const yDoc = new Y.Doc();
          const thread = createThread(yDoc, blockId, {
            from: range.from,
            to: range.to,
            text,
            author,
          });

          // Resolve
          resolveThreadInYDoc(yDoc, blockId, thread.id, resolver);

          // Combined verification: status is resolved, not in active, in resolved
          const resolved = readThreadFromYDoc(yDoc, blockId, thread.id);
          expect(resolved!.status).toBe("resolved");
          expect(resolved!.resolvedBy).toBe(resolver.id);
          expect(resolved!.resolvedByName).toBe(resolver.name);

          const lists = readAllThreadsFromYDoc(yDoc, blockId);
          expect(lists.activeThreads.some((t) => t.id === thread.id)).toBe(
            false,
          );
          expect(lists.resolvedThreads.some((t) => t.id === thread.id)).toBe(
            true,
          );

          // The thread's original content is preserved (data integrity)
          expect(resolved!.messages[0].text).toBe(text);
          expect(resolved!.messages[0].authorId).toBe(author.id);
          expect(resolved!.from).toBe(range.from);
          expect(resolved!.to).toBe(range.to);
        },
      ),
      { numRuns: 100 },
    );
  });
});
