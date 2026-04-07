"use client";

import {
  EditorContent,
  useEditor,
  EditorContext,
  type Editor,
  wrappingInputRule,
} from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { Markdown } from "tiptap-markdown";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import UnderlineExtension from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { toast } from "sonner";
import { useI18n } from "@providers/I18nProvider";
import {
  MAX_BLOCK_CONTENT_LENGTH,
  clampBlockContent,
} from "@lib/projectContentSafety";

import "./markdown-editor.css";

// Caps inline code match processing to avoid expensive scans on large content; once exceeded, further inline code matches are skipped to keep the editor responsive.
const MAX_INLINE_CODE_MATCHES = 5000;

const KeyboardShortcuts = Extension.create({
  name: "keyboardShortcuts",

  addOptions() {
    return {
      onLinkShortcut: () => {},
      onUndoShortcut: (): boolean => false,
      onRedoShortcut: (): boolean => false,
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-b": () => this.editor.commands.toggleBold(),
      "Mod-i": () => this.editor.commands.toggleItalic(),
      "Mod-u": () => this.editor.commands.toggleUnderline(),
      "Mod-Shift-x": () => this.editor.commands.toggleStrike(),
      "Mod-e": () => this.editor.commands.toggleCode(),
      "Mod-z": () => {
        const canUndo = this.editor.can().chain().focus().undo().run();
        if (!canUndo) {
          return this.options.onUndoShortcut();
        }
        return this.editor.chain().focus().undo().run();
      },
      "Mod-y": () => {
        const canRedo = this.editor.can().chain().focus().redo().run();
        if (!canRedo) {
          return this.options.onRedoShortcut();
        }
        return this.editor.chain().focus().redo().run();
      },
      "Mod-Shift-z": () => {
        const canRedo = this.editor.can().chain().focus().redo().run();
        if (!canRedo) {
          return this.options.onRedoShortcut();
        }
        return this.editor.chain().focus().redo().run();
      },
      "Mod-k": () => {
        this.options.onLinkShortcut();
        return true;
      },
    };
  },
});

const SmartCode = Extension.create({
  name: "smartCode",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("smartCode"),
        appendTransaction: (transactions, oldState, newState) => {
          const tr = newState.tr;
          let modified = false;

          const hasInput = transactions.some((t) => t.docChanged);
          if (!hasInput) return;

          const { selection } = newState;
          const { $from } = selection;
          const node = $from.parent;

          if (!node.isTextblock) return;

          const text = node.textContent;
          if (text.length > MAX_BLOCK_CONTENT_LENGTH) return;

          const startPos = $from.start();
          const regex = /(?:^|[^`])(`([^`]+)`)(?:[^`]|$)/g;
          let match;
          const matches: RegExpExecArray[] = [];

          while ((match = regex.exec(text)) !== null) {
            matches.push(match);
            if (matches.length >= MAX_INLINE_CODE_MATCHES) {
              return null;
            }
          }

          for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            const matchStartInText = match.index + match[0].indexOf(match[1]);
            const matchEndInText = matchStartInText + match[1].length;

            const from = startPos + matchStartInText;
            const to = startPos + matchEndInText;

            const hasCodeMark = newState.doc.rangeHasMark(
              from,
              to,
              newState.schema.marks.code,
            );

            if (!hasCodeMark) {
              const codeText = match[2];
              const codeMark = newState.schema.marks.code.create();
              const textNode = newState.schema.text(codeText, [codeMark]);

              tr.replaceWith(from, to, textNode);
              modified = true;
            }
          }

          if (modified) return tr;
          return null;
        },
      }),
    ];
  },
});

const SmartTasks = Extension.create({
  name: "smartTasks",

  addInputRules() {
    return [
      wrappingInputRule({
        find: /^\s*(\[ \]|\[\])\s$/,
        type: this.editor.schema.nodes.taskList,
      }),
      wrappingInputRule({
        find: /^\s*([-*]\s)(\[ \]|\[\])\s$/,
        type: this.editor.schema.nodes.taskList,
      }),
    ];
  },
});

interface MarkdownEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  isReadOnly?: boolean;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onEditorReady?: (editor: Editor) => void;
  onLinkShortcut?: () => void;
  onUndoShortcut?: () => void;
  onRedoShortcut?: () => void;
  onPreviewShortcut?: () => void;
}

interface MarkdownStorage {
  markdown: {
    getMarkdown: () => string;
  };
}

function escapeTableCell(text: string): string {
  return text
    .replace(/\n+/g, " <br> ")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function serializeTableNode(tableNode: ProseMirrorNode): string {
  const rows: string[][] = [];
  let maxColumns = 0;

  tableNode.forEach((rowNode) => {
    if (rowNode.type.name !== "tableRow") return;

    const cells: string[] = [];
    rowNode.forEach((cellNode) => {
      if (
        cellNode.type.name === "tableCell" ||
        cellNode.type.name === "tableHeader"
      ) {
        cells.push(escapeTableCell(cellNode.textContent));
      }
    });

    maxColumns = Math.max(maxColumns, cells.length);
    rows.push(cells);
  });

  if (rows.length === 0 || maxColumns === 0) {
    return "";
  }

  const normalizedRows = rows.map((row) => {
    const padded = [...row];
    while (padded.length < maxColumns) padded.push("");
    return padded;
  });

  const headerRow = normalizedRows[0];
  const separatorRow = Array.from({ length: maxColumns }, () => "---");
  const markdownRows = [headerRow, separatorRow, ...normalizedRows.slice(1)];

  return markdownRows.map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function getTableMarkdownBlocks(doc: ProseMirrorNode): string[] {
  const tables: string[] = [];

  doc.descendants((node) => {
    if (node.type.name !== "table") return true;

    const tableMarkdown = serializeTableNode(node);
    if (tableMarkdown) {
      tables.push(tableMarkdown);
    }
    return true;
  });

  return tables;
}

function getStableMarkdown(editor: Editor): string {
  const rawMarkdown = (
    editor.storage as unknown as MarkdownStorage
  ).markdown.getMarkdown();

  const tablePlaceholderPattern = /\[\s*table\s*\]/gi;

  if (!tablePlaceholderPattern.test(rawMarkdown)) {
    return rawMarkdown;
  }

  const tableBlocks = getTableMarkdownBlocks(editor.state.doc);
  if (tableBlocks.length === 0) {
    return rawMarkdown;
  }

  let index = 0;
  return rawMarkdown.replace(tablePlaceholderPattern, () => {
    const tableMarkdown = tableBlocks[index];
    index += 1;
    return tableMarkdown ?? "[Table]";
  });
}

const MarkdownEditor = ({
  content,
  onChange,
  isReadOnly = false,
  placeholder,
  className = "",
  onFocus,
  onBlur,
  onEditorReady,
  onLinkShortcut,
  onUndoShortcut,
  onRedoShortcut,
  onPreviewShortcut,
}: MarkdownEditorProps) => {
  const { dict } = useI18n();
  const [, setIsFocused] = useState(false);
  const isSyncingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasFocusedBeforeClickRef = useRef(false);
  const lastLocalUpdateRef = useRef(0);

  const onLinkShortcutRef = useRef(onLinkShortcut);
  const onUndoShortcutRef = useRef(onUndoShortcut);
  const onRedoShortcutRef = useRef(onRedoShortcut);

  useEffect(() => {
    onLinkShortcutRef.current = onLinkShortcut;
  }, [onLinkShortcut]);

  useEffect(() => {
    onUndoShortcutRef.current = onUndoShortcut;
  }, [onUndoShortcut]);

  useEffect(() => {
    onRedoShortcutRef.current = onRedoShortcut;
  }, [onRedoShortcut]);

  const editor = useEditor({
    immediatelyRender: false,
    content: content,
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
      UnderlineExtension,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({
        openOnClick: isReadOnly,
        HTMLAttributes: {
          class: "cursor-pointer text-blue-500 hover:text-blue-600 underline",
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || "",
        emptyEditorClass: "is-editor-empty",
      }),
      KeyboardShortcuts.configure({
        onLinkShortcut: () => {
          if (!isReadOnly && onLinkShortcutRef.current) {
            onLinkShortcutRef.current();
          }
        },
        onUndoShortcut: () => {
          if (isReadOnly || !onUndoShortcutRef.current) {
            return false;
          }
          onUndoShortcutRef.current();
          return true;
        },
        onRedoShortcut: () => {
          if (isReadOnly || !onRedoShortcutRef.current) {
            return false;
          }
          onRedoShortcutRef.current();
          return true;
        },
      }),
      SmartCode,
      SmartTasks,
    ],
    editable: !isReadOnly,
    editorProps: {
      attributes: {
        class: `prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[100px] ${className}`,
      },
      handleDOMEvents: {
        mousedown: (view, event) => {
          const target = event.target as HTMLElement;

          if (target instanceof HTMLElement) {
            const anchor = target.closest("a");
            if (anchor instanceof HTMLAnchorElement && anchor.href) {
              event.preventDefault();
              event.stopPropagation();
              return true;
            }
          }

          wasFocusedBeforeClickRef.current = view.hasFocus();
          event.stopPropagation();
          return false;
        },
        click: (_view, event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;

          const anchor = target.closest("a");
          if (!(anchor instanceof HTMLAnchorElement) || !anchor.href) {
            return false;
          }

          event.preventDefault();
          event.stopPropagation();
          window.open(anchor.href, "_blank", "noopener,noreferrer");
          return true;
        },
      },
    },
    onUpdate: ({ editor }) => {
      if (isSyncingRef.current || isReadOnly) return;
      const markdown = getStableMarkdown(editor);

      if (markdown.length > MAX_BLOCK_CONTENT_LENGTH) {
        toast.error(dict.blocks.noteTooLarge);
        onChange?.(clampBlockContent(markdown, MAX_BLOCK_CONTENT_LENGTH));
        return;
      }

      onChange?.(markdown);
    },
    onFocus: () => {
      setIsFocused(true);
      onFocus?.();
    },
    onBlur: () => {
      setIsFocused(false);
      onBlur?.();
    },
  });

  const toggleCheckbox = useCallback(
    (li: HTMLElement) => {
      if (!editor) return;

      const view = editor.view;
      const nodePos = view.posAtDOM(li, 0);
      if (nodePos < 0) return;

      const { state } = view;
      const node = state.doc.nodeAt(nodePos);
      if (!node || node.type.name !== "taskItem") return;

      const checked = !node.attrs.checked;
      lastLocalUpdateRef.current = Date.now();

      // Temporarily enable editing to allow the transaction to be dispatched
      const wasEditable = editor.isEditable;
      if (!wasEditable) {
        editor.setEditable(true, false); // false to avoid focusing
      }

      editor.view.dispatch(
        editor.view.state.tr.setNodeMarkup(nodePos, undefined, {
          ...node.attrs,
          checked,
        }),
      );

      if (!wasEditable) {
        editor.setEditable(false, false);
      }

      // Force update the parent immediately
      const markdown = getStableMarkdown(editor);
      onChange?.(markdown);
    },
    [editor, onChange],
  );

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isReadOnly || !editor) return;

      const target = e.target as HTMLElement;
      const checkbox = target.closest('input[type="checkbox"]');
      const label = target.closest("label");

      if (checkbox || (label && label.closest('li[data-type="taskItem"]'))) {
        const li = target.closest(
          'li[data-type="taskItem"]',
        ) as HTMLElement | null;
        if (li) {
          toggleCheckbox(li);
          e.preventDefault();
          e.stopPropagation();
        }
      }
    },
    [isReadOnly, editor, toggleCheckbox],
  );

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
      return () => {
        onEditorReady(null as unknown as Editor);
      };
    }
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (editor && content !== undefined) {
      const processedContent = content
        .replace(/^(\s*)(-?\s*)(\[ \]|\[\])(\s*)$/gm, "$1- [ ] ")
        .replace(/^(\s*)(-?\s*)(\[x\])(\s*)$/gm, "$1- [x] ")
        .replace(/^(\s*)(-?\s*)(\[ \]|\[\])(\s.+)$/gm, "$1- [ ]$4")
        .replace(/^(\s*)(-?\s*)(\[x\])(\s.+)$/gm, "$1- [x]$4");

      const currentMarkdown = getStableMarkdown(editor);
      if (processedContent !== currentMarkdown) {
        const isRecentLocalUpdate =
          Date.now() - lastLocalUpdateRef.current < 500;

        if (
          (isReadOnly || !editor.isFocused || editor.isEmpty) &&
          !isRecentLocalUpdate
        ) {
          isSyncingRef.current = true;
          editor.commands.setContent(processedContent);
          setTimeout(() => {
            isSyncingRef.current = false;
          }, 0);
        }
      }
    }
  }, [content, editor, isReadOnly]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadOnly);
    }
  }, [isReadOnly, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`markdown-editor-container relative w-full h-full ${
        className.includes("prosemirror-full-height")
          ? "prosemirror-full-height"
          : ""
      }`}
      onClick={handleContainerClick}
      onKeyDownCapture={(event) => {
        if (
          !isReadOnly &&
          onPreviewShortcut &&
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "p"
        ) {
          event.preventDefault();
          event.stopPropagation();
          onPreviewShortcut();
        }
      }}
    >
      <EditorContext.Provider value={{ editor }}>
        <EditorContent editor={editor} className="h-full" />
      </EditorContext.Provider>
    </div>
  );
};

export default MarkdownEditor;
