import * as Y from "yjs";
import { describe, expect, it, vi } from "vitest";

import {
  MAX_BLOCK_CONTENT_LENGTH,
  MAX_BLOCK_TITLE_LENGTH,
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

  it("repairs corrupted block geometry (NaN/Infinity position) left by the 0.8.3 allocation overflow bug", () => {
    const doc = new Y.Doc();
    const blocks = doc.getMap("blocks");

    blocks.set("block-nan", {
      id: "block-nan",
      position: { x: NaN, y: NaN },
      width: 320,
      height: 240,
      data: { content: "hello" },
    });
    blocks.set("block-inf", {
      id: "block-inf",
      position: { x: Infinity, y: -Infinity },
      width: Infinity,
      height: -1,
      data: { content: "world" },
    });
    blocks.set("block-ok", {
      id: "block-ok",
      position: { x: 100, y: 200 },
      width: 320,
      height: 240,
      data: { content: "fine" },
    });

    const repaired = sanitizeProjectDocument(doc);

    const nan = blocks.get("block-nan") as {
      position: { x: number; y: number };
      width: number;
      height: number;
    };
    const inf = blocks.get("block-inf") as {
      position: { x: number; y: number };
      width: number;
      height: number;
    };
    const ok = blocks.get("block-ok") as {
      position: { x: number; y: number };
    };

    expect(repaired).toBe(true);
    expect(Number.isFinite(nan.position.x)).toBe(true);
    expect(Number.isFinite(nan.position.y)).toBe(true);
    expect(Number.isFinite(inf.position.x)).toBe(true);
    expect(Number.isFinite(inf.position.y)).toBe(true);
    expect(inf.width).toBe(320);
    expect(inf.height).toBe(240);
    // valid block must not be touched
    expect(ok.position.x).toBe(100);
    expect(ok.position.y).toBe(200);
  });

  it("repairs oversized block title left by the note block title overflow bug (#91)", () => {
    const doc = new Y.Doc();
    const blocks = doc.getMap("blocks");

    blocks.set("block-long-title", {
      id: "block-long-title",
      position: { x: 10, y: 20 },
      data: {
        content: "normal content",
        title: "x".repeat(MAX_BLOCK_TITLE_LENGTH + 500),
      },
    });
    blocks.set("block-both-corrupt", {
      id: "block-both-corrupt",
      position: { x: 0, y: 0 },
      data: {
        content: "y".repeat(MAX_BLOCK_CONTENT_LENGTH + 100),
        title: "z".repeat(MAX_BLOCK_TITLE_LENGTH + 100),
      },
    });
    blocks.set("block-ok-title", {
      id: "block-ok-title",
      position: { x: 5, y: 5 },
      data: { content: "fine", title: "short title" },
    });

    const repaired = sanitizeProjectDocument(doc);

    const longTitle = blocks.get("block-long-title") as {
      data?: { title?: string; content?: string };
    };
    const both = blocks.get("block-both-corrupt") as {
      data?: { title?: string; content?: string };
    };
    const ok = blocks.get("block-ok-title") as {
      data?: { title?: string };
    };

    expect(repaired).toBe(true);
    expect((longTitle.data?.title?.length ?? 0) <= MAX_BLOCK_TITLE_LENGTH).toBe(true);
    expect(longTitle.data?.content).toBe("normal content");
    expect((both.data?.title?.length ?? 0) <= MAX_BLOCK_TITLE_LENGTH).toBe(true);
    expect(both.data?.content?.endsWith(SERVER_REPAIR_CONTENT_SUFFIX)).toBe(true);
    expect(ok.data?.title).toBe("short title");
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
