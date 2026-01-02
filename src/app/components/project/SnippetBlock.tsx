"use client";

import { memo, useState, useCallback, useEffect } from "react";
import * as Y from "yjs";
import { Code, Lock } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import {
  Handle,
  Position,
  NodeResizer,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
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
import { DEFAULT_BLOCK_WIDTH, DEFAULT_BLOCK_HEIGHT } from "./utils/constants";
import { Select, SelectOption } from "../ui/Select";

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

const SnippetBlock = memo(({ id, data, selected }: SnippetBlockProps) => {
  const { dict, lang } = useI18n();
  const { setNodes, getNode, getEdges } = useReactFlow();

  const [code, setCode] = useState(data.content || "");
  const [language, setLanguage] = useState(
    data.metadata ? JSON.parse(data.metadata).language : "javascript",
  );

  const syncToYjs = useCallback(
    (text: string) => {
      if (!data.yText) return;
      if (data.yText.toString() === text) return;

      data.yText.delete(0, data.yText.length);
      data.yText.insert(0, text);
    },
    [data.yText],
  );

  // Sync content
  useEffect(() => {
    if (data.content !== undefined && data.content !== code) {
      setCode(data.content);
    }
  }, [data.content]);

  useEffect(() => {
    const yText = data.yText;
    if (!yText) return;

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
  }, [data.yText, code]);

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

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const isPreviewMode = data.isPreviewMode;
  const isLocked = data.isLocked;

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;
  const isReadOnly =
    isPreviewMode || (isLocked ? !isOwner && !isProjectOwner : false);

  const isBeingMoved = !!data.movingUserColor;
  const borderColor = isBeingMoved ? data.movingUserColor : "var(--border)";

  const handleCodeChange = useCallback(
    (newCode: string) => {
      setCode(newCode);
      syncToYjs(newCode);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.common.anonymous;

      data.onContentChange?.(
        id,
        newCode,
        now,
        editor,
        JSON.stringify({ language }),
        data.title,
      );
    },
    [id, data, currentUser, dict, language, syncToYjs],
  );

  const handleLanguageChange = useCallback(
    (newLang: string) => {
      setLanguage(newLang);
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.common.anonymous;

      data.onContentChange?.(
        id,
        code,
        now,
        editor,
        JSON.stringify({ language: newLang }),
        data.title,
      );
    },
    [id, data, currentUser, dict, code],
  );

  const formatDate = (isoString: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    };

    const formatted = new Intl.DateTimeFormat(
      lang === "fr" ? "fr-FR" : "en-US",
      options,
    ).format(date);

    return formatted.replace(",", "").replace(" ", ` ${dict.common.at} `);
  };

  const handleResize = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const { width, height, x, y } = params;

      const snapW =
        Math.abs(width - DEFAULT_BLOCK_WIDTH) <= DEFAULT_BLOCK_WIDTH * 0.1;
      const snapH =
        Math.abs(height - DEFAULT_BLOCK_HEIGHT) <= DEFAULT_BLOCK_HEIGHT * 0.1;

      const finalWidth = snapW ? DEFAULT_BLOCK_WIDTH : Math.round(width);
      const finalHeight = snapH ? DEFAULT_BLOCK_HEIGHT : Math.round(height);

      const currentBlock = getNode(id);
      if (!currentBlock) return;

      let finalX = Math.round(x);
      let finalY = Math.round(y);

      if (snapW && Math.abs(x - currentBlock.position.x) > 0.1) {
        finalX = Math.round(x + width - DEFAULT_BLOCK_WIDTH);
      }
      if (snapH && Math.abs(y - currentBlock.position.y) > 0.1) {
        finalY = Math.round(y + height - DEFAULT_BLOCK_HEIGHT);
      }

      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                width: finalWidth,
                height: finalHeight,
                position: { x: finalX, y: finalY },
              }
            : n,
        ),
      );
    },
    [id, getNode, setNodes],
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

  const edges = getEdges();
  const isLeftConnected = edges.some(
    (e) =>
      (e.target === id &&
        (e.targetHandle === "left" || e.targetHandle === "left-target")) ||
      (e.source === id && e.sourceHandle === "left"),
  );
  const isRightConnected = edges.some(
    (e) =>
      (e.source === id && e.sourceHandle === "right") ||
      (e.target === id &&
        (e.targetHandle === "right" || e.targetHandle === "right-target")),
  );

  return (
    <div
      className={`block-card block-type-snippet ${selected ? "selected" : ""} ${
        isBeingMoved ? "is-moving" : ""
      } ${isReadOnly ? "read-only" : ""} flex flex-col !p-0`}
      style={{ "--block-border-color": borderColor } as React.CSSProperties}
    >
      <NodeResizer
        minWidth={250}
        minHeight={150}
        isVisible={selected && !isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
        <div className="flex items-center gap-2">
          <Code size={16} />
          <span className="text-tiny uppercase tracking-wider opacity-50 font-bold">
            {dict.common.blockTypeSnippet || "Snippet"}
          </span>
        </div>
        <Select
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={handleLanguageChange}
          align="right"
        />
      </div>

      <div className="block-content flex-1 flex flex-col min-h-0 relative overflow-hidden bg-transparent nodrag">
        <Editor
          value={code}
          onValueChange={handleCodeChange}
          highlight={(code) =>
            highlight(code, languages[language] || languages.text, language)
          }
          padding={16}
          className="font-mono text-sm"
          style={{
            fontFamily: '"Fira code", "Fira Mono", monospace',
            fontSize: 14,
            backgroundColor: "transparent",
            minHeight: "100%",
          }}
          disabled={isReadOnly}
        />
      </div>

      <div className="block-author-container mt-2 pt-3 px-4 pb-3">
        <div className="flex items-center justify-between w-full text-tiny opacity-40">
          <div className="block-timestamp">
            {formatDate(data.updatedAt || "")}
          </div>
          <div className="block-author-info flex items-center gap-1.5">
            {isLocked && <Lock size={10} className="block-lock-icon" />}
            <div className="author-name">
              {(data.authorName || dict.common.anonymous).toLowerCase()}
            </div>
          </div>
        </div>
      </div>

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={true}
        className="block-handle block-handle-left !z-50"
      >
        {!isLeftConnected && <div className="handle-dot" />}
      </Handle>
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={true}
        className="block-handle block-handle-right !z-50"
      >
        {!isRightConnected && <div className="handle-dot" />}
      </Handle>
    </div>
  );
});

SnippetBlock.displayName = "SnippetBlock";

export default SnippetBlock;
