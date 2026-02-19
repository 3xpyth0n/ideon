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
import { FileText } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { BlockData } from "./CanvasBlock";
import MarkdownEditor from "./MarkdownEditor";
import { BlockFooter } from "./BlockFooter";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";

type NoteBlockProps = NodeProps<Node<BlockData, "text">>;

const NoteBlock = memo(({ data, selected, id }: NoteBlockProps) => {
  const { dict, lang } = useI18n();
  const { getEdges } = useReactFlow();

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const isPreviewMode = data.isPreviewMode;
  const isLocked = data.isLocked;

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;
  const isReadOnly =
    isPreviewMode || (isLocked ? !isOwner && !isProjectOwner : false);

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
  });

  const [title, setTitle] = useState(data.title || "");

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
      const now = new Date().toISOString();
      const editor =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;

      data.onContentChange?.(
        id,
        data.content || "",
        now,
        editor,
        data.metadata ? JSON.stringify(data.metadata) : undefined,
        newTitle,
        data.reactions,
      );
    },
    [id, data, currentUser, dict],
  );

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
        data.reactions,
      );
    },
    [
      id,
      data.onContentChange,
      data.lastEditor,
      data.metadata,
      title,
      syncToYjs,
    ],
  );

  return (
    <>
      <NodeResizer
        isVisible={selected && !data.isPreviewMode}
        minWidth={200}
        minHeight={180}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
      />
      <div
        className={`block-card block-type-note ${
          selected ? "selected" : ""
        } flex flex-col !p-0`}
      >
        <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit]">
          <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
            <div className="flex items-center gap-2">
              <FileText size={16} />
              <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
                {dict.blocks.blockTypeText || "Note"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={title}
                onChange={handleTitleChange}
                className="block-title"
                placeholder={dict.blocks.title || "..."}
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

          <BlockFooter
            updatedAt={data.updatedAt}
            authorName={data.authorName}
            isLocked={data.isLocked}
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
        />

        {/* Handles for connections - Left Side */}
        <Handle
          id="left"
          type="source"
          position={Position.Left}
          isConnectable={true}
          className="block-handle block-handle-left !z-50"
        >
          {!isLeftSourceConnected && <div className="handle-dot" />}
        </Handle>

        {/* Handles for connections - Right Side */}
        <Handle
          id="right"
          type="source"
          position={Position.Right}
          isConnectable={true}
          className="block-handle block-handle-right !z-50"
        >
          {!isRightSourceConnected && <div className="handle-dot" />}
        </Handle>

        {/* Handles for connections - Top Side */}
        <Handle
          id="top"
          type="source"
          position={Position.Top}
          isConnectable={true}
          className="block-handle block-handle-top !z-50"
        >
          {!isTopSourceConnected && <div className="handle-dot" />}
        </Handle>

        {/* Handles for connections - Bottom Side */}
        <Handle
          id="bottom"
          type="source"
          position={Position.Bottom}
          isConnectable={true}
          className="block-handle block-handle-bottom !z-50"
        >
          {!isBottomSourceConnected && <div className="handle-dot" />}
        </Handle>
      </div>
    </>
  );
});

NoteBlock.displayName = "NoteBlock";

export default NoteBlock;
