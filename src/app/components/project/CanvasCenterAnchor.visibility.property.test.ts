import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { shouldShowCenterMarker } from "./CanvasCenterAnchor";

describe("Center anchor visibility — shouldShowCenterMarker", () => {
  it("renders iff activeDepth > 0 and not in preview mode", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 6 }),
        fc.boolean(),
        (activeDepth, isPreviewMode) => {
          expect(shouldShowCenterMarker(activeDepth, isPreviewMode)).toBe(
            activeDepth > 0 && !isPreviewMode,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
