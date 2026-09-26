import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import * as Y from "yjs";
import type { ViewportState } from "./subCanvasUtils";

describe('Viewport round-trip — yDoc.getMap("viewports")', () => {
  it("x, y, zoom survive a write→read round-trip for any canvas id", () => {
    const viewportArb = fc.record({
      x: fc.float({
        noNaN: true,
        noDefaultInfinity: true,
        min: Math.fround(-100000),
        max: Math.fround(100000),
      }),
      y: fc.float({
        noNaN: true,
        noDefaultInfinity: true,
        min: Math.fround(-100000),
        max: Math.fround(100000),
      }),
      zoom: fc.float({
        noNaN: true,
        noDefaultInfinity: true,
        min: Math.fround(0.01),
        max: Math.fround(8),
      }),
    });

    fc.assert(
      fc.property(fc.uuid(), viewportArb, (canvasId, viewport) => {
        const yDoc = new Y.Doc();
        const viewports = yDoc.getMap<ViewportState>("viewports");

        // Store a copy with a normal prototype (mirrors the provider's literal).
        viewports.set(canvasId, { ...viewport });

        const restored = viewports.get(canvasId) ?? null;

        expect(restored).not.toBeNull();
        expect(restored!.x).toBeCloseTo(viewport.x, 5);
        expect(restored!.y).toBeCloseTo(viewport.y, 5);
        expect(restored!.zoom).toBeCloseTo(viewport.zoom, 5);
      }),
      { numRuns: 100 },
    );
  });
});
