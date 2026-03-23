"use client";

import { memo, useState, useCallback, useEffect, useMemo } from "react";
import * as Y from "yjs";
import { Code, Brush, Copy } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { BlockFooter } from "./BlockFooter";
import { useTouchGestures } from "./hooks/useTouchGestures";
import { format } from "prettier/standalone";
import type { Plugin } from "prettier";
import * as parserBabel from "prettier/plugins/babel";
import * as parserEstree from "prettier/plugins/estree";
import * as parserPostcss from "prettier/plugins/postcss";
import { toast } from "sonner";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import dynamic from "next/dynamic";
import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-css";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/themes/prism-tomorrow.css"; // Dark theme

import { BlockData } from "./CanvasBlock";
import { Select, SelectOption } from "@components/ui/Select";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import { markdown } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import { python } from "@codemirror/lang-python";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import "./snippet-block.css";

const VimEditor = dynamic(() => import("./VimEditor"), { ssr: false });

type SnippetBlockProps = NodeProps<Node<BlockData>> & {
  isReadOnly?: boolean;
};

const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "css", label: "CSS" },
  { value: "python", label: "Python" },
  { value: "json", label: "JSON" },
  { value: "text", label: "Plain Text" },
];

const getLanguageExtension = (lang: string) => {
  switch (lang.toLowerCase()) {
    case "javascript":
    case "typescript":
    case "js":
    case "ts":
      return javascript();
    case "html":
      return html();
    case "css":
      return css();
    case "json":
      return json();
    case "sql":
      return sql();
    case "python":
      return python();
    case "cpp":
    case "c++":
    case "c":
      return cpp();
    case "java":
      return java();
    case "markdown":
    case "md":
    default:
      return markdown();
  }
};

const SnippetBlock = memo(({ id, data, selected }: SnippetBlockProps) => {
  const { dict, lang } = useI18n();
  const { setNodes, getEdges } = useReactFlow();

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const isPreviewMode = data.isPreviewMode;
  const isLocked = data.isLocked;

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;
  const isViewer = data.userRole === "viewer";
  const isReadOnly =
    isPreviewMode ||
    isViewer ||
    (isLocked ? !isOwner && !isProjectOwner : false);
  const canReact = !isPreviewMode || isViewer;

  const edges = getEdges();
  const isHandleConnected = (handleId: string) =>
    edges.some(
      (e) =>
        (e.source === id && e.sourceHandle === handleId) ||
        (e.target === id && e.targetHandle === handleId),
    );

  const isLeftSourceConnected = isHandleConnected("left");
  const isRightSourceConnected = isHandleConnected("right");
  const isTopSourceConnected = isHandleConnected("top");
  const isBottomSourceConnected = isHandleConnected("bottom");

  const [code, setCode] = useState(data.content || "");
  const [title, setTitle] = useState(data.title || "");
  const [language, setLanguage] = useState(() => {
    if (!data.metadata) return "javascript";
    try {
      const parsed =
        typeof data.metadata === "string"
          ? JSON.parse(data.metadata)
          : data.metadata;
      return parsed.language || "javascript";
    } catch {
      return "javascript";
    }
  });

  const snippetVimExtensions = useMemo(
    () => [getLanguageExtension(language)],
    [language],
  );

  const syncToYjs = useCallback(
    (text: string) => {
      if (!data.yText) return;
      if (data.yText.toString() === text) return;

      data.yText.doc?.transact(() => {
        data.yText?.delete(0, data.yText.length);
        data.yText?.insert(0, text);
      }, data.yText.doc.clientID);
    },
    [data.yText],
  );

  // Sync content
  useEffect(() => {
    if (data.content !== undefined && data.content !== code) {
      setCode(data.content);
    }
  }, [data.content]);

  // Sync title
  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title]);

  useEffect(() => {
    const yText = data.yText;
    if (!yText) return;
    if (isReadOnly) return;

    const currentYText = yText.toString();
    if (code !== currentYText) {
      setCode(currentYText);
    }

    const observer = (event: Y.YTextEvent) => {
      if (event.transaction.local) return;
      setCode(yText.toString());
    };

    yText.observe(observer);
    return () => yText.unobserve(observer);
  }, [data.yText, code, isReadOnly]);

  // Sync metadata (language)
  useEffect(() => {
    const meta =
      typeof data.metadata === "string"
        ? JSON.parse(data.metadata)
        : data.metadata;
    if (meta?.language && meta.language !== language) {
      setLanguage(meta.language);
    }
  }, [data.metadata]);

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
    canReact,
  });

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;

      data.onContentChange?.(
        id,
        data.content,
        now,
        editor,
        data.metadata,
        newTitle,
        data.reactions,
      );
    },
    [id, data, currentUser, dict],
  );

  const handleCodeChange = useCallback(
    (newCode: string) => {
      setCode(newCode);
      syncToYjs(newCode);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;

      data.onContentChange?.(
        id,
        newCode,
        now,
        editor,
        JSON.stringify({ language }),
        title,
        data.reactions,
      );
    },
    [id, data, currentUser, dict, language, syncToYjs, title],
  );

  const handleVimChange = useCallback(
    (value: string) => {
      setCode(value);
      if (syncToYjs) {
        syncToYjs(value);
      }
    },
    [syncToYjs],
  );

  const handleLanguageChange = useCallback(
    (newLang: string) => {
      setLanguage(newLang);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;

      data.onContentChange?.(
        id,
        code,
        now,
        editor,
        JSON.stringify({ language: newLang }),
        title,
        data.reactions,
      );
    },
    [id, data, currentUser, dict, code, title],
  );

  const isBeingMoved = !!data.movingUserColor;
  const borderColor = isBeingMoved ? data.movingUserColor : "var(--border)";

  const onLongPress = useCallback((e: React.TouchEvent | TouchEvent) => {
    const target = e.target as HTMLElement;
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX:
        "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX,
      clientY:
        "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY,
    });
    target.dispatchEvent(event);
  }, []);

  const touchHandlers = useTouchGestures({
    onLongPress,
  });

  const handleFormat = useCallback(async () => {
    try {
      let parser = "";
      let plugins: Plugin[] = [];

      switch (language) {
        case "javascript":
          parser = "babel";
          plugins = [parserBabel, parserEstree];
          break;
        case "typescript":
          parser = "babel-ts";
          plugins = [parserBabel, parserEstree];
          break;
        case "css":
          parser = "css";
          plugins = [parserPostcss];
          break;
        case "json":
          parser = "json";
          plugins = [parserBabel, parserEstree];
          break;
        default:
          return;
      }

      if (!parser) return;

      const formatted = await format(code, {
        parser,
        plugins,
        printWidth: 80,
        tabWidth: 2,
        semi: true,
        singleQuote: false,
      });

      handleCodeChange(formatted);
      toast.success(dict.blocks.codeFormatted || "Code formatted");
    } catch {
      toast.error(dict.blocks.formatError || "Formatting failed");
    }
  }, [code, language, handleCodeChange, dict]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    toast.success(dict.common.copiedToClipboard || "Copied to clipboard");
  }, [code, dict]);

  const handleResize = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                width: Math.round(params.width),
                height: Math.round(params.height),
                position: {
                  x: Math.round(params.x),
                  y: Math.round(params.y),
                },
              }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const handleResizeEnd = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const { width, height, x, y } = params;
      data.onResizeEnd?.(id, { width, height, x, y });
    },
    [data, id],
  );

  const lineCount = useMemo(() => code.split("\n").length, [code]);
  const lines = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1),
    [lineCount],
  );

  return (
    <div
      className={`block-card block-type-snippet ${selected ? "selected" : ""} ${
        isBeingMoved ? "is-moving" : ""
      } ${isReadOnly ? "read-only" : ""} flex flex-col p-0!`}
      style={
        isBeingMoved
          ? ({ "--block-border-color": borderColor } as React.CSSProperties)
          : undefined
      }
      {...touchHandlers}
    >
      <CustomNodeResizer
        minWidth={250}
        minHeight={180}
        isVisible={!isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit]">
        <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
          <div className="flex items-center gap-2">
            <Code size={16} />
            <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
              {dict.blocks.blockTypeSnippet || "Snippet"}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            <input
              value={title}
              onChange={handleTitleChange}
              className="block-title mr-2"
              placeholder={dict.blocks.title || "..."}
              readOnly={isReadOnly}
            />
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleCopy}
                className="snippet-format-button"
                title={dict.blocks.copyCode || "Copy Code"}
              >
                <Copy size={14} />
              </button>
              {language !== "text" && language !== "python" && !isReadOnly && (
                <button
                  onClick={handleFormat}
                  className="snippet-format-button"
                  title={dict.blocks.formatCode || "Format code"}
                >
                  <Brush size={14} />
                </button>
              )}
              <Select
                value={language}
                options={LANGUAGE_OPTIONS}
                onChange={handleLanguageChange}
                align="right"
                triggerClassName="pr-3!"
                className="ml-1"
                disabled={isReadOnly}
              />
            </div>
          </div>
        </div>

        <div className="block-content flex-1 flex flex-col min-h-0 relative overflow-hidden bg-transparent nodrag">
          {currentUser?.vimMode ? (
            <VimEditor
              value={code}
              onChange={handleVimChange}
              editable={!isReadOnly}
              extensions={snippetVimExtensions}
              theme="dark"
              className="h-full font-mono text-sm leading-relaxed"
            />
          ) : (
            <div
              className="snippet-block-container nopan nodrag nowheel"
              onWheel={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                // Prevent focus loss when clicking the scrollbar
                if (e.target === e.currentTarget) {
                  e.preventDefault();
                }
              }}
            >
              <div className="snippet-line-numbers">
                {lines.map((i) => (
                  <div key={i}>{i}</div>
                ))}
              </div>
              <Editor
                value={code}
                onValueChange={handleCodeChange}
                highlight={(code) =>
                  highlight(
                    code,
                    languages[language] || languages.text,
                    language,
                  )
                }
                padding={16}
                className="font-mono text-sm snippet-block-editor"
                disabled={isReadOnly}
              />
            </div>
          )}
        </div>

        <BlockFooter
          updatedAt={data.updatedAt}
          authorName={data.authorName}
          isLocked={isLocked}
          dict={dict}
          lang={lang}
        />
      </div>

      <BlockReactions
        reactions={data.reactions}
        onReact={handleReact}
        onRemoveReaction={handleRemoveReaction}
        currentUserId={currentUser?.id}
        isReadOnly={isReadOnly}
        canReact={canReact}
      />

      {/* Handles - Left Side */}
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={true}
        className="block-handle block-handle-left z-50!"
      >
        {!isLeftSourceConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Right Side */}
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={true}
        className="block-handle block-handle-right z-50!"
      >
        {!isRightSourceConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Top Side */}
      <Handle
        id="top"
        type="source"
        position={Position.Top}
        isConnectable={true}
        className="block-handle block-handle-top z-50!"
      >
        {!isTopSourceConnected && <div className="handle-dot" />}
      </Handle>

      {/* Handles - Bottom Side */}
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={true}
        className="block-handle block-handle-bottom z-50!"
      >
        {!isBottomSourceConnected && <div className="handle-dot" />}
      </Handle>
    </div>
  );
});

SnippetBlock.displayName = "SnippetBlock";

export default SnippetBlock;
