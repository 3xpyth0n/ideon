import * as Y from "yjs";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_BLOCK_CONTENT_LENGTH,
  SERVER_REPAIR_CONTENT_SUFFIX,
  clampBlockContent,
  safeReadYText,
  sanitizeProjectDocument,
} from "./projectContentSafety";

describe("projectContentSafety", () => {
  it("avoids unsafe Y.Text string reads once content exceeds the shared limit", () => {
    const toString = vi.fn(() => {
      throw new RangeError("Allocation size overflow");
    });

    const yText = {
      length: MAX_BLOCK_CONTENT_LENGTH + 10,
      toString,
    } as unknown as Y.Text;

    const fallback = "x".repeat(MAX_BLOCK_CONTENT_LENGTH + 20);
    const result = safeReadYText(yText, fallback);

    expect(result).toBe(clampBlockContent(fallback));
    expect(toString).not.toHaveBeenCalled();
  });

  it("falls back to the cached content when Y.Text throws during conversion", () => {
    const yText = {
      length: 32,
      toString: () => {
        throw new RangeError("Invalid string length");
      },
    } as unknown as Y.Text;

    expect(safeReadYText(yText, "cached note")).toBe("cached note");
  });

  it("repairs oversized persisted note content before it can poison future loads", () => {
    const doc = new Y.Doc();
    const contents = doc.getMap<Y.Text>("contents");
    const blocks = doc.getMap("blocks");

    const yText = new Y.Text();
    yText.insert(0, "a".repeat(MAX_BLOCK_CONTENT_LENGTH + 250));
    contents.set("note-1", yText);
    blocks.set("note-1", {
      id: "note-1",
      data: {
        content: "b".repeat(MAX_BLOCK_CONTENT_LENGTH + 300),
      },
    });

    const repaired = sanitizeProjectDocument(doc);
    const repairedText = contents.get("note-1")?.toString() ?? "";
    const repairedBlock = blocks.get("note-1") as {
      data?: { content?: string };
    };

    expect(repaired).toBe(true);
    expect(repairedText.endsWith(SERVER_REPAIR_CONTENT_SUFFIX)).toBe(true);
    expect(repairedText.length).toBeLessThanOrEqual(
      MAX_BLOCK_CONTENT_LENGTH + SERVER_REPAIR_CONTENT_SUFFIX.length,
    );
    expect(
      repairedBlock.data?.content?.endsWith(SERVER_REPAIR_CONTENT_SUFFIX),
    ).toBe(true);
  });
});
