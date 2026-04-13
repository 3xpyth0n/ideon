import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

import {
  getTaskItemCheckedStates,
  normalizeMarkdownTaskList,
  syncMarkdownTaskStates,
  stripMarkdownTaskPlaceholder,
  toggleReadonlyTaskItem,
} from "./markdownTaskList";

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

function getMarkdown(editor: Editor): string {
  return (
    editor.storage as unknown as {
      markdown: {
        getMarkdown: () => string;
      };
    }
  ).markdown.getMarkdown();
}

describe("markdownTaskList", () => {
  it("keeps empty task items round-trippable as real task lists", () => {
    const content = "- [x]\n- [ ]";
    const editor = new Editor({
      content: normalizeMarkdownTaskList(content),
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: false,
          underline: false,
        }),
        Markdown.configure({
          html: false,
          tightLists: true,
          bulletListMarker: "-",
          transformPastedText: true,
          transformCopiedText: true,
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
      ],
    });

    const markdown = getMarkdown(editor);

    expect(editor.state.doc.firstChild?.type.name).toBe("taskList");
    expect(stripMarkdownTaskPlaceholder(markdown)).toBe(content);
  });

  it("toggles the clicked preview task item", () => {
    const editor = new Editor({
      content: "- [ ] first\n- [ ] second\n- [ ] third",
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: false,
          underline: false,
        }),
        Markdown.configure({
          html: false,
          tightLists: true,
          bulletListMarker: "-",
          transformPastedText: true,
          transformCopiedText: true,
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
      ],
      editable: false,
    });

    document.body.appendChild(editor.view.dom);

    const taskItemElements = Array.from(
      editor.view.dom.querySelectorAll("li"),
    ) as HTMLElement[];

    expect(taskItemElements).toHaveLength(3);
    expect(toggleReadonlyTaskItem(editor, taskItemElements[0]!)).toBe(true);
    expect(editor.state.doc.firstChild?.child(0).attrs.checked).toBe(true);
    expect(editor.state.doc.firstChild?.child(1).attrs.checked).toBe(false);
    expect(editor.state.doc.firstChild?.child(2).attrs.checked).toBe(false);

    expect(toggleReadonlyTaskItem(editor, taskItemElements[1]!)).toBe(true);
    expect(editor.state.doc.firstChild?.child(0).attrs.checked).toBe(true);
    expect(editor.state.doc.firstChild?.child(1).attrs.checked).toBe(true);
    expect(editor.state.doc.firstChild?.child(2).attrs.checked).toBe(false);

    expect(toggleReadonlyTaskItem(editor, taskItemElements[0]!)).toBe(true);
    expect(editor.state.doc.firstChild?.child(0).attrs.checked).toBe(false);
    expect(editor.state.doc.firstChild?.child(1).attrs.checked).toBe(true);
    expect(editor.state.doc.firstChild?.child(2).attrs.checked).toBe(false);

    const persistedMarkdown = stripMarkdownTaskPlaceholder(
      syncMarkdownTaskStates(
        getMarkdown(editor),
        getTaskItemCheckedStates(editor),
      ),
    );

    expect(persistedMarkdown).toBe("- [ ] first\n- [x] second\n- [ ] third");

    const reloadedEditor = new Editor({
      content: persistedMarkdown,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: false,
          underline: false,
        }),
        Markdown.configure({
          html: false,
          tightLists: true,
          bulletListMarker: "-",
          transformPastedText: true,
          transformCopiedText: true,
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
      ],
    });

    expect(reloadedEditor.state.doc.firstChild?.type.name).toBe("taskList");
    expect(reloadedEditor.state.doc.firstChild?.child(0).attrs.checked).toBe(
      false,
    );
    expect(reloadedEditor.state.doc.firstChild?.child(1).attrs.checked).toBe(
      true,
    );
    expect(reloadedEditor.state.doc.firstChild?.child(2).attrs.checked).toBe(
      false,
    );

    reloadedEditor.destroy();
  });

  it("normalizes checkbox shorthand without changing task text", () => {
    const normalized = normalizeMarkdownTaskList("[]\n[x] done");

    expect(normalized.split("\n")[0].startsWith("- [ ] ")).toBe(true);
    expect(normalized).toContain("\u200B");
    expect(normalized.split("\n")[1]).toBe("- [x] done");
  });

  it("serializes shorthand task markers with bullet prefixes", () => {
    const persistedMarkdown = syncMarkdownTaskStates("[ ] first\n[x] second", [
      false,
      true,
    ]);

    expect(persistedMarkdown).toBe("- [ ] first\n- [x] second");
  });
});
