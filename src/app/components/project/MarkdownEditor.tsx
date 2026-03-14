"use client";

import {
  EditorContent,
  useEditor,
  EditorContext,
  type Editor,
} from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import React, { useEffect, useState } from "react";
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

          // Check if any transaction added text
          const hasInput = transactions.some((t) => t.docChanged);
          if (!hasInput) return;

          const { selection } = newState;
          const { $from } = selection;
          const node = $from.parent;

          if (!node.isTextblock) return;

          // Get the text content of the current block
          const text = node.textContent;
          const startPos = $from.start();

          // Regex to match `code` pattern
          const regex = /(?:^|[^`])(`([^`]+)`)(?:[^`]|$)/g;
          let match;
          const matches: RegExpExecArray[] = [];

          while ((match = regex.exec(text)) !== null) {
            matches.push(match);
          }

          // Process matches in reverse order to avoid index shifting issues
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
  const isSyncingRef = React.useRef(false);
  const wasFocusedBeforeClickRef = React.useRef(false);

  const onLinkShortcutRef = React.useRef(onLinkShortcut);

  useEffect(() => {
    onLinkShortcutRef.current = onLinkShortcut;
  }, [onLinkShortcut]);

  // Type definition for Markdown storage
  interface MarkdownStorage {
    markdown: {
      getMarkdown: () => string;
    };
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        underline: false,
      }),
      Markdown,
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
          if (onLinkShortcutRef.current) {
            onLinkShortcutRef.current();
          }
        },
      }),
      SmartCode,
    ],
    editable: !isReadOnly,
    editorProps: {
      attributes: {
        class: `prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[100px] ${className}`,
      },
      handleDOMEvents: {
        mousedown: (view, event) => {
          const target = event.target;
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

  // Expose editor instance to parent
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Sync content updates from outside (e.g. Yjs updates)
  useEffect(() => {
    if (editor && content !== undefined) {
      const currentMarkdown = (
        editor.storage as unknown as MarkdownStorage
      ).markdown.getMarkdown();
      if (content !== currentMarkdown) {
        if (isReadOnly || !editor.isFocused || editor.isEmpty) {
          isSyncingRef.current = true;
          editor.commands.setContent(content);
          setTimeout(() => {
            isSyncingRef.current = false;
          }, 0);
        }
      }
    }
  }, [content, editor, isReadOnly]);

  // Sync read-only state
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
      className={`markdown-editor-container relative w-full h-full ${
        className.includes("prosemirror-full-height")
          ? "prosemirror-full-height"
          : ""
      }`}
    >
      <EditorContext.Provider value={{ editor }}>
        <EditorContent editor={editor} className="h-full" />
      </EditorContext.Provider>
    </div>
  );
};

export default MarkdownEditor;
