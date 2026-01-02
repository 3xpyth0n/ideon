"use client";

import { memo, useState, useEffect, useCallback, useRef } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { useI18n } from "@providers/I18nProvider";
import { BlockData } from "./CanvasBlock";

export type ProjectCoreBlockProps = NodeProps<Node<BlockData, "core">>;

const ProjectCoreBlock = memo(
  ({ data, selected, id }: ProjectCoreBlockProps) => {
    const { dict } = useI18n();
    const [title, setTitle] = useState(data.content || "");
    const [description, setDescription] = useState("");
    const descriptionRef = useRef<HTMLTextAreaElement>(null);
    const CHAR_LIMIT = 1000;

    // Auto-expand description field
    useEffect(() => {
      if (descriptionRef.current) {
        descriptionRef.current.style.height = "auto";
        descriptionRef.current.style.height = `${descriptionRef.current.scrollHeight}px`;
      }
    }, [description]);

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
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newDesc = e.target.value;
        if (newDesc.length > CHAR_LIMIT) return;

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

    return (
      <div
        className={`core-block relative w-full transition-colors ${
          selected ? "selected" : ""
        } flex flex-col p-12`}
      >
        <div className="flex-1 flex flex-col gap-6 justify-center items-center text-center max-w-2xl mx-auto w-full">
          <div className="space-y-2 w-full">
            <div className="text-tiny uppercase tracking-[0.3em] opacity-30 font-bold mb-4">
              {dict.common.blockTypeCore || "Project Core"}
            </div>
            <input
              value={title}
              onChange={handleTitleChange}
              className="core-title-input text-7xl font-black text-center focus:outline-none placeholder:opacity-10 tracking-tighter leading-none"
              placeholder={dict.common.title}
              disabled={data.isPreviewMode}
            />
          </div>

          <div className="w-32 h-px bg-current opacity-20 my-8" />

          <div className="relative w-full">
            <textarea
              ref={descriptionRef}
              value={description}
              onChange={handleDescriptionChange}
              className="core-description-input text-xl text-center focus:outline-none resize-none placeholder:opacity-20 leading-relaxed font-light italic overflow-hidden"
              placeholder={dict.common.description}
              disabled={data.isPreviewMode}
            />

            {description.length > 0 && (
              <div className="absolute -bottom-6 right-0 text-[10px] font-bold uppercase tracking-widest opacity-20">
                {description.length} / {CHAR_LIMIT}
              </div>
            )}
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
    );
  },
);

ProjectCoreBlock.displayName = "ProjectCoreBlock";

export default ProjectCoreBlock;
