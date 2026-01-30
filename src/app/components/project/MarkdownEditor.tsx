"use client";

import { EditorContent, useEditor, EditorContext } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import React, { useEffect, useState } from 'react'
import { Markdown } from "tiptap-markdown";
import BubbleMenuExtension from "@tiptap/extension-bubble-menu";
import Placeholder from "@tiptap/extension-placeholder";

import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
} from "lucide-react";
import "./markdown-editor.css";

interface MarkdownEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  isReadOnly?: boolean;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

const MarkdownEditor = ({
  content,
  onChange,
  isReadOnly = false,
  placeholder,
  className = "",
  onFocus,
  onBlur,
}: MarkdownEditorProps) => {
  const [, setIsFocused] = useState(false);

  // Type definition for Markdown storage
  interface MarkdownStorage {
    markdown: {
      getMarkdown: () => string;
    };
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Markdown,
      BubbleMenuExtension.configure({
        pluginKey: "bubbleMenu",
      }),
      Placeholder.configure({
        placeholder: placeholder || "",
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    editable: !isReadOnly,
    editorProps: {
      attributes: {
        class:
          `prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[100px] ${className}`,
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
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

  // Sync content updates from outside (e.g. Yjs updates)
  useEffect(() => {
    if (editor && content !== undefined) {
      const currentMarkdown = (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();
      if (content !== currentMarkdown) {
        if (!editor.isFocused || editor.isEmpty) {
          editor.commands.setContent(content);
        }
      }
    }
  }, [content, editor]);

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
    <div className={`markdown-editor-container relative w-full h-full ${className.includes("prosemirror-full-height") ? "prosemirror-full-height" : ""}`}>
      <EditorContext.Provider value={{ editor }}>
        {editor && (
          <BubbleMenu
            editor={editor}
            pluginKey="bubbleMenu"
            shouldShow={({ editor }) => {
               // Only show if selection is not empty and editor is editable
               return !editor.state.selection.empty && editor.isEditable;
            }}
          >
            <div className="bubble-menu">
              <button
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={editor.isActive("bold") ? "is-active" : ""}
                title="Bold"
              >
                <Bold size={14} />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={editor.isActive("italic") ? "is-active" : ""}
                title="Italic"
              >
                <Italic size={14} />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleStrike().run()}
                className={editor.isActive("strike") ? "is-active" : ""}
                title="Strikethrough"
              >
                <Strikethrough size={14} />
              </button>

              <div className="tiptap-bubble-menu-separator" />

              <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                className={editor.isActive("heading", { level: 1 }) ? "is-active" : ""}
                title="Heading 1"
              >
                <Heading1 size={14} />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={editor.isActive("heading", { level: 2 }) ? "is-active" : ""}
                title="Heading 2"
              >
                <Heading2 size={14} />
              </button>
              <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                className={editor.isActive("heading", { level: 3 }) ? "is-active" : ""}
                title="Heading 3"
              >
                <Heading3 size={14} />
              </button>
            </div>
          </BubbleMenu>
        )}

        <EditorContent editor={editor} className="h-full" />
      </EditorContext.Provider>
    </div>
  );
};

export default MarkdownEditor;
