"use client";

import {
  EditorContent,
  useEditor,
  EditorContext,
  type Editor,
  wrappingInputRule,
} from "@tiptap/react";
import { Extension } from "@tiptap/core";
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

import "./markdown-editor.css";

const KeyboardShortcuts = Extension.create({
  name: "keyboardShortcuts",

  addOptions() {
    return {
      onLinkShortcut: () => {},
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-b": () => this.editor.commands.toggleBold(),
      "Mod-i": () => this.editor.commands.toggleItalic(),
      "Mod-u": () => this.editor.commands.toggleUnderline(),
      "Mod-Shift-x": () => this.editor.commands.toggleStrike(),
      "Mod-e": () => this.editor.commands.toggleCode(),
      "Mod-z": () => this.editor.commands.undo(),
      "Mod-y": () => this.editor.commands.redo(),
      "Mod-Shift-z": () => this.editor.commands.redo(),
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
          const startPos = $from.start();

          const regex = /(?:^|[^`])(`([^`]+)`)(?:[^`]|$)/g;
          let match;
          const matches: RegExpExecArray[] = [];

          while ((match = regex.exec(text)) !== null) {
            matches.push(match);
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
}

interface MarkdownStorage {
  markdown: {
    getMarkdown: () => string;
  };
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
}: MarkdownEditorProps) => {
  const [, setIsFocused] = useState(false);
  const isSyncingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasFocusedBeforeClickRef = useRef(false);
  const lastLocalUpdateRef = useRef(0);

  const onLinkShortcutRef = useRef(onLinkShortcut);

  useEffect(() => {
    onLinkShortcutRef.current = onLinkShortcut;
  }, [onLinkShortcut]);

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
      if (isSyncingRef.current) return;
      const markdown = (
        editor.storage as unknown as MarkdownStorage
      ).markdown.getMarkdown();

      if (markdown.length > 1000000) {
        toast.error(
          "Note is too large. Truncating to 1MB to preserve performance.",
        );
        onChange?.(markdown.slice(0, 1000000));
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
      const markdown = (
        editor.storage as unknown as MarkdownStorage
      ).markdown.getMarkdown();
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

      const currentMarkdown = (
        editor.storage as unknown as MarkdownStorage
      ).markdown.getMarkdown();
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
    >
      <EditorContext.Provider value={{ editor }}>
        <EditorContent editor={editor} className="h-full" />
      </EditorContext.Provider>
    </div>
  );
};

export default MarkdownEditor;
