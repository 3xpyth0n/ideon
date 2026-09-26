/**
 * Property-based test for deleteSubCanvasRecursive — Deletion Completeness
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as Y from "yjs";
import type { Node } from "@xyflow/react";
import type { BlockData } from "../CanvasBlock";
import { deleteSubCanvasRecursive } from "./subCanvasUtils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubCanvasTreeNode {
  id: string;
  children: SubCanvasTreeNode[];
}

// ---------------------------------------------------------------------------
// Helpers: populate Y.Doc from a tree, collect all canvas ids
// ---------------------------------------------------------------------------

/**
 * Populates a Y.Doc with fake block, link, content, noteDocument, and viewport
 * data for every node in the tree. Returns the flat list of all canvas ids
 * that were written (so tests can assert they are all cleared).
 */
function populateYDocFromTree(yDoc: Y.Doc, tree: SubCanvasTreeNode): string[] {
  const allIds: string[] = [];

  function populate(node: SubCanvasTreeNode): void {
    const { id, children } = node;
    allIds.push(id);

    yDoc.transact(() => {
      // blocks:<id> — add one plain block + one subcanvas block per child
      const blocksMap = yDoc.getMap<Node<BlockData>>(`blocks:${id}`);
      blocksMap.set(`plain-${id}`, {
        id: `plain-${id}`,
        type: "text",
        position: { x: 0, y: 0 },
        data: {
          blockType: "text",
          content: `hello from ${id}`,
          updatedAt: new Date().toISOString(),
          lastEditor: "test",
        },
      });

      for (const child of children) {
        blocksMap.set(child.id, {
          id: child.id,
          type: "subcanvas",
          position: { x: 10, y: 10 },
          data: {
            blockType: "subcanvas",
            content: "",
            updatedAt: new Date().toISOString(),
            lastEditor: "test",
          },
        });
      }

      // links:<id>
      const linksMap = yDoc.getMap(`links:${id}`);
      linksMap.set(`link-${id}`, { source: `plain-${id}`, target: "x" });

      // contents:<id>
      const contentsMap = yDoc.getMap(`contents:${id}`);
      contentsMap.set(`content-${id}`, `text content for ${id}`);

      // noteDocuments:<id>
      const noteDocumentsMap = yDoc.getMap(`noteDocuments:${id}`);
      noteDocumentsMap.set(`note-${id}`, `note for ${id}`);

      // viewports
      yDoc.getMap("viewports").set(id, { x: 100, y: 200, zoom: 1.5 });
    });

    for (const child of children) {
      populate(child);
    }
  }

  populate(tree);
  return allIds;
}

/**
 * Verifies that all four namespaced maps for a canvas id are empty and
 * that the viewports entry is absent.
 */
function assertCanvasFullyDeleted(yDoc: Y.Doc, canvasId: string): void {
  expect(
    yDoc.getMap(`blocks:${canvasId}`).size,
    `blocks:${canvasId} should be empty after deletion`,
  ).toBe(0);

  expect(
    yDoc.getMap(`links:${canvasId}`).size,
    `links:${canvasId} should be empty after deletion`,
  ).toBe(0);

  expect(
    yDoc.getMap(`contents:${canvasId}`).size,
    `contents:${canvasId} should be empty after deletion`,
  ).toBe(0);

  expect(
    yDoc.getMap(`noteDocuments:${canvasId}`).size,
    `noteDocuments:${canvasId} should be empty after deletion`,
  ).toBe(0);

  expect(
    yDoc.getMap("viewports").has(canvasId),
    `viewports should not contain key ${canvasId} after deletion`,
  ).toBe(false);
}

// ---------------------------------------------------------------------------
// fast-check arbitrary: random sub-canvas tree up to depth 5, ≤10 blocks/level
// ---------------------------------------------------------------------------

/**
 * Builds a sub-canvas tree iteratively from a seed integer.
 *
 * The seed drives a simple deterministic PRNG to decide child counts at each
 * level, keeping the tree small enough for fast test runs while still covering
 * a wide variety of shapes.
 *
 * We use a simple approach: represent the tree as a list of nodes where each
 * node stores its depth and child count. Generation is strictly iterative —
 * no recursion — to avoid stack overflows.
 */
function buildSubCanvasTree(
  // Per-level child-count caps: index = depth (0-based), value = max children
  levelMaxChildren: ReadonlyArray<number>,
  // Per-node child counts, consumed in BFS order
  childCounts: ReadonlyArray<number>,
  idPrefix: string,
): SubCanvasTreeNode {
  let nodeIndex = 0;
  let countIndex = 0;

  function makeId(): string {
    return `${idPrefix}-n${nodeIndex++}`;
  }

  // BFS queue: build tree top-down
  const rootId = makeId();
  const rootDepth = 0;

  // We store nodes in a map for quick lookup
  const nodeMap = new Map<string, SubCanvasTreeNode>();
  nodeMap.set(rootId, { id: rootId, children: [] });

  // BFS queue: [nodeId, depth]
  const queue: Array<[string, number]> = [[rootId, rootDepth]];

  while (queue.length > 0) {
    const [parentId, depth] = queue.shift()!;

    if (depth >= levelMaxChildren.length) continue;

    const maxKids = levelMaxChildren[depth] ?? 0;
    const rawCount = childCounts[countIndex++ % childCounts.length] ?? 0;
    const childCount = rawCount % (maxKids + 1); // 0..maxKids

    const parentNode = nodeMap.get(parentId)!;

    for (let i = 0; i < childCount; i++) {
      const childId = makeId();
      const childNode: SubCanvasTreeNode = { id: childId, children: [] };
      nodeMap.set(childId, childNode);
      parentNode.children.push(childNode);
      queue.push([childId, depth + 1]);
    }
  }

  return nodeMap.get(rootId)!;
}

/**
 * Generates an arbitrary sub-canvas tree up to depth 5 with up to 10 children
 * per node. Completely non-recursive to avoid stack overflows.
 */
function buildSubCanvasTreeArbitrary(): fc.Arbitrary<SubCanvasTreeNode> {
  // levelMaxChildren: how many children are allowed at each depth (0..4)
  const levelMaxChildrenArb = fc.array(fc.integer({ min: 0, max: 10 }), {
    minLength: 1,
    maxLength: 5,
  });

  // childCounts: a flat pool of child counts consumed in BFS order
  const childCountsArb = fc.array(fc.integer({ min: 0, max: 10 }), {
    minLength: 1,
    maxLength: 50,
  });

  const prefixArb = fc.integer({ min: 1000, max: 9999 }).map((n) => `p${n}`);

  return fc
    .tuple(levelMaxChildrenArb, childCountsArb, prefixArb)
    .map(([levelMaxChildren, childCounts, prefix]) =>
      buildSubCanvasTree(levelMaxChildren, childCounts, prefix),
    );
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("Property 4: Deletion Completeness — deleteSubCanvasRecursive", () => {
  it("all namespaced maps are empty and viewports entry is absent after deletion (any tree, any depth ≤ 5)", () => {
    fc.assert(
      fc.property(buildSubCanvasTreeArbitrary(), (tree) => {
        const yDoc = new Y.Doc();
        const allIds = populateYDocFromTree(yDoc, tree);

        // Pre-condition: at least the root canvas has data
        expect(yDoc.getMap(`blocks:${tree.id}`).size).toBeGreaterThan(0);

        // Act
        deleteSubCanvasRecursive(yDoc, tree.id);

        // Assert: every canvas id in the hierarchy is fully cleared
        for (const id of allIds) {
          assertCanvasFullyDeleted(yDoc, id);
        }
      }),
      { numRuns: 100 },
    );
  }, 30_000);

  it("deletion of a leaf canvas (no children) clears exactly its four maps and viewport entry", () => {
    fc.assert(
      fc.property(fc.uuid(), (canvasId) => {
        const yDoc = new Y.Doc();

        const leafTree: SubCanvasTreeNode = { id: canvasId, children: [] };
        populateYDocFromTree(yDoc, leafTree);

        // Pre-condition: leaf has data
        expect(yDoc.getMap(`blocks:${canvasId}`).size).toBeGreaterThan(0);

        deleteSubCanvasRecursive(yDoc, canvasId);

        assertCanvasFullyDeleted(yDoc, canvasId);
      }),
      { numRuns: 100 },
    );
  });

  it("deletion of a root canvas does not affect sibling canvas namespaces", () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (canvasA, canvasB) => {
        // Ensure IDs are distinct
        if (canvasA === canvasB) return;

        const yDoc = new Y.Doc();

        // Populate both canvases as independent leaf trees
        populateYDocFromTree(yDoc, { id: canvasA, children: [] });
        populateYDocFromTree(yDoc, { id: canvasB, children: [] });

        const bBlocksBefore = yDoc.getMap(`blocks:${canvasB}`).size;
        const bLinksBefore = yDoc.getMap(`links:${canvasB}`).size;
        const bContentsBefore = yDoc.getMap(`contents:${canvasB}`).size;
        const bNoteDocsBefore = yDoc.getMap(`noteDocuments:${canvasB}`).size;
        const bViewportBefore = yDoc.getMap("viewports").has(canvasB);

        // Delete only canvas A
        deleteSubCanvasRecursive(yDoc, canvasA);

        // Canvas A is fully cleared
        assertCanvasFullyDeleted(yDoc, canvasA);

        // Canvas B is completely unaffected
        expect(yDoc.getMap(`blocks:${canvasB}`).size).toBe(bBlocksBefore);
        expect(yDoc.getMap(`links:${canvasB}`).size).toBe(bLinksBefore);
        expect(yDoc.getMap(`contents:${canvasB}`).size).toBe(bContentsBefore);
        expect(yDoc.getMap(`noteDocuments:${canvasB}`).size).toBe(
          bNoteDocsBefore,
        );
        expect(yDoc.getMap("viewports").has(canvasB)).toBe(bViewportBefore);
      }),
      { numRuns: 100 },
    );
  });

  it("deletion is idempotent — calling deleteSubCanvasRecursive twice leaves all maps empty", () => {
    fc.assert(
      fc.property(buildSubCanvasTreeArbitrary(), (tree) => {
        const yDoc = new Y.Doc();
        const allIds = populateYDocFromTree(yDoc, tree);

        // First deletion
        deleteSubCanvasRecursive(yDoc, tree.id);
        for (const id of allIds) {
          assertCanvasFullyDeleted(yDoc, id);
        }

        // Second deletion — must not throw
        expect(() => deleteSubCanvasRecursive(yDoc, tree.id)).not.toThrow();

        // Still fully cleared
        for (const id of allIds) {
          assertCanvasFullyDeleted(yDoc, id);
        }
      }),
      { numRuns: 100 },
    );
  }, 30_000);
});
