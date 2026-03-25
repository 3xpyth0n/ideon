// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMultiBlockCopyText,
  getSelectedNoteBlockIdForShortcut,
  resolveNoteModeShortcutAction,
  shouldIgnoreNodeContextMenuShortcut,
  shouldIgnoreNoteModeShortcut,
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

  it("ignores note mode shortcuts while title inputs are focused", () => {
    const titleInput = document.createElement("input");
    titleInput.className = "block-title";
    document.body.appendChild(titleInput);

    expect(shouldIgnoreNoteModeShortcut(titleInput)).toBe(true);
    expect(
      getSelectedNoteBlockIdForShortcut({
        blocks: [{ id: "note-1", selected: true, type: "text" }],
        activeElement: titleInput,
      }),
    ).toBeNull();

    titleInput.remove();
  });

  it("ignores note mode shortcuts while note editor content is focused", () => {
    const editorContainer = document.createElement("div");
    editorContainer.className = "markdown-editor-container";
    const proseMirror = document.createElement("div");
    proseMirror.className = "ProseMirror";
    proseMirror.contentEditable = "true";
    editorContainer.appendChild(proseMirror);
    document.body.appendChild(editorContainer);

    expect(shouldIgnoreNoteModeShortcut(proseMirror)).toBe(true);
    expect(
      getSelectedNoteBlockIdForShortcut({
        blocks: [{ id: "note-1", selected: true, type: "text" }],
        activeElement: proseMirror,
      }),
    ).toBeNull();

    editorContainer.remove();
  });

  it("only targets a single selected note block for note mode shortcuts", () => {
    expect(
      getSelectedNoteBlockIdForShortcut({
        blocks: [{ id: "note-1", selected: true, type: "text" }],
        activeElement: document.body,
      }),
    ).toBe("note-1");

    expect(
      getSelectedNoteBlockIdForShortcut({
        blocks: [
          { id: "note-1", selected: true, type: "text" },
          { id: "link-1", selected: true, type: "link" },
        ],
        activeElement: document.body,
      }),
    ).toBeNull();

    expect(
      getSelectedNoteBlockIdForShortcut({
        blocks: [{ id: "link-1", selected: true, type: "link" }],
        activeElement: document.body,
      }),
    ).toBeNull();
  });

  it("resolves note mode shortcut actions across edit and preview states", () => {
    expect(
      resolveNoteModeShortcutAction({
        key: "p",
        isEditing: true,
        isReadOnly: false,
        vimMode: false,
        hasRichTextEditor: true,
      }),
    ).toBe("switchToPreview");

    expect(
      resolveNoteModeShortcutAction({
        key: "p",
        isEditing: false,
        isReadOnly: false,
        vimMode: false,
        hasRichTextEditor: true,
      }),
    ).toBe("passThrough");

    expect(
      resolveNoteModeShortcutAction({
        key: "e",
        isEditing: false,
        isReadOnly: false,
        vimMode: false,
        hasRichTextEditor: true,
      }),
    ).toBe("switchToEdit");

    expect(
      resolveNoteModeShortcutAction({
        key: "e",
        isEditing: true,
        isReadOnly: false,
        vimMode: false,
        hasRichTextEditor: true,
      }),
    ).toBe("toggleInlineCode");

    expect(
      resolveNoteModeShortcutAction({
        key: "e",
        isEditing: true,
        isReadOnly: false,
        vimMode: true,
        hasRichTextEditor: false,
      }),
    ).toBe("noop");
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

  it("builds concatenated multi-block copy text with titles in tracked order", () => {
    const copiedText = buildMultiBlockCopyText(
      [
        { id: "a", data: { title: "First", content: "Alpha" } },
        { id: "b", data: { content: "Bravo" } },
        { id: "c", data: { title: "Header only", content: "   " } },
        { id: "d", data: { title: "Last", content: "Charlie" } },
        { id: "e", data: { title: "   ", content: "Echo" } },
      ],
      ["b", "a", "c", "d", "e"],
    );

    expect(copiedText).toBe(
      "Bravo\n\n# First\n\nAlpha\n\n# Header only\n\n# Last\n\nCharlie\n\nEcho",
    );
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
