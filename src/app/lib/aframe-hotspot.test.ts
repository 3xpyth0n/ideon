import { describe, expect, it } from "vitest";
import { remapAFrameHotspotsFromParsed, remapBlockId } from "./aframe-hotspot";

describe("remapBlockId", () => {
  it("remaps a block id present in the map", () => {
    const idMap = new Map([["old-1", "new-1"]]);
    expect(remapBlockId(idMap, "old-1")).toBe("new-1");
  });

  it("preserves a block id absent from the map", () => {
    const idMap = new Map([["old-1", "new-1"]]);
    expect(remapBlockId(idMap, "old-2")).toBe("old-2");
  });
});

describe("remapAFrameHotspotsFromParsed", () => {
  it("remaps blockIds present in the map", () => {
    const idMap = new Map([["old-1", "new-1"]]);
    const parsed = { hotspots: [{ blockId: "old-1" }, { blockId: "old-2" }] };

    const remapped = remapAFrameHotspotsFromParsed(parsed, idMap) as {
      hotspots?: Array<{ blockId?: string }>;
    };
    expect(remapped.hotspots?.[0].blockId).toBe("new-1");
    expect(remapped.hotspots?.[1].blockId).toBe("old-2");
  });

  it("preserves blockIds missing from the map", () => {
    const idMap = new Map([["old-1", "new-1"]]);
    const parsed = { hotspots: [{ blockId: "old-2" }] };

    const remapped = remapAFrameHotspotsFromParsed(parsed, idMap) as {
      hotspots?: Array<{ blockId?: string }>;
    };
    expect(remapped.hotspots?.[0].blockId).toBe("old-2");
  });

  it("ignores hotspot entries without a string blockId", () => {
    const idMap = new Map([["old-1", "new-1"]]);
    const parsed: { hotspots: unknown[] } = {
      hotspots: [{}, { blockId: 42 }, "nope", null],
    };

    remapAFrameHotspotsFromParsed(parsed, idMap);
    expect(parsed.hotspots[1]).toEqual({ blockId: 42 });
    expect(parsed.hotspots[2]).toBe("nope");
    expect(parsed.hotspots[3]).toBeNull();
  });

  it("returns the parsed value unchanged when there are no hotspots", () => {
    const parsed = { other: "field" };
    expect(remapAFrameHotspotsFromParsed(parsed, new Map())).toBe(parsed);
  });

  it("returns the value unchanged when hotspots is not an array", () => {
    const parsed = { hotspots: "oops" };
    expect(remapAFrameHotspotsFromParsed(parsed, new Map())).toBe(parsed);
  });

  it("tolerates non-object values", () => {
    const idMap = new Map([["old-1", "new-1"]]);
    expect(remapAFrameHotspotsFromParsed(null, idMap)).toBeNull();
    expect(remapAFrameHotspotsFromParsed(42, idMap)).toBe(42);
    expect(remapAFrameHotspotsFromParsed("str", idMap)).toBe("str");
  });
});
