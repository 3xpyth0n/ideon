// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import * as Y from "yjs";
import type { Edge, Node } from "@xyflow/react";
import { CANVAS_HISTORY_ORIGIN, useUndoRedo } from "./useUndoRedo";
import type { BlockData } from "@components/project/CanvasBlock";

function HookHarness({
  yDoc,
  yBlocks,
  yLinks,
  yContents,
  apiRef,
}: {
  yDoc: Y.Doc;
  yBlocks: Y.Map<Node<BlockData>>;
  yLinks: Y.Map<Edge>;
  yContents: Y.Map<Y.Text>;
  apiRef: {
    current: ReturnType<typeof useUndoRedo> | null;
  };
}) {
  apiRef.current = useUndoRedo(yDoc, yBlocks, yLinks, yContents, false);
  return null;
}

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("useUndoRedo", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;

    container?.remove();
    container = null;
  });

  it("undoes explicit undoable canvas transactions", () => {
    const yDoc = new Y.Doc();
    const yBlocks = yDoc.getMap<Node<BlockData>>("blocks");
    const yLinks = yDoc.getMap<Edge>("links");
    const yContents = yDoc.getMap<Y.Text>("contents");
    const apiRef = { current: null as ReturnType<typeof useUndoRedo> | null };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        React.createElement(HookHarness, {
          yDoc,
          yBlocks,
          yLinks,
          yContents,
          apiRef,
        }),
      );
    });

    act(() => {
      yDoc.transact(() => {
        const yText = new Y.Text();
        yText.insert(0, "Recovered block");
        yContents.set("block-1", yText);
        yBlocks.set("block-1", {
          id: "block-1",
          type: "text",
          position: { x: 10, y: 20 },
          data: {
            content: "Recovered block",
          } as BlockData,
        } as Node<BlockData>);
      }, CANVAS_HISTORY_ORIGIN);
    });

    expect(apiRef.current?.canUndo).toBe(true);

    act(() => {
      apiRef.current?.undo();
    });

    expect(yBlocks.has("block-1")).toBe(false);
    expect(yContents.has("block-1")).toBe(false);
  });

  it("keeps consecutive canvas actions as separate undo steps", () => {
    const yDoc = new Y.Doc();
    const yBlocks = yDoc.getMap<Node<BlockData>>("blocks");
    const yLinks = yDoc.getMap<Edge>("links");
    const yContents = yDoc.getMap<Y.Text>("contents");
    const apiRef = { current: null as ReturnType<typeof useUndoRedo> | null };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        React.createElement(HookHarness, {
          yDoc,
          yBlocks,
          yLinks,
          yContents,
          apiRef,
        }),
      );
    });

    act(() => {
      yDoc.transact(() => {
        yBlocks.set("block-a", {
          id: "block-a",
          type: "text",
          position: { x: 0, y: 0 },
          data: { content: "A" } as BlockData,
        } as Node<BlockData>);
      }, CANVAS_HISTORY_ORIGIN);
    });

    act(() => {
      apiRef.current?.stopCapturing();
    });

    act(() => {
      yDoc.transact(() => {
        yBlocks.set("block-b", {
          id: "block-b",
          type: "text",
          position: { x: 40, y: 40 },
          data: { content: "B" } as BlockData,
        } as Node<BlockData>);
      }, CANVAS_HISTORY_ORIGIN);
    });

    act(() => {
      apiRef.current?.undo();
    });

    expect(yBlocks.has("block-a")).toBe(true);
    expect(yBlocks.has("block-b")).toBe(false);
  });

  it("still allows undo after a redo cycle", () => {
    const yDoc = new Y.Doc();
    const yBlocks = yDoc.getMap<Node<BlockData>>("blocks");
    const yLinks = yDoc.getMap<Edge>("links");
    const yContents = yDoc.getMap<Y.Text>("contents");
    const apiRef = { current: null as ReturnType<typeof useUndoRedo> | null };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        React.createElement(HookHarness, {
          yDoc,
          yBlocks,
          yLinks,
          yContents,
          apiRef,
        }),
      );
    });

    act(() => {
      yDoc.transact(() => {
        yBlocks.set("block-cycle", {
          id: "block-cycle",
          type: "text",
          position: { x: 5, y: 5 },
          data: { content: "cycle" } as BlockData,
        } as Node<BlockData>);
      }, CANVAS_HISTORY_ORIGIN);
    });

    act(() => {
      apiRef.current?.undo();
    });

    expect(apiRef.current?.canRedo).toBe(true);
    expect(apiRef.current?.canUndo).toBe(false);

    act(() => {
      apiRef.current?.redo();
    });

    expect(yBlocks.has("block-cycle")).toBe(true);
    expect(apiRef.current?.canUndo).toBe(true);
    expect(apiRef.current?.canRedo).toBe(false);
  });
});
