// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMultiBlockCopyText,
  shouldIgnoreNodeContextMenuShortcut,
  shouldOverrideMultiBlockCopy,
  shouldStartNoteInEditMode,
  updateSelectedBlockOrder,
} from "./interaction";

describe("project interaction helpers", () => {
  it("defaults empty notes to edit mode only when writable", () => {
    expect(shouldStartNoteInEditMode("", false)).toBe(true);
    expect(shouldStartNoteInEditMode(" \n\t ", false)).toBe(true);
    expect(shouldStartNoteInEditMode("Hello world", false)).toBe(false);
    expect(shouldStartNoteInEditMode("", true)).toBe(false);
  });

  it("ignores node context-menu shortcuts inside editor content", () => {
    const node = document.createElement("div");
    node.className = "react-flow__node";
    const editorContainer = document.createElement("div");
    editorContainer.className = "markdown-editor-container";
    const proseMirror = document.createElement("div");
    proseMirror.className = "ProseMirror";
    editorContainer.appendChild(proseMirror);
    node.appendChild(editorContainer);
    document.body.appendChild(node);

    expect(shouldIgnoreNodeContextMenuShortcut(proseMirror)).toBe(true);
    expect(shouldIgnoreNodeContextMenuShortcut(editorContainer)).toBe(true);

    node.remove();
  });

  it("keeps node context-menu shortcuts on block chrome", () => {
    const node = document.createElement("div");
    node.className = "react-flow__node";
    const header = document.createElement("div");
    header.className = "block-header";
    node.appendChild(header);
    document.body.appendChild(node);

    expect(shouldIgnoreNodeContextMenuShortcut(header)).toBe(false);

    node.remove();
  });

  it("tracks selection order by preserving prior selections and appending new ones", () => {
    const firstSelection = updateSelectedBlockOrder(
      [],
      [
        { id: "a", selected: false },
        { id: "b", selected: true },
        { id: "c", selected: false },
      ],
    );
    const secondSelection = updateSelectedBlockOrder(firstSelection, [
      { id: "a", selected: true },
      { id: "b", selected: true },
      { id: "c", selected: false },
    ]);
    const thirdSelection = updateSelectedBlockOrder(secondSelection, [
      { id: "a", selected: true },
      { id: "b", selected: false },
      { id: "c", selected: true },
    ]);

    expect(firstSelection).toEqual(["b"]);
    expect(secondSelection).toEqual(["b", "a"]);
    expect(thirdSelection).toEqual(["a", "c"]);
  });

  it("builds concatenated multi-block copy text in tracked order", () => {
    const copiedText = buildMultiBlockCopyText(
      [
        { id: "a", data: { content: "Alpha" } },
        { id: "b", data: { content: "Bravo" } },
        { id: "c", data: { content: "   " } },
        { id: "d", data: { content: "Charlie" } },
      ],
      ["b", "a", "c", "d"],
    );

    expect(copiedText).toBe("Bravo\n\nAlpha\n\nCharlie");
  });

  it("only overrides native copy for multi-block non-editing copy actions", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    expect(
      shouldOverrideMultiBlockCopy({
        selectedBlockCount: 2,
        activeElement: input,
        hasTextSelection: false,
      }),
    ).toBe(false);

    expect(
      shouldOverrideMultiBlockCopy({
        selectedBlockCount: 1,
        activeElement: document.body,
        hasTextSelection: false,
      }),
    ).toBe(false);

    expect(
      shouldOverrideMultiBlockCopy({
        selectedBlockCount: 2,
        activeElement: document.body,
        hasTextSelection: true,
      }),
    ).toBe(false);

    expect(
      shouldOverrideMultiBlockCopy({
        selectedBlockCount: 2,
        activeElement: document.body,
        hasTextSelection: false,
      }),
    ).toBe(true);

    input.remove();
  });
});
