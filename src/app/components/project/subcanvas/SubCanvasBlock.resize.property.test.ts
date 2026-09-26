import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  clampSubCanvasResize,
  SUB_CANVAS_MIN_WIDTH,
  SUB_CANVAS_MIN_HEIGHT,
  SUB_CANVAS_MAX_WIDTH,
  SUB_CANVAS_MAX_HEIGHT,
} from "./subCanvasUtils";

describe("Resize clamp — clampSubCanvasResize", () => {
  it("clamps arbitrary widths/heights into the allowed boundary box", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10000, max: 100000 }),
        fc.integer({ min: -10000, max: 100000 }),
        (width, height) => {
          const { width: w, height: h } = clampSubCanvasResize(width, height);
          expect(w).toBeGreaterThanOrEqual(SUB_CANVAS_MIN_WIDTH);
          expect(w).toBeLessThanOrEqual(SUB_CANVAS_MAX_WIDTH);
          expect(h).toBeGreaterThanOrEqual(SUB_CANVAS_MIN_HEIGHT);
          expect(h).toBeLessThanOrEqual(SUB_CANVAS_MAX_HEIGHT);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("leaves in-range sizes unchanged", () => {
    const wArb = fc.integer({
      min: SUB_CANVAS_MIN_WIDTH,
      max: SUB_CANVAS_MAX_WIDTH,
    });
    const hArb = fc.integer({
      min: SUB_CANVAS_MIN_HEIGHT,
      max: SUB_CANVAS_MAX_HEIGHT,
    });
    fc.assert(
      fc.property(wArb, hArb, (width, height) => {
        const result = clampSubCanvasResize(width, height);
        expect(result.width).toBe(width);
        expect(result.height).toBe(height);
      }),
      { numRuns: 100 },
    );
  });
});
