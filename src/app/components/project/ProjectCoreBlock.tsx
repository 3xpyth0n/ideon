"use client";

import { memo, useState, useEffect, useCallback, useRef } from "react";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  NodeResizer,
  ResizeParams,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import { useI18n } from "@providers/I18nProvider";
import { BlockData } from "./CanvasBlock";
import MarkdownEditor from "./MarkdownEditor";
import { CORE_BLOCK_WIDTH, CORE_BLOCK_HEIGHT } from "./utils/constants";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";

export type ProjectCoreBlockProps = NodeProps<Node<BlockData, "core">>;

const ProjectCoreBlock = memo(
  ({ data, selected, id }: ProjectCoreBlockProps) => {
    const { dict } = useI18n();
    const { setNodes, getEdges } = useReactFlow();

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

    const [title, setTitle] = useState(data.content || "");
    const [description, setDescription] = useState("");
    const lastDimensions = useRef({
      width: CORE_BLOCK_WIDTH,
      height: CORE_BLOCK_HEIGHT,
    });

    // Sync title and description from data
    useEffect(() => {
      if (data.content !== title) {
        setTitle(data.content || "");
      }

      if (data.metadata) {
        try {
          const meta =
            typeof data.metadata === "string"
              ? JSON.parse(data.metadata)
              : data.metadata;
          if (
            meta.description !== undefined &&
            meta.description !== description
          ) {
            setDescription(meta.description || "");
          }
        } catch (e) {
          console.error("Failed to parse core block metadata", e);
        }
      }
    }, [data.content, data.metadata]);

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

    const handleTitleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTitle = e.target.value;
        setTitle(newTitle);
        syncToYjs(newTitle);

        const meta = { description };
        data.onContentChange?.(
          id,
          newTitle,
          new Date().toISOString(),
          data.lastEditor,
          JSON.stringify(meta),
          undefined,
          data.reactions,
        );
      },
      [id, data.onContentChange, data.lastEditor, description, data.reactions],
    );

    const handleDescriptionChange = useCallback(
      (newDesc: string) => {
        setDescription(newDesc);

        const meta = { description: newDesc };
        data.onContentChange?.(
          id,
          title,
          new Date().toISOString(),
          data.lastEditor,
          JSON.stringify(meta),
          undefined,
          data.reactions,
        );
      },
      [id, data.onContentChange, data.lastEditor, title, data.reactions],
    );

    const edges = getEdges();
    const isHandleConnected = (handleId: string) =>
      edges.some(
        (e) =>
          (e.source === id && e.sourceHandle === handleId) ||
          (e.target === id && e.targetHandle === handleId),
      );

    const isLeftConnected = isHandleConnected("left");
    const isRightConnected = isHandleConnected("right");
    const isTopConnected = isHandleConnected("top");
    const isBottomConnected = isHandleConnected("bottom");

    const nodeCount = useStore((s) => s.nodeLookup.size);
    const placeholder =
      description === "" && nodeCount === 1
        ? dict.canvas.coreBlockPlaceholder
        : dict.blocks.description;

    const handleResize = useCallback(
      (_event: unknown, params: ResizeParams) => {
        const { width, height } = params;
        lastDimensions.current = { width, height };

        setNodes((nodes) =>
          nodes.map((node) => {
            if (node.id === id) {
              return {
                ...node,
                position: {
                  x: -width / 2,
                  y: -height / 2,
                },
                width,
                height,
              };
            }
            return node;
          }),
        );
      },
      [id, setNodes],
    );

    return (
      <>
        <NodeResizer
          isVisible={selected && !isReadOnly}
          minWidth={300}
          minHeight={200}
          handleClassName="core-resizer-handle"
          handleStyle={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            backgroundColor: "transparent",
            border: "none",
            zIndex: 9999,
          }}
          lineStyle={{
            border: "none",
          }}
          onResize={handleResize}
        />
        <div
          className={`core-block relative w-full h-full transition-colors ${
            selected ? "selected" : ""
          } flex flex-col p-12`}
        >
          <div className="flex-1 flex flex-col gap-6 justify-center items-center text-center max-w-2xl mx-auto w-full h-full overflow-hidden">
            <div className="space-y-2 w-full shrink-0">
              <div className="text-tiny uppercase tracking-[0.3em] opacity-30 font-bold mb-4">
                {dict.blocks.blockTypeCore || "Project Core"}
              </div>
              <input
                value={title}
                onChange={handleTitleChange}
                className="core-title-input text-7xl font-black text-center focus:outline-none placeholder:opacity-10 tracking-tighter leading-none bg-transparent w-full nodrag"
                placeholder={dict.blocks.title}
                disabled={isReadOnly}
              />
            </div>

            <div className="w-32 h-px bg-current opacity-20 my-8 shrink-0" />

            <div
              className="relative w-full flex-1 min-h-0 overflow-hidden flex flex-col justify-center cursor-text nodrag"
              onClick={() =>
                document
                  .querySelector(".core-block .ProseMirror")
                  ?.dispatchEvent(new Event("focus"))
              }
            >
              <MarkdownEditor
                content={description}
                onChange={handleDescriptionChange}
                isReadOnly={isReadOnly}
                placeholder={placeholder}
                className="text-center text-xl font-light leading-relaxed [&_p]:text-center [&_p]:w-full"
              />
            </div>
          </div>

          <BlockReactions
            reactions={data.reactions}
            onReact={handleReact}
            onRemoveReaction={handleRemoveReaction}
            currentUserId={currentUser?.id}
            isReadOnly={isReadOnly}
          />

          {/* Handles for connections (2.A) */}
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
          <Handle
            id="top"
            type="source"
            position={Position.Top}
            isConnectable={true}
            className="block-handle block-handle-top !z-50"
          >
            {!isTopConnected && <div className="handle-dot" />}
          </Handle>
          <Handle
            id="bottom"
            type="source"
            position={Position.Bottom}
            isConnectable={true}
            className="block-handle block-handle-bottom !z-50"
          >
            {!isBottomConnected && <div className="handle-dot" />}
          </Handle>
        </div>
      </>
    );
  },
);

ProjectCoreBlock.displayName = "ProjectCoreBlock";

export default ProjectCoreBlock;
