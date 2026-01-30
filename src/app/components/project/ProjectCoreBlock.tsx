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
} from "@xyflow/react";
import { useI18n } from "@providers/I18nProvider";
import { BlockData } from "./CanvasBlock";
import MarkdownEditor from "./MarkdownEditor";
import { CORE_BLOCK_WIDTH, CORE_BLOCK_HEIGHT } from "./utils/constants";

export type ProjectCoreBlockProps = NodeProps<Node<BlockData, "core">>;

const ProjectCoreBlock = memo(
  ({ data, selected, id }: ProjectCoreBlockProps) => {
    const { dict } = useI18n();
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

    const handleTitleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTitle = e.target.value;
        setTitle(newTitle);

        const meta = { description };
        data.onContentChange?.(
          id,
          newTitle,
          new Date().toISOString(),
          data.lastEditor,
          JSON.stringify(meta),
        );
      },
      [id, data.onContentChange, data.lastEditor, description],
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
        );
      },
      [id, data.onContentChange, data.lastEditor, title],
    );

    const { setNodes } = useReactFlow();

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
          isVisible={selected && !data.isPreviewMode}
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
          style={{ boxSizing: "border-box" }}
        >
          <div className="flex-1 flex flex-col gap-6 justify-center items-center text-center max-w-2xl mx-auto w-full h-full overflow-hidden">
            <div className="space-y-2 w-full shrink-0">
              <div className="text-tiny uppercase tracking-[0.3em] opacity-30 font-bold mb-4">
                {dict.common.blockTypeCore || "Project Core"}
              </div>
              <input
                value={title}
                onChange={handleTitleChange}
                className="core-title-input text-7xl font-black text-center focus:outline-none placeholder:opacity-10 tracking-tighter leading-none bg-transparent w-full nodrag"
                placeholder={dict.common.title}
                disabled={data.isPreviewMode}
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
                isReadOnly={data.isPreviewMode}
                placeholder={dict.common.description}
                className="text-center text-xl font-light leading-relaxed [&_p]:text-center [&_p]:w-full"
              />
            </div>
          </div>

          {/* Handles for connections (2.A) */}
          <Handle
            id="left"
            type="source"
            position={Position.Left}
            isConnectable={true}
            className="block-handle block-handle-left !z-50"
          />
          <Handle
            id="right"
            type="source"
            position={Position.Right}
            isConnectable={true}
            className="block-handle block-handle-right !z-50"
          />
        </div>
      </>
    );
  },
);

ProjectCoreBlock.displayName = "ProjectCoreBlock";

export default ProjectCoreBlock;
