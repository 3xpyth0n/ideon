import { describe, expect, it } from "vitest";
import { getGridTileSize } from "./useCanvasGrid";

describe("getGridTileSize", () => {
  it("keeps the base gap at full zoom", () => {
    expect(getGridTileSize(1)).toBe(25);
  });

  it("scales the gap with zoom while it stays readable", () => {
    expect(getGridTileSize(2)).toBe(50);
    expect(getGridTileSize(0.8)).toBe(20);
  });

  it("doubles the gap instead of packing dots below the minimum size", () => {
    expect(getGridTileSize(0.3)).toBe(30);
    expect(getGridTileSize(0.1)).toBe(20);
  });

  it("always keeps tiles at or above the minimum size", () => {
    for (let zoom = 0.1; zoom <= 4; zoom += 0.05) {
      expect(getGridTileSize(zoom)).toBeGreaterThanOrEqual(20);
    }
  });
});
