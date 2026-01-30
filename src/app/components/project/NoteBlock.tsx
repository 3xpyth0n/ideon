"use client";

import { memo, useCallback, useState, useEffect } from "react";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  NodeResizer,
  useReactFlow,
} from "@xyflow/react";
import { FileText, Lock } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { BlockData } from "./CanvasBlock";
import MarkdownEditor from "./MarkdownEditor";

type NoteBlockProps = NodeProps<Node<BlockData, "text">>;

const NoteBlock = memo(({ data, selected, id }: NoteBlockProps) => {
  const { dict, lang } = useI18n();
  const { getEdges } = useReactFlow();
  const [title, setTitle] = useState(data.title || "");

  const edges = getEdges();
  const isLeftTargetConnected = edges.some(
    (e) =>
      e.target === id &&
      (e.targetHandle === "left" || e.targetHandle === "left-target"),
  );
  const isLeftSourceConnected = edges.some(
    (e) =>
      e.source === id &&
      (e.sourceHandle === "left" || e.sourceHandle === "left-source"),
  );
  const isRightTargetConnected = edges.some(
    (e) =>
      e.target === id &&
      (e.targetHandle === "right" || e.targetHandle === "right-target"),
  );
  const isRightSourceConnected = edges.some(
    (e) =>
      e.source === id &&
      (e.sourceHandle === "right" || e.sourceHandle === "right-source"),
  );

  // Sync with Yjs
  const syncToYjs = useCallback(
    (text: string) => {
      if (!data.yText) return;
      if (data.yText.toString() === text) return;
      data.yText.doc?.transact(() => {
        data.yText?.delete(0, data.yText.length);
        data.yText?.insert(0, text);
      });
    },
    [data.yText],
  );

  useEffect(() => {
    setTitle(data.title || "");
  }, [data.title]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      
      data.onContentChange?.(
        id,
        data.content || "",
        new Date().toISOString(),
        data.lastEditor,
        data.metadata ? JSON.stringify(data.metadata) : undefined,
        newTitle
      );
    },
    [id, data]
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

  const handleContentChange = useCallback(
    (newContent: string) => {
      syncToYjs(newContent);
      data.onContentChange?.(
        id,
        newContent,
        new Date().toISOString(),
        data.lastEditor,
        data.metadata ? JSON.stringify(data.metadata) : undefined,
        title,
      );
    },
    [id, data.onContentChange, data.lastEditor, data.metadata, title, syncToYjs],
  );

  return (
    <>
      <NodeResizer
        isVisible={selected && !data.isPreviewMode}
        minWidth={200}
        minHeight={100}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
      />
      <div
        className={`block-card block-type-note ${
          selected ? "selected" : ""
        } flex flex-col !bg-transparent !p-0`}
      >
        <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
          <div className="flex items-center gap-2">
            <FileText size={16} />
            <span className="text-tiny uppercase tracking-wider opacity-50 font-bold">
              {dict.common.blockTypeText || "Note"}
            </span>
          </div>
          <div className="flex items-center gap-2 opacity-50">
            <input
              value={title}
              onChange={handleTitleChange}
              className="block-title text-[10px] font-bold tracking-widest text-right focus:opacity-100 transition-opacity bg-transparent outline-none placeholder:opacity-50"
              placeholder={dict.common.title || "..."}
              disabled={data.isPreviewMode}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 relative px-4 overflow-y-auto nodrag cursor-text">
          <MarkdownEditor
            content={data.content}
            onChange={handleContentChange}
            isReadOnly={data.isPreviewMode}
            placeholder=""
            className="text-base prosemirror-full-height"
          />
        </div>

        <div className="block-author-container mt-2 pt-3 px-4 pb-3">
          <div className="flex items-center justify-between w-full text-tiny opacity-40">
            <div className="block-timestamp">
              {formatDate(data.updatedAt || "")}
            </div>
            <div className="block-author-info flex items-center gap-1.5">
              {data.isLocked && <Lock size={10} className="block-lock-icon" />}
              <div className="author-name">
                {(data.authorName || dict.common.anonymous).toLowerCase()}
              </div>
            </div>
          </div>
        </div>

        {/* Handles for connections - Left Side */}
        <Handle
          id="left-target"
          type="target"
          position={Position.Left}
          isConnectable={true}
          className="block-handle block-handle-left !z-50 !top-[40%]"
        >
          {!isLeftTargetConnected && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="left"
          type="source"
          position={Position.Left}
          isConnectable={true}
          className="block-handle block-handle-left !z-50 !top-[60%]"
        >
          {!isLeftSourceConnected && <div className="handle-dot" />}
        </Handle>

        {/* Handles for connections - Right Side */}
        <Handle
          id="right"
          type="source"
          position={Position.Right}
          isConnectable={true}
          className="block-handle block-handle-right !z-50 !top-[40%]"
        >
          {!isRightSourceConnected && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="right-target"
          type="target"
          position={Position.Right}
          isConnectable={true}
          className="block-handle block-handle-right !z-50 !top-[60%]"
        >
          {!isRightTargetConnected && <div className="handle-dot" />}
        </Handle>
      </div>
    </>
  );
});

NoteBlock.displayName = "NoteBlock";

export default NoteBlock;
