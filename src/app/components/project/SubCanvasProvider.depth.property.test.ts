import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  canCreateSubCanvas,
  MAX_CANVAS_DEPTH,
} from "./subcanvas/subCanvasUtils";

describe("Depth limit — canCreateSubCanvas", () => {
  it("rejects creation for activeDepth in [MAX_DEPTH, MAX_DEPTH+5]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_CANVAS_DEPTH, max: MAX_CANVAS_DEPTH + 5 }),
        (activeDepth) => {
          expect(canCreateSubCanvas(activeDepth, MAX_CANVAS_DEPTH)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("accepts creation for activeDepth < MAX_DEPTH", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_CANVAS_DEPTH - 1 }),
        (activeDepth) => {
          expect(canCreateSubCanvas(activeDepth, MAX_CANVAS_DEPTH)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
