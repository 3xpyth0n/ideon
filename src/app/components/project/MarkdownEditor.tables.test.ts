import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  createNoteContentEditor,
  getMarkdownFromXmlFragment,
  getStableMarkdown,
  syncMarkdownToXmlFragment,
} from "./noteMarkdown";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require("jsdom") as {
  JSDOM: new (html: string) => {
    window: Window & typeof globalThis;
  };
};

const dom = new JSDOM("<!doctype html><html><body></body></html>");

Object.defineProperty(globalThis, "window", {
  value: dom.window,
  configurable: true,
});
Object.defineProperty(globalThis, "document", {
  value: dom.window.document,
  configurable: true,
});
Object.defineProperty(globalThis, "Node", {
  value: dom.window.Node,
  configurable: true,
});
Object.defineProperty(globalThis, "HTMLElement", {
  value: dom.window.HTMLElement,
  configurable: true,
});
Object.defineProperty(globalThis, "HTMLAnchorElement", {
  value: dom.window.HTMLAnchorElement,
  configurable: true,
});

describe("MarkdownEditor tables", () => {
  it("preserves inline marks and links when serializing table cells", () => {
    const content = [
      "# Comparison",
      "",
      "| Metric | Result |",
      "| --- | --- |",
      "| **Capacity** | 6\\|6 |",
      "| [Status](https://example.com) | Ready |",
    ].join("\n");
    const editor = createNoteContentEditor(content);

    expect(getStableMarkdown(editor)).toContain("| **Capacity** | 6\\|6 |");
    expect(getStableMarkdown(editor)).toContain(
      "| [Status](https://example.com) | Ready |",
    );

    editor.destroy();
  });

  it("round-trips multiple tables in mixed Markdown", () => {
    const table = [
      "| Signal | Owner | State | Risk | Due | Score |",
      "| --- | --- | --- | --- | --- | --- |",
      ...Array.from(
        { length: 6 },
        (_, index) =>
          `| Signal ${index + 1} | Team ${index + 1} | Ready | Low | Day ${
            index + 1
          } | ${index + 1} |`,
      ),
    ].join("\n");
    const content = [
      "# Comparison matrix",
      "",
      table,
      "",
      "> Review the current scorecard.",
      "",
      "```ts",
      "const approved = true;",
      "```",
      "",
      "- [x] Review complete",
      "  - Follow-up captured",
      "",
      "## Second table",
      "",
      "| Option | Result |",
      "| --- | --- |",
      "| A | Ready |",
    ].join("\n");
    const editor = createNoteContentEditor(content);

    const markdown = getStableMarkdown(editor);
    expect(markdown).toContain(table);
    expect(markdown).toContain("> Review the current scorecard.");
    expect(markdown).toContain("```ts\nconst approved = true;\n```");
    expect(markdown).toContain("- [x] Review complete");
    expect(
      editor.state.doc.content.content.filter(
        (node) => node.type.name === "table",
      ),
    ).toHaveLength(2);

    const reloadedEditor = createNoteContentEditor(markdown);
    expect(
      reloadedEditor.state.doc.content.content.filter(
        (node) => node.type.name === "table",
      ),
    ).toHaveLength(2);
    expect(getStableMarkdown(reloadedEditor)).toBe(markdown);

    editor.destroy();
    reloadedEditor.destroy();
  });

  it("preserves table Markdown through Vim edits and Yjs updates", () => {
    const markdown = [
      "# Comparison",
      "",
      "| Metric | Result |",
      "| --- | --- |",
      "| **Capacity** | 6\\|6 |",
      "| Status | Ready |",
    ].join("\n");
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("note");
    const replica = new Y.Doc();

    syncMarkdownToXmlFragment(fragment, markdown);
    expect(getMarkdownFromXmlFragment(fragment)).toContain(
      "| **Capacity** | 6\\|6 |",
    );

    syncMarkdownToXmlFragment(fragment, markdown.replace("Ready", "In review"));
    Y.applyUpdate(replica, Y.encodeStateAsUpdate(ydoc));

    expect(
      getMarkdownFromXmlFragment(replica.getXmlFragment("note")),
    ).toContain("| Status | In review |");
    expect(
      getMarkdownFromXmlFragment(replica.getXmlFragment("note")),
    ).toContain("| **Capacity** | 6\\|6 |");
  });

  it("renders only safe Markdown image sources", () => {
    const editor = createNoteContentEditor(
      [
        "![Remote](https://images.example.com/diagram.png)",
        "",
        "![Local](/uploads/diagram.png)",
        "",
        "![Unsafe](javascript:alert(1))",
      ].join("\n"),
    );
    const images = Array.from(editor.view.dom.querySelectorAll("img"));

    expect(images).toHaveLength(2);
    expect(images[0]?.getAttribute("src")).toBe(
      "https://images.example.com/diagram.png",
    );
    expect(images[0]?.getAttribute("loading")).toBe("lazy");
    expect(images[0]?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(images[1]?.getAttribute("src")).toBe("/uploads/diagram.png");
    expect(editor.view.dom.querySelector('img[src^="javascript:"]')).toBeNull();

    editor.destroy();
  });
});
