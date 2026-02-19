"use client";

import { EditorContent, useEditor, EditorContext } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import React, { useEffect, useState, useCallback } from "react";
import { Markdown } from "tiptap-markdown";
import BubbleMenuExtension from "@tiptap/extension-bubble-menu";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import UnderlineExtension from "@tiptap/extension-underline";

import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Unlink,
  Check,
  X,
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
  const isSyncingRef = React.useRef(false);
  const [isEditingLink, setIsEditingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

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
      UnderlineExtension,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "cursor-pointer text-blue-500 hover:text-blue-600 underline",
        },
      }),
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

  // Reset link editing state when selection changes
  useEffect(() => {
    if (!editor) return;

    const handleSelectionUpdate = () => {
      if (!editor.isActive("link") && isEditingLink) {
        setIsEditingLink(false);
      }
    };

    editor.on("selectionUpdate", handleSelectionUpdate);
    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [editor, isEditingLink]);

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

  const openLinkModal = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    setLinkUrl(previousUrl || "");
    setIsEditingLink(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    if (linkUrl) {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: linkUrl })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setIsEditingLink(false);
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setIsEditingLink(false);
  }, [editor]);

  const cancelLink = useCallback(() => {
    setIsEditingLink(false);
    setLinkUrl("");
    editor?.commands.focus();
  }, [editor]);

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
        {editor && (
          <BubbleMenu
            editor={editor}
            pluginKey="bubbleMenu"
            shouldShow={({ editor }) => {
              // Show if selection is not empty OR if we are on a link
              // Also ensure editor is editable
              if (!editor.isEditable) return false;
              return !editor.state.selection.empty || editor.isActive("link");
            }}
          >
            <div className="bubble-menu">
              {isEditingLink ? (
                <>
                  <input
                    type="text"
                    className="bubble-menu-input"
                    placeholder="https://..."
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyLink();
                      } else if (e.key === "Escape") {
                        cancelLink();
                      }
                    }}
                    autoFocus
                  />
                  <button
                    onClick={applyLink}
                    title="Apply"
                    className="text-green-400 hover:text-green-300"
                  >
                    <Check size={14} />
                  </button>
                  {editor.isActive("link") && (
                    <button
                      onClick={removeLink}
                      title="Unlink"
                      className="text-red-400 hover:text-red-300"
                    >
                      <Unlink size={14} />
                    </button>
                  )}
                  <button onClick={cancelLink} title="Cancel">
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
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
                    onClick={() =>
                      editor.chain().focus().toggleUnderline().run()
                    }
                    className={editor.isActive("underline") ? "is-active" : ""}
                    title="Underline"
                  >
                    <Underline size={14} />
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
                    onClick={() =>
                      editor.chain().focus().toggleHeading({ level: 1 }).run()
                    }
                    className={
                      editor.isActive("heading", { level: 1 })
                        ? "is-active"
                        : ""
                    }
                    title="Heading 1"
                  >
                    <Heading1 size={14} />
                  </button>
                  <button
                    onClick={() =>
                      editor.chain().focus().toggleHeading({ level: 2 }).run()
                    }
                    className={
                      editor.isActive("heading", { level: 2 })
                        ? "is-active"
                        : ""
                    }
                    title="Heading 2"
                  >
                    <Heading2 size={14} />
                  </button>
                  <button
                    onClick={() =>
                      editor.chain().focus().toggleHeading({ level: 3 }).run()
                    }
                    className={
                      editor.isActive("heading", { level: 3 })
                        ? "is-active"
                        : ""
                    }
                    title="Heading 3"
                  >
                    <Heading3 size={14} />
                  </button>

                  <div className="tiptap-bubble-menu-separator" />

                  <button
                    onClick={openLinkModal}
                    className={editor.isActive("link") ? "is-active" : ""}
                    title={editor.isActive("link") ? "Edit Link" : "Add Link"}
                  >
                    <LinkIcon size={14} />
                  </button>
                </>
              )}
            </div>
          </BubbleMenu>
        )}

        <EditorContent editor={editor} className="h-full" />
      </EditorContext.Provider>
    </div>
  );
};

export default MarkdownEditor;
