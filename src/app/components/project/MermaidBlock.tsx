"use client";

import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import { Download, Network } from "lucide-react";
import * as Y from "yjs";
import { toast } from "sonner";
import { useI18n } from "@providers/I18nProvider";
import {
  clampBlockContent,
  safeReadYText,
  syncYTextValue,
} from "@lib/projectContentSafety";
import { BlockData } from "./CanvasBlock";
import { BlockFooter } from "./BlockFooter";
import { BlockTitleInput } from "./BlockTitleInput";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import { focusProjectCanvas } from "./utils/focusCanvas";
import { renderMermaid } from "./mermaidRenderer";
import { svgToPngBlob } from "./svgToPngBlob";
import "./mermaid-block.css";

type MermaidBlockProps = NodeProps<Node<BlockData, "mermaid">>;

function createFilename(title: string) {
  const normalized = title
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  return `${normalized || "mermaid-diagram"}.png`;
}

const MermaidBlock = memo(({ id, data, selected }: MermaidBlockProps) => {
  const { dict, lang } = useI18n();
  const { getEdges } = useReactFlow();
  const currentUser = data.currentUser;
  const isProjectOwner =
    currentUser?.id && data.projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && data.ownerId === currentUser.id;
  const isViewer = data.userRole === "viewer";
  const isReadOnly =
    data.isPreviewMode ||
    isViewer ||
    (data.isLocked ? !isOwner && !isProjectOwner : false);
  const canReact = !data.isPreviewMode || isViewer;

  const [source, setSource] = useState(data.content || "");
  const [title, setTitle] = useState(data.title || "");
  const [isEditing, setIsEditing] = useState(
    () => !data.content && !isReadOnly,
  );
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const sourceRef = useRef(source);
  const diagramRef = useRef<HTMLDivElement>(null);
  const renderId = `ideon-mermaid-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    const yText = data.yText;
    if (!yText || isReadOnly) return;

    const observer = (event: Y.YTextEvent) => {
      if (event.transaction.local) return;
      const nextSource = safeReadYText(yText, sourceRef.current);
      sourceRef.current = nextSource;
      setSource(nextSource);
    };

    yText.observe(observer);
    return () => yText.unobserve(observer);
  }, [data.yText, isReadOnly]);

  useEffect(() => {
    const nextSource = safeReadYText(data.yText, data.content || "");
    sourceRef.current = nextSource;
    setSource(nextSource);
  }, [data.content, data.yText]);

  useEffect(() => {
    let isCurrent = true;
    const currentSource = source.trim();

    if (!currentSource) {
      setSvg("");
      setRenderError("");
      setIsRendering(false);
      return () => {
        isCurrent = false;
      };
    }

    setIsRendering(true);
    setSvg("");
    renderMermaid(currentSource, renderId)
      .then(({ svg: nextSvg }) => {
        if (!isCurrent) return;
        setSvg(nextSvg);
        setRenderError("");
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        setSvg("");
        setRenderError(
          error instanceof Error
            ? error.message
            : dict.blocks.mermaidRenderError,
        );
      })
      .finally(() => {
        if (isCurrent) setIsRendering(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [dict.blocks.mermaidRenderError, renderId, source]);

  useEffect(() => {
    setTitle(data.title || "");
  }, [data.title]);

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
    canReact,
  });

  const handleContentChange = useCallback(
    (value: string) => {
      const nextSource = clampBlockContent(value);
      setSource(nextSource);
      sourceRef.current = nextSource;
      syncYTextValue(data.yText, nextSource);
      data.onContentChange?.(
        id,
        nextSource,
        new Date().toISOString(),
        currentUser?.displayName ||
          currentUser?.username ||
          dict.project.anonymous,
        typeof data.metadata === "string"
          ? data.metadata
          : data.metadata
            ? JSON.stringify(data.metadata)
            : undefined,
        title,
        data.reactions,
      );
    },
    [currentUser, data, dict.project.anonymous, id, title],
  );

  const handleTitleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextTitle = event.target.value;
      setTitle(nextTitle);
      data.onContentChange?.(
        id,
        source,
        new Date().toISOString(),
        currentUser?.displayName ||
          currentUser?.username ||
          dict.project.anonymous,
        typeof data.metadata === "string"
          ? data.metadata
          : data.metadata
            ? JSON.stringify(data.metadata)
            : undefined,
        nextTitle,
        data.reactions,
      );
    },
    [currentUser, data, dict.project.anonymous, id, source],
  );

  const handleDownload = useCallback(async () => {
    if (!diagramRef.current) return;

    try {
      const svgElement = diagramRef.current.querySelector(
        ".mermaid-output svg",
      );
      if (!(svgElement instanceof SVGSVGElement)) return;

      const image = await svgToPngBlob(svgElement);
      const imageUrl = URL.createObjectURL(image);
      const anchor = document.createElement("a");
      anchor.download = createFilename(title);
      anchor.href = imageUrl;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
    } catch (error) {
      console.error("Mermaid PNG export failed", error);
      toast.error(dict.blocks.downloadImageFailed);
    }
  }, [dict.blocks.downloadImageFailed, title]);

  const edges = getEdges();
  const isHandleConnected = (handleId: string) =>
    edges.some(
      (edge) =>
        (edge.source === id && edge.sourceHandle === handleId) ||
        (edge.target === id && edge.targetHandle === handleId),
    );

  const handleResize = useCallback(
    (
      _event: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      data.onResize?.(id, {
        width: Math.round(params.width),
        height: Math.round(params.height),
        x: Math.round(params.x),
        y: Math.round(params.y),
      });
    },
    [data, id],
  );

  const handleResizeEnd = useCallback(
    (
      _event: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      data.onResizeEnd?.(id, {
        width: Math.round(params.width),
        height: Math.round(params.height),
        x: Math.round(params.x),
        y: Math.round(params.y),
      });
    },
    [data, id],
  );

  return (
    <>
      <CustomNodeResizer
        isVisible={!isReadOnly}
        minWidth={300}
        minHeight={200}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />
      <div
        className={`block-card block-type-mermaid ${
          selected ? "selected" : ""
        } ${isReadOnly ? "read-only" : ""} flex flex-col p-0! relative`}
      >
        <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
          <div className="flex items-center gap-2">
            <Network size={16} />
            <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
              {dict.blocks.blockTypeMermaid}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-end gap-2 pl-3 min-w-0">
            <BlockTitleInput
              className="block-title nodrag flex-1 min-w-0 mb-0"
              value={title}
              onChange={handleTitleChange}
              onFocus={() => {}}
              onBlur={() => {}}
              placeholder={dict.blocks.title || "..."}
              disabled={isReadOnly}
            />
            <button
              type="button"
              className="mermaid-export-button"
              title={dict.common.export}
              aria-label={dict.common.export}
              onClick={handleDownload}
              disabled={!svg || isEditing}
            >
              <Download size={15} />
            </button>
          </div>
        </div>

        <div className="mermaid-content nodrag nopan nowheel">
          {isEditing && !isReadOnly ? (
            <>
              <textarea
                aria-label={dict.blocks.blockTypeMermaid}
                className="mermaid-editor"
                data-mermaid-editor
                value={source}
                placeholder={dict.blocks.mermaidPlaceholder}
                onChange={(event) => handleContentChange(event.target.value)}
                onWheel={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    focusProjectCanvas();
                  }
                }}
              />
              {renderError && (
                <div className="mermaid-error" role="alert">
                  <p>{dict.blocks.mermaidRenderError}</p>
                  <pre>{renderError}</pre>
                </div>
              )}
            </>
          ) : (
            <div className="mermaid-preview" ref={diagramRef}>
              {isRendering && (
                <div className="mermaid-status" role="status">
                  {dict.blocks.mermaidRendering}
                </div>
              )}
              {renderError ? (
                <div className="mermaid-error" role="alert">
                  <p>{dict.blocks.mermaidRenderError}</p>
                  <pre>{renderError}</pre>
                  <pre className="mermaid-source">{source}</pre>
                </div>
              ) : svg ? (
                <div
                  className="mermaid-output"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ) : null}
            </div>
          )}
        </div>

        <BlockFooter
          updatedAt={data.updatedAt}
          authorName={data.authorName}
          isContentLocked={data.isContentLocked}
          isPositionLocked={data.isPositionLocked}
          dict={dict}
          lang={lang}
        >
          {!isReadOnly && (
            <div className="zen-mode-switch">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  focusProjectCanvas();
                }}
                className={`zen-mode-switch-btn ${isEditing ? "active" : ""}`}
              >
                {dict.common.edit}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className={`zen-mode-switch-btn ${!isEditing ? "active" : ""}`}
              >
                {dict.common.preview}
              </button>
            </div>
          )}
        </BlockFooter>

        <BlockReactions
          reactions={data.reactions}
          onReact={handleReact}
          onRemoveReaction={handleRemoveReaction}
          currentUserId={currentUser?.id}
          isReadOnly={isReadOnly}
          canReact={canReact}
        />

        {(["left", "right", "top", "bottom"] as const).map((handleId) => (
          <Handle
            key={handleId}
            id={handleId}
            type="source"
            position={
              handleId === "left"
                ? Position.Left
                : handleId === "right"
                  ? Position.Right
                  : handleId === "top"
                    ? Position.Top
                    : Position.Bottom
            }
            isConnectable
            className={`block-handle block-handle-${handleId} z-50!`}
          >
            {!isHandleConnected(handleId) && <div className="handle-dot" />}
          </Handle>
        ))}
      </div>
    </>
  );
});

MermaidBlock.displayName = "MermaidBlock";

export default MermaidBlock;
