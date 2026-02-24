"use client";

import {
  EditorContent,
  useEditor,
  EditorContext,
  type Editor,
} from "@tiptap/react";
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

interface MarkdownEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  isReadOnly?: boolean;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onEditorReady?: (editor: Editor) => void;
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
}: MarkdownEditorProps) => {
  const [, setIsFocused] = useState(false);
  const isSyncingRef = React.useRef(false);

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
        openOnClick: false,
        HTMLAttributes: {
          class: "cursor-pointer text-blue-500 hover:text-blue-600 underline",
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || "",
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    editable: !isReadOnly,
    editorProps: {
      attributes: {
        class: `prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[100px] ${className}`,
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
