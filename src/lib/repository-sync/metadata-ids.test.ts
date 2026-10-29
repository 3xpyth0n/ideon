import { describe, expect, it } from "vitest";
import { remapMetadataBlockIds } from "./metadata-ids";

describe("repository sync metadata identity mapping", () => {
  it("remaps frame child references without mutating the source", () => {
    const metadata = { childBlockIds: ["source-a", "source-b"] };

    expect(
      remapMetadataBlockIds(
        "frame",
        metadata,
        new Map([
          ["source-a", "local-a"],
          ["source-b", "local-b"],
        ]),
      ),
    ).toEqual({ childBlockIds: ["local-a", "local-b"] });
    expect(metadata.childBlockIds).toEqual(["source-a", "source-b"]);
  });

  it("remaps linked task references in serialized Kanban metadata", () => {
    const metadata = JSON.stringify({
      columns: [{ tasks: [{ linkedTasks: [{ blockId: "source" }] }] }],
    });

    expect(
      remapMetadataBlockIds("kanban", metadata, new Map([["source", "local"]])),
    ).toBe(
      JSON.stringify({
        columns: [{ tasks: [{ linkedTasks: [{ blockId: "local" }] }] }],
      }),
    );
  });

  it("remaps A-Frame hotspot block ids in serialized metadata", () => {
    const metadata = JSON.stringify({
      hotspots: [{ blockId: "source" }, { blockId: "unknown" }],
    });

    expect(
      remapMetadataBlockIds("aframe", metadata, new Map([["source", "local"]])),
    ).toBe(
      JSON.stringify({
        hotspots: [{ blockId: "local" }, { blockId: "unknown" }],
      }),
    );
  });

  it("remaps A-Frame hotspot block ids in object metadata", () => {
    const metadata = { hotspots: [{ blockId: "source" }] };

    expect(
      remapMetadataBlockIds("aframe", metadata, new Map([["source", "local"]])),
    ).toEqual({ hotspots: [{ blockId: "local" }] });
    expect(metadata.hotspots[0].blockId).toBe("source");
  });
});
