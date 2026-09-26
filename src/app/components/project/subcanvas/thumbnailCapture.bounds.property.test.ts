import { afterEach, describe, it, expect, vi } from "vitest";
import type { Node } from "@xyflow/react";
import * as fc from "fast-check";
import { captureSubCanvasThumbnail, fitWithinBounds } from "./thumbnailCapture";

const { toPngMock } = vi.hoisted(() => ({ toPngMock: vi.fn() }));

vi.mock("html-to-image", () => ({ toPng: toPngMock }));

const MAX_W = 800;
const MAX_H = 500;

afterEach(() => {
  vi.unstubAllGlobals();
  toPngMock.mockReset();
});

describe("Thumbnail bounds — fitWithinBounds", () => {
  it("never exceeds the 800x500 bound box for arbitrary source sizes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        fc.integer({ min: 1, max: 100000 }),
        (w, h) => {
          const { width, height } = fitWithinBounds(w, h);
          expect(width).toBeGreaterThanOrEqual(1);
          expect(height).toBeGreaterThanOrEqual(1);
          expect(width).toBeLessThanOrEqual(MAX_W);
          expect(height).toBeLessThanOrEqual(MAX_H);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rounds each dimension to the nearest whole pixel of the exact proportional fit, for any source size", () => {
    const sizeArb = fc.tuple(
      fc.integer({ min: 1, max: 100000 }),
      fc.integer({ min: 1, max: 100000 }),
    );
    fc.assert(
      fc.property(sizeArb, ([w, h]) => {
        const { width, height } = fitWithinBounds(w, h);
        const scale = Math.min(1, MAX_W / w, MAX_H / h);
        // The result must be the exact proportional width/height rounded to a
        // whole pixel (and never below 1). This holds for every source size.
        expect(width).toBe(Math.max(1, Math.round(w * scale)));
        expect(height).toBe(Math.max(1, Math.round(h * scale)));
      }),
      { numRuns: 200 },
    );
  });

  it("leaves small sources unscaled", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: MAX_W }),
        fc.integer({ min: 1, max: MAX_H }),
        (w, h) => {
          const { width, height } = fitWithinBounds(w, h);
          expect(width).toBe(w);
          expect(height).toBe(h);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("captures both themes and restores the stage theme", async () => {
    vi.stubGlobal("document", {});
    const capturedThemes: string[] = [];
    toPngMock.mockImplementation(async (stage: HTMLElement) => {
      const theme = stage.getAttribute("data-theme") ?? "";
      capturedThemes.push(theme);
      return theme;
    });
    const attributes = new Map([["data-theme", "dark"]]);
    const stage = {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) =>
        attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
    } as unknown as HTMLElement;
    const nodes = [
      {
        id: "block",
        position: { x: 0, y: 0 },
        width: 100,
        height: 100,
      },
    ] as Node[];

    const thumbnails = await captureSubCanvasThumbnail({ nodes, stage });

    expect(thumbnails).toEqual({ light: "light", dark: "dark" });
    expect(capturedThemes).toEqual(["light", "dark"]);
    expect(toPngMock).toHaveBeenCalledTimes(2);
    expect(attributes.get("data-theme")).toBe("dark");
  });
});
