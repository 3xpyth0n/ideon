import { Editor, type Extensions } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { Markdown, type MarkdownNodeSpec } from "tiptap-markdown";
import {
  prosemirrorToYXmlFragment,
  yXmlFragmentToProseMirrorRootNode,
} from "y-prosemirror";
import * as Y from "yjs";
import { clampBlockContent } from "@lib/projectContentSafety";
import {
  normalizeMarkdownTaskList,
  stripMarkdownTaskPlaceholder,
  syncMarkdownTaskStates,
} from "./markdownTaskList";
import { CommentHighlight } from "./comments/CommentHighlightExtension";

type MarkdownSerializerState = Parameters<MarkdownNodeSpec["serialize"]>[0];

interface MarkdownStorage {
  markdown: {
    serializer: {
      serialize: (doc: ProseMirrorNode) => string;
    };
  };
}

function escapeTableCell(markdown: string): string {
  let escaped = "";
  let backslashCount = 0;
  const normalized = markdown.replace(/\n+/g, " <br> ");

  for (const character of normalized) {
    if (character === "|" && backslashCount % 2 === 0) {
      escaped += "\\";
    }
    escaped += character;
    backslashCount = character === "\\" ? backslashCount + 1 : 0;
  }

  return escaped.trim();
}

function getSafeImageSource(source: unknown): string | null {
  if (typeof source !== "string" || !source.trim()) return null;

  const pageOrigin =
    typeof window === "undefined"
      ? "https://ideon.invalid"
      : window.location.origin;
  const origin = pageOrigin === "null" ? "https://ideon.invalid" : pageOrigin;

  try {
    const url = new URL(source, origin);
    if (url.protocol !== "https:" && url.origin !== origin) return null;
    return url.origin === origin
      ? `${url.pathname}${url.search}${url.hash}`
      : url.href;
  } catch {
    return null;
  }
}

const MarkdownImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    const src = getSafeImageSource(HTMLAttributes.src);
    if (!src) {
      const alt =
        typeof HTMLAttributes.alt === "string" ? HTMLAttributes.alt : "";
      return ["span", { "aria-label": alt }, alt];
    }

    return [
      "img",
      {
        ...HTMLAttributes,
        src,
        loading: "lazy",
        referrerpolicy: "no-referrer",
      },
    ];
  },
});

export const MarkdownTable = Table.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, tableNode: ProseMirrorNode) {
          tableNode.forEach((rowNode, _rowOffset, rowIndex) => {
            state.write("| ");
            rowNode.forEach((cellNode, _cellOffset, cellIndex) => {
              if (cellIndex > 0) state.write(" | ");

              const cellContent = cellNode.firstChild;
              if (!cellContent?.textContent.trim()) return;

              const serializerState = state as typeof state & { out: string };
              const markdown = (() => {
                const previousOutput = serializerState.out;
                try {
                  serializerState.out = "";
                  state.renderInline(cellContent);
                  return serializerState.out;
                } finally {
                  serializerState.out = previousOutput;
                }
              })();
              state.write(escapeTableCell(markdown));
            });
            state.write(" |");
            state.ensureNewLine();

            if (rowIndex === 0) {
              const separator = Array.from({ length: rowNode.childCount })
                .map(() => "---")
                .join(" | ");
              state.write(`| ${separator} |`);
              state.ensureNewLine();
            }
          });
          state.closeBlock(tableNode);
        },
      },
    };
  },
});

export function createNoteContentExtensions(
  options: { isReadOnly?: boolean; collaborative?: boolean } = {},
): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: false,
      underline: false,
      undoRedo: options.collaborative ? false : undefined,
    }),
    Markdown.configure({
      html: false,
      tightLists: true,
      bulletListMarker: "-",
      transformPastedText: true,
      transformCopiedText: true,
    }),
    Underline,
    TaskList,
    TaskItem.configure({
      nested: true,
      onReadOnlyChecked: () => true,
    }),
    MarkdownTable.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Link.configure({
      openOnClick: options.isReadOnly ?? false,
      HTMLAttributes: {
        class: "cursor-pointer text-blue-500 hover:text-blue-600 underline",
      },
    }),
    MarkdownImage.configure({ inline: false, allowBase64: false }),
    CommentHighlight,
  ];
}

export function createNoteContentEditor(content = ""): Editor {
  return new Editor({
    content: normalizeMarkdownTaskList(content),
    extensions: createNoteContentExtensions(),
  });
}

function serializeMarkdownDocument(
  editor: Editor,
  doc: ProseMirrorNode,
): string {
  const markdownStorage = (editor.storage as unknown as MarkdownStorage)
    .markdown;
  const rawMarkdown = stripMarkdownTaskPlaceholder(
    markdownStorage.serializer.serialize(doc),
  );
  const taskItemCheckedStates: boolean[] = [];

  doc.descendants((node) => {
    if (node.type.name === "taskItem") {
      taskItemCheckedStates.push(Boolean(node.attrs.checked));
    }
    return true;
  });

  return stripMarkdownTaskPlaceholder(
    syncMarkdownTaskStates(rawMarkdown, taskItemCheckedStates),
  );
}

export function getStableMarkdown(editor: Editor): string {
  return serializeMarkdownDocument(editor, editor.state.doc);
}

export function getMarkdownFromXmlFragment(fragment: Y.XmlFragment): string {
  const editor = createNoteContentEditor();

  try {
    const doc = yXmlFragmentToProseMirrorRootNode(fragment, editor.schema);
    return serializeMarkdownDocument(editor, doc);
  } finally {
    editor.destroy();
  }
}

export function syncMarkdownToXmlFragment(
  fragment: Y.XmlFragment,
  markdown: string,
): void {
  const safeMarkdown = clampBlockContent(markdown);
  if (getMarkdownFromXmlFragment(fragment) === safeMarkdown) return;

  const editor = createNoteContentEditor(safeMarkdown);

  try {
    const update = () => prosemirrorToYXmlFragment(editor.state.doc, fragment);
    const doc = fragment.doc;

    if (doc) {
      doc.transact(update, doc.clientID);
    } else {
      update();
    }
  } finally {
    editor.destroy();
  }
}
