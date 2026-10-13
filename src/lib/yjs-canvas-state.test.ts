import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Node } from "@xyflow/react";
import * as Y from "yjs";
import {
  captureCanvasStateSnapshots,
  remapCanvasStateSnapshots,
  restoreCanvasStateSnapshots,
} from "./yjs-canvas-state";

describe("Yjs canvas state serialization", () => {
  it("round-trips nested graphs, text, viewport and rich note XML", () => {
    const source = new Y.Doc();
    source.getMap<Node>("blocks").set("subcanvas-1", {
      id: "subcanvas-1",
      type: "subcanvas",
      position: { x: 20, y: 30 },
      data: { blockType: "subcanvas", content: "" },
    });
    source.getMap("links").set("root-link", {
      id: "root-link",
      source: "subcanvas-1",
      target: "core",
    });
    source.getMap<Y.Text>("contents").set("subcanvas-1", new Y.Text(""));
    source
      .getMap<Y.XmlFragment>("noteDocuments")
      .set("subcanvas-1", new Y.XmlFragment());
    source.getMap("viewports").set("root", { x: 8, y: 12, zoom: 0.8 });

    const childBlocks = source.getMap<Node>("blocks:subcanvas-1");
    childBlocks.set("note-1", {
      id: "note-1",
      type: "text",
      position: { x: 4, y: 6 },
      data: { blockType: "text", content: "fallback" },
    });
    source.getMap("links:subcanvas-1").set("child-link", {
      id: "child-link",
      source: "note-1",
      target: "note-2",
    });
    source
      .getMap<Y.Text>("contents:subcanvas-1")
      .set("note-1", new Y.Text("current text"));
    const note = new Y.XmlFragment();
    source
      .getMap<Y.XmlFragment>("noteDocuments:subcanvas-1")
      .set("note-1", note);
    const paragraph = new Y.XmlElement("paragraph");
    const bold = new Y.XmlElement("bold");
    const noteText = new Y.XmlText();
    noteText.insert(0, "Preserved formatting");
    bold.insert(0, [noteText]);
    paragraph.insert(0, [bold]);
    note.push([paragraph]);

    const table = new Y.XmlElement("table");
    const headerRow = new Y.XmlElement("tableRow");
    const headerCell = new Y.XmlElement("tableHeader");
    const headerParagraph = new Y.XmlElement("paragraph");
    const headerText = new Y.XmlText();
    headerText.insert(0, "Metric");
    headerParagraph.insert(0, [headerText]);
    headerCell.insert(0, [headerParagraph]);
    headerRow.insert(0, [headerCell]);

    const bodyRow = new Y.XmlElement("tableRow");
    const bodyCell = new Y.XmlElement("tableCell");
    const bodyParagraph = new Y.XmlElement("paragraph");
    const bodyText = new Y.XmlText();
    bodyText.insert(0, "Capacity");
    bodyParagraph.insert(0, [bodyText]);
    bodyCell.insert(0, [bodyParagraph]);
    bodyRow.insert(0, [bodyCell]);
    table.insert(0, [headerRow, bodyRow]);
    note.push([table]);

    source.getMap("viewports").set("subcanvas-1", { x: -20, y: 15, zoom: 1.4 });

    const snapshots = captureCanvasStateSnapshots(source);
    const restored = new Y.Doc();
    restoreCanvasStateSnapshots(restored, snapshots);

    expect(captureCanvasStateSnapshots(restored)).toEqual(snapshots);
    expect(
      restored
        .getMap<Y.XmlFragment>("noteDocuments:subcanvas-1")
        .get("note-1")
        ?.toJSON(),
    ).toContain("<bold>Preserved formatting</bold>");
    expect(
      restored
        .getMap<Y.XmlFragment>("noteDocuments:subcanvas-1")
        .get("note-1")
        ?.toJSON(),
    ).toContain("<table><tablerow><tableheader><paragraph>Metric</paragraph>");
  });

  it("clears child canvas maps absent from the restored project", () => {
    const source = new Y.Doc();
    source.getMap<Node>("blocks").set("note-1", {
      id: "note-1",
      type: "text",
      position: { x: 0, y: 0 },
      data: { blockType: "text", content: "root" },
    });
    const snapshots = captureCanvasStateSnapshots(source);

    const restored = new Y.Doc();
    restored.getMap<Node>("blocks").set("subcanvas-old", {
      id: "subcanvas-old",
      type: "subcanvas",
      position: { x: 0, y: 0 },
      data: { blockType: "subcanvas", content: "" },
    });
    restored.getMap<Node>("blocks:subcanvas-old").set("nested-note", {
      id: "nested-note",
      type: "text",
      position: { x: 0, y: 0 },
      data: { blockType: "text", content: "old" },
    });

    restoreCanvasStateSnapshots(restored, snapshots);

    expect(restored.getMap("blocks:subcanvas-old").size).toBe(0);
    expect(restored.getMap<Node>("blocks").has("subcanvas-old")).toBe(false);
  });

  it("remaps canvas, node, link, content and note ids together", () => {
    const source = new Y.Doc();
    source.getMap<Node>("blocks").set("subcanvas-1", {
      id: "subcanvas-1",
      type: "subcanvas",
      position: { x: 0, y: 0 },
      data: { blockType: "subcanvas", content: "" },
    });
    source.getMap<Node>("blocks:subcanvas-1").set("note-1", {
      id: "note-1",
      type: "text",
      position: { x: 0, y: 0 },
      data: { blockType: "text", content: "hello" },
    });
    source.getMap("links:subcanvas-1").set("link-1", {
      id: "link-1",
      source: "note-1",
      target: "note-2",
    });
    source
      .getMap<Y.Text>("contents:subcanvas-1")
      .set("note-1", new Y.Text("hello"));
    const note = new Y.XmlFragment();
    source
      .getMap<Y.XmlFragment>("noteDocuments:subcanvas-1")
      .set("note-1", note);
    const paragraph = new Y.XmlElement("paragraph");
    const bold = new Y.XmlElement("bold");
    const noteText = new Y.XmlText();
    noteText.insert(0, "rich note");
    bold.insert(0, [noteText]);
    paragraph.insert(0, [bold]);
    note.push([paragraph]);

    const snapshots = captureCanvasStateSnapshots(source);
    const remapped = remapCanvasStateSnapshots(
      snapshots,
      new Map([
        ["subcanvas-1", "subcanvas-new"],
        ["note-1", "note-new"],
        ["note-2", "note-two-new"],
      ]),
      new Map([["link-1", "link-new"]]),
    );

    const child = remapped.find(
      (snapshot) => snapshot.canvasId === "subcanvas-new",
    );
    expect(child?.blocks[0].id).toBe("note-new");
    expect(child?.links[0]).toMatchObject({
      id: "link-new",
      source: "note-new",
      target: "note-two-new",
    });
    expect(child?.contents).toEqual({ "note-new": "hello" });
    expect(Object.keys(child?.noteDocuments ?? {})).toEqual(["note-new"]);

    const imported = new Y.Doc();
    restoreCanvasStateSnapshots(imported, remapped);
    expect(captureCanvasStateSnapshots(imported)).toEqual(remapped);
    expect(
      imported
        .getMap<Y.XmlFragment>("noteDocuments:subcanvas-new")
        .get("note-new")
        ?.toJSON(),
    ).toContain("<bold>rich note</bold>");
  });
});

describe("P1 — snapshot round-trip (property)", () => {
  const buildNote = (text: string) => {
    const note = new Y.XmlFragment();
    const paragraph = new Y.XmlElement("paragraph");
    const noteText = new Y.XmlText();
    noteText.insert(0, text);
    paragraph.insert(0, [noteText]);
    note.push([paragraph]);
    return note;
  };

  const buildDoc = (
    subcanvasCount: number,
    blocksPerSubcanvas: number,
    extraRootBlocks: number,
    contents: string[],
    withViewports: boolean,
    withNotes: boolean,
  ) => {
    const doc = new Y.Doc();
    const rootBlocks = doc.getMap<Node>("blocks");
    const rootLinks = doc.getMap("links");
    const rootContents = doc.getMap<Y.Text>("contents");
    const rootNotes = doc.getMap<Y.XmlFragment>("noteDocuments");
    const viewports = doc.getMap("viewports");

    let contentIndex = 0;
    const nextContent = () =>
      contents.length > 0 ? contents[contentIndex++ % contents.length] : "";

    for (let i = 0; i < subcanvasCount; i++) {
      const canvasId = `s${i}`;
      rootBlocks.set(canvasId, {
        id: canvasId,
        type: "subcanvas",
        position: { x: i * 10, y: 0 },
        data: { blockType: "subcanvas", content: "" },
      });

      const childBlocks = doc.getMap<Node>(`blocks:${canvasId}`);
      const childLinks = doc.getMap(`links:${canvasId}`);
      const childContents = doc.getMap<Y.Text>(`contents:${canvasId}`);
      const childNotes = doc.getMap<Y.XmlFragment>(`noteDocuments:${canvasId}`);

      for (let j = 0; j < blocksPerSubcanvas; j++) {
        const blockId = `${canvasId}-b${j}`;
        childBlocks.set(blockId, {
          id: blockId,
          type: "text",
          position: { x: j, y: j },
          data: { blockType: "text", content: "" },
        });
        childContents.set(blockId, new Y.Text(nextContent()));
        if (withNotes) {
          childNotes.set(blockId, buildNote(nextContent()));
        }
      }

      if (blocksPerSubcanvas >= 2) {
        const linkId = `${canvasId}-l0`;
        childLinks.set(linkId, {
          id: linkId,
          source: `${canvasId}-b0`,
          target: `${canvasId}-b1`,
        });
      }

      if (withViewports) {
        viewports.set(canvasId, { x: i, y: i, zoom: 1 });
      }
    }

    for (let k = 0; k < extraRootBlocks; k++) {
      const blockId = `t${k}`;
      rootBlocks.set(blockId, {
        id: blockId,
        type: "text",
        position: { x: k, y: k },
        data: { blockType: "text", content: "" },
      });
      rootContents.set(blockId, new Y.Text(nextContent()));
      if (withNotes) {
        rootNotes.set(blockId, buildNote(nextContent()));
      }
    }

    if (extraRootBlocks >= 2) {
      rootLinks.set("l0", {
        id: "l0",
        source: "t0",
        target: "t1",
      });
    }

    if (withViewports) {
      viewports.set("root", { x: 0, y: 0, zoom: 1 });
    }

    return doc;
  };

  it("capture → restore into a fresh doc → capture is deep-equal", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 0, max: 4 }),
        fc.array(fc.string({ maxLength: 24 }), { maxLength: 12 }),
        fc.boolean(),
        fc.boolean(),
        (
          subcanvasCount,
          blocksPerSubcanvas,
          extraRootBlocks,
          contents,
          withViewports,
          withNotes,
        ) => {
          const source = buildDoc(
            subcanvasCount,
            blocksPerSubcanvas,
            extraRootBlocks,
            contents,
            withViewports,
            withNotes,
          );

          const snapshots = captureCanvasStateSnapshots(source);
          const restored = new Y.Doc();
          restoreCanvasStateSnapshots(restored, snapshots);

          expect(captureCanvasStateSnapshots(restored)).toEqual(snapshots);
        },
      ),
      { numRuns: 100 },
    );
  });
});
