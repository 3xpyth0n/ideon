import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  computePosition,
  computeBatchPositions,
  resolveCollision,
  hasCollision,
  getDefaultWidth,
  getDefaultHeight,
  GAP,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  MAX_GRID_COLUMNS,
  type ExistingBlock,
  type PlacementInput,
} from "./placement-engine";

// ─── 15.1 computePosition with empty canvas → (0, 0) ────────────────────────

describe("computePosition — empty canvas", () => {
  it("returns (0, 0) when no existing blocks and no explicit position", () => {
    const input: PlacementInput = { blockType: "text" };
    const result = computePosition(input, []);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it("returns (0, 0) for any block type on empty canvas", () => {
    for (const blockType of ["text", "kanban", "sketch", "frame", "note"]) {
      const result = computePosition({ blockType }, []);
      expect(result).toEqual({ x: 0, y: 0 });
    }
  });
});

// ─── 15.2 Explicit position → exact coordinates regardless of collisions ─────

describe("computePosition — explicit position", () => {
  it("returns exact coordinates when position is specified", () => {
    const input: PlacementInput = {
      blockType: "text",
      position: { x: 150, y: 250 },
    };
    const result = computePosition(input, []);
    expect(result).toEqual({ x: 150, y: 250 });
  });

  it("ignores collisions when explicit position is given", () => {
    const existingBlocks: ExistingBlock[] = [
      { x: 100, y: 100, width: 320, height: 240 },
    ];
    // Place directly on top of an existing block
    const input: PlacementInput = {
      blockType: "text",
      position: { x: 100, y: 100 },
    };
    const result = computePosition(input, existingBlocks);
    expect(result).toEqual({ x: 100, y: 100 });
  });

  it("ignores anchor when explicit position is given", () => {
    const anchor: ExistingBlock = { x: 500, y: 500, width: 320, height: 240 };
    const input: PlacementInput = {
      blockType: "text",
      position: { x: 0, y: 0 },
      anchorBlockId: "some-id",
      direction: "right",
    };
    const result = computePosition(input, [anchor], anchor);
    expect(result).toEqual({ x: 0, y: 0 });
  });
});

// ─── 15.3 Anchor + direction → correct relative placement ────────────────────

describe("computePosition — anchor + direction", () => {
  const anchor: ExistingBlock = { x: 100, y: 100, width: 320, height: 240 };

  it("places to the right of anchor", () => {
    const input: PlacementInput = { blockType: "text", direction: "right" };
    const result = computePosition(input, [anchor], anchor);
    // right: anchor.x + anchor.width + GAP
    expect(result.x).toBe(100 + 320 + GAP);
    expect(result.y).toBe(100);
  });

  it("places to the left of anchor", () => {
    const input: PlacementInput = { blockType: "text", direction: "left" };
    const result = computePosition(input, [anchor], anchor);
    // left: anchor.x - width - GAP
    expect(result.x).toBe(100 - DEFAULT_WIDTH - GAP);
    expect(result.y).toBe(100);
  });

  it("places below anchor", () => {
    const input: PlacementInput = { blockType: "text", direction: "down" };
    const result = computePosition(input, [anchor], anchor);
    // down: anchor.y + anchor.height + GAP
    expect(result.x).toBe(100);
    expect(result.y).toBe(100 + 240 + GAP);
  });

  it("places above anchor", () => {
    const input: PlacementInput = { blockType: "text", direction: "up" };
    const result = computePosition(input, [anchor], anchor);
    // up: anchor.y - height - GAP
    expect(result.x).toBe(100);
    expect(result.y).toBe(100 - DEFAULT_HEIGHT - GAP);
  });

  it("defaults to right when no direction specified with anchor", () => {
    const input: PlacementInput = { blockType: "text" };
    const result = computePosition(input, [anchor], anchor);
    expect(result.x).toBe(100 + 320 + GAP);
    expect(result.y).toBe(100);
  });
});

// ─── 15.4 Collision resolution — shifts correctly when occupied ───────────────

describe("computePosition — collision resolution", () => {
  it("shifts right when anchor position is occupied", () => {
    const anchor: ExistingBlock = { x: 100, y: 100, width: 320, height: 240 };
    // Place a blocking element right where the new block would go
    const blocker: ExistingBlock = {
      x: 100 + 320 + GAP,
      y: 100,
      width: 320,
      height: 240,
    };
    const existingBlocks = [anchor, blocker];

    const input: PlacementInput = { blockType: "text", direction: "right" };
    const result = computePosition(input, existingBlocks, anchor);

    // Should shift right past the blocker
    expect(result.x).toBeGreaterThan(blocker.x);
    // Verify no collision with either block
    expect(
      hasCollision(result, DEFAULT_WIDTH, DEFAULT_HEIGHT, existingBlocks),
    ).toBe(false);
  });

  it("shifts down when below-anchor position is occupied", () => {
    const anchor: ExistingBlock = { x: 100, y: 100, width: 320, height: 240 };
    const blocker: ExistingBlock = {
      x: 100,
      y: 100 + 240 + GAP,
      width: 320,
      height: 240,
    };
    const existingBlocks = [anchor, blocker];

    const input: PlacementInput = { blockType: "text", direction: "down" };
    const result = computePosition(input, existingBlocks, anchor);

    expect(result.y).toBeGreaterThan(blocker.y);
    expect(
      hasCollision(result, DEFAULT_WIDTH, DEFAULT_HEIGHT, existingBlocks),
    ).toBe(false);
  });

  it("resolveCollision shifts iteratively until free space", () => {
    // Stack 3 blocks to the right
    const blocks: ExistingBlock[] = [
      { x: 0, y: 0, width: 320, height: 240 },
      { x: 360, y: 0, width: 320, height: 240 },
      { x: 720, y: 0, width: 320, height: 240 },
    ];

    const candidate = { x: 0, y: 0 };
    const result = resolveCollision(
      candidate,
      DEFAULT_WIDTH,
      DEFAULT_HEIGHT,
      blocks,
      "right",
    );

    // Should end up past all 3 blocks
    expect(hasCollision(result, DEFAULT_WIDTH, DEFAULT_HEIGHT, blocks)).toBe(
      false,
    );
  });
});

// ─── 15.5 computeBatchPositions with N blocks → grid layout, 5 columns max ──

describe("computeBatchPositions — grid layout", () => {
  it("places blocks in a grid on empty canvas starting at (0, 0)", () => {
    const inputs: PlacementInput[] = Array.from({ length: 3 }, () => ({
      blockType: "text",
    }));

    const results = computeBatchPositions(inputs, []);
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ x: 0, y: 0 });
    expect(results[1]).toEqual({ x: DEFAULT_WIDTH + GAP, y: 0 });
    expect(results[2]).toEqual({ x: 2 * (DEFAULT_WIDTH + GAP), y: 0 });
  });

  it("wraps to next row after 5 columns", () => {
    const inputs: PlacementInput[] = Array.from({ length: 7 }, () => ({
      blockType: "text",
    }));

    const results = computeBatchPositions(inputs, []);
    expect(results).toHaveLength(7);

    // First row: 5 blocks
    for (let i = 0; i < MAX_GRID_COLUMNS; i++) {
      expect(results[i].x).toBe(i * (DEFAULT_WIDTH + GAP));
      expect(results[i].y).toBe(0);
    }

    // Second row: 2 blocks
    expect(results[5].x).toBe(0);
    expect(results[5].y).toBe(DEFAULT_HEIGHT + GAP);
    expect(results[6].x).toBe(DEFAULT_WIDTH + GAP);
    expect(results[6].y).toBe(DEFAULT_HEIGHT + GAP);
  });

  it("respects explicit positions in batch", () => {
    const inputs: PlacementInput[] = [
      { blockType: "text" },
      { blockType: "text", position: { x: 999, y: 888 } },
      { blockType: "text" },
    ];

    const results = computeBatchPositions(inputs, []);
    expect(results[1]).toEqual({ x: 999, y: 888 });
  });

  it("starts to the right of existing blocks", () => {
    const existing: ExistingBlock[] = [{ x: 0, y: 0, width: 320, height: 240 }];
    const inputs: PlacementInput[] = [{ blockType: "text" }];

    const results = computeBatchPositions(inputs, existing);
    // Should start at bbox.maxX + GAP
    expect(results[0].x).toBe(320 + GAP);
  });

  it("handles mixed block types with different heights", () => {
    const inputs: PlacementInput[] = [
      { blockType: "text" },
      { blockType: "kanban" },
      { blockType: "sketch" },
    ];

    const results = computeBatchPositions(inputs, []);
    expect(results).toHaveLength(3);
    // All on same row (< 5 columns)
    expect(results[0].y).toBe(results[1].y);
    expect(results[1].y).toBe(results[2].y);
  });
});

// ─── 15.6 Property-based test: no overlap between any pair of placed blocks ──

describe("computeBatchPositions — property: no overlap", () => {
  /**
   * **Validates: Requirements 5**
   *
   * Property: For any set of randomly generated blocks placed via
   * computeBatchPositions, no two resulting blocks overlap (including GAP margin).
   */
  it("no pair of placed blocks overlap (fast-check)", () => {
    const blockTypeArb = fc.constantFrom(
      "text",
      "kanban",
      "sketch",
      "frame",
      "note",
    );

    const placementInputArb = fc.record({
      blockType: blockTypeArb,
    });

    fc.assert(
      fc.property(
        fc.array(placementInputArb, { minLength: 2, maxLength: 20 }),
        (inputs) => {
          const results = computeBatchPositions(inputs, []);

          // Build blocks with their computed positions and dimensions
          const placed = results.map((pos, i) => ({
            x: pos.x,
            y: pos.y,
            width: getDefaultWidth(inputs[i].blockType),
            height: getDefaultHeight(inputs[i].blockType),
          }));

          // Check every pair for overlap (with GAP margin)
          for (let i = 0; i < placed.length; i++) {
            for (let j = i + 1; j < placed.length; j++) {
              const a = placed[i];
              const b = placed[j];
              // Two rectangles do NOT overlap if one is completely to the
              // left/right/above/below the other (with GAP spacing)
              const noOverlap =
                a.x + a.width + GAP <= b.x ||
                b.x + b.width + GAP <= a.x ||
                a.y + a.height + GAP <= b.y ||
                b.y + b.height + GAP <= a.y;

              if (!noOverlap) {
                return false;
              }
            }
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  });
});
