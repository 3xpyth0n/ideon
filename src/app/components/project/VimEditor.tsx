"use client";

import React, { useEffect, useRef, memo } from "react";
import CodeMirror, {
  ReactCodeMirrorProps,
  ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import { vim, Vim } from "@replit/codemirror-vim";
import { EditorView } from "@codemirror/view";

// Custom interface to expose Vim commands if needed
declare module "@replit/codemirror-vim" {
  export const Vim: {
    defineEx: (
      name: string,
      prefix: string,
      func: (cm: unknown) => void,
    ) => void;
    handleEx: (cm: unknown, command: string) => void;
  };
}

interface VimEditorProps extends Omit<ReactCodeMirrorProps, "extensions"> {
  extensions?: ReactCodeMirrorProps["extensions"];
  onSave?: () => void;
  onQuit?: () => void;
  vimEnabled?: boolean;
}

const VimEditorContent = memo(
  ({
    extensions = [],
    className,
    onSave,
    onQuit,
    vimEnabled = true,
    ...props
  }: VimEditorProps) => {
    const editorRef = useRef<ReactCodeMirrorRef>(null);

    useEffect(() => {
      // Define custom Ex commands like :w, :q, :wq, :x unconditionally
      // Note: defineEx is global to the Vim instance.
      try {
        Vim.defineEx("write", "w", () => {
          if (onSave) onSave();
        });

        Vim.defineEx("quit", "q", () => {
          if (onQuit) {
            onQuit();
          } else {
            editorRef.current?.view?.contentDOM?.blur();
          }
        });

        Vim.defineEx("wq", "wq", () => {
          if (onSave) onSave();
          if (onQuit) {
            onQuit();
          } else {
            editorRef.current?.view?.contentDOM?.blur();
          }
        });

        Vim.defineEx("x", "x", () => {
          if (onSave) onSave();
          if (onQuit) {
            onQuit();
          } else {
            editorRef.current?.view?.contentDOM?.blur();
          }
        });
      } catch (e) {
        console.error("Vim defineEx error:", e);
      }
    }, [onSave, onQuit]);

    const themeExtension = EditorView.theme({
      "&": {
        height: "100%",
        backgroundColor: "var(--bg-island, #1a1a1a)",
      },
      ".cm-scroller": {
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        lineHeight: "1.6",
      },
      ".cm-content": {
        padding: "10px 0",
      },
      ".cm-gutters": {
        display: "flex",
        backgroundColor: "transparent",
        border: "none",
      },
    });

    const mergedExtensions = [
      ...(vimEnabled ? [vim({ status: true })] : []),
      EditorView.lineWrapping,
      themeExtension,
      ...extensions,
    ];

    return (
      <div className="vim-editor-wrapper relative w-full h-full flex flex-col">
        <CodeMirror
          ref={editorRef}
          height="100%"
          className={`flex-1 overflow-auto vim-code-mirror ${className || ""}`}
          extensions={mergedExtensions}
          {...props}
        />
      </div>
    );
  },
);

VimEditorContent.displayName = "VimEditorContent";

export default VimEditorContent;
