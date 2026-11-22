"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import { Download, Loader2, TriangleAlert, Workflow } from "lucide-react";
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
import { PLANTUML_NOT_CONFIGURED } from "@lib/plantuml-shared";
import "./plantuml-block.css";

type PlantUMLBlockProps = NodeProps<Node<BlockData, "plantuml">>;

const RENDER_DEBOUNCE_MS = 600;
const ERROR_CONTEXT_LINES = 2;

interface RenderError {
  detail: string;
  line: number | null;
}

function getErrorContext(source: string, line: number) {
  const lines = source.split("\n");
  const start = Math.max(1, line - ERROR_CONTEXT_LINES);
  const end = Math.min(lines.length, line + ERROR_CONTEXT_LINES);
  const rows: { number: number; text: string }[] = [];
  for (let number = start; number <= end; number++) {
    rows.push({ number, text: lines[number - 1] });
  }
  return rows;
}

function createFilename(title: string) {
  const normalized = title
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  return `${normalized || "plantuml-diagram"}.png`;
}

const PlantUMLBlock = memo(({ id, data, selected }: PlantUMLBlockProps) => {
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

  const formatErrorDetail = (error: RenderError) => {
    const location =
      error.line !== null
        ? ` (${dict.blocks.plantumlErrorLine} ${error.line})`
        : "";
    return `${dict.blocks.plantumlErrorLabel} ${
      error.detail || dict.blocks.plantumlRenderError
    }${location}`;
  };

  const [source, setSource] = useState(data.content || "");
  const [title, setTitle] = useState(data.title || "");
  const [isEditing, setIsEditing] = useState(
    () => !data.content && !isReadOnly,
  );
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState<RenderError | null>(null);
  const [isNotConfigured, setIsNotConfigured] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const sourceRef = useRef(source);
  const diagramRef = useRef<HTMLDivElement>(null);

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
    const currentSource = source.trim();

    if (!currentSource) {
      setSvg("");
      setRenderError(null);
      setIsNotConfigured(false);
      setIsRendering(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsRendering(true);
      fetch("/api/plantuml/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: currentSource }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as {
            svg?: string;
            error?: string;
            detail?: string;
            line?: number | null;
          };
          if (controller.signal.aborted) return;
          if (!response.ok || !payload.svg) {
            setSvg("");
            setIsNotConfigured(payload.error === PLANTUML_NOT_CONFIGURED);
            setRenderError(
              payload.error === PLANTUML_NOT_CONFIGURED
                ? null
                : {
                    detail:
                      payload.detail ||
                      payload.error ||
                      `HTTP ${response.status}`,
                    line:
                      typeof payload.line === "number" ? payload.line : null,
                  },
            );
            return;
          }
          setIsNotConfigured(false);
          setRenderError(null);
          setSvg(payload.svg);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setSvg("");
          setIsNotConfigured(false);
          setRenderError({ detail: "", line: null });
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsRendering(false);
        });
    }, RENDER_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source]);

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
    const image = diagramRef.current?.querySelector(".plantuml-output img");
    if (!(image instanceof HTMLImageElement)) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth * 2;
      canvas.height = image.naturalHeight * 2;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is not available");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result ? resolve(result) : reject(new Error("PNG export failed")),
          "image/png",
        ),
      );
      const imageUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.download = createFilename(title);
      anchor.href = imageUrl;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
    } catch (error) {
      console.error("PlantUML PNG export failed", error);
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
        className={`block-card block-type-plantuml ${
          selected ? "selected" : ""
        } ${isReadOnly ? "read-only" : ""} flex flex-col p-0! relative`}
      >
        <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
          <div className="flex items-center gap-2">
            <Workflow size={16} />
            <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
              {dict.blocks.blockTypePlantUML}
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
              className="plantuml-export-button"
              title={dict.blocks.export}
              aria-label={dict.blocks.export}
              onClick={handleDownload}
              disabled={!svg || isEditing}
            >
              <Download size={15} />
            </button>
          </div>
        </div>

        <div className="plantuml-content nodrag nopan nowheel">
          {isEditing && !isReadOnly ? (
            <>
              <textarea
                aria-label={dict.blocks.blockTypePlantUML}
                className="plantuml-editor"
                data-plantuml-editor
                value={source}
                placeholder={dict.blocks.plantumlPlaceholder}
                onChange={(event) => handleContentChange(event.target.value)}
                onWheel={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    focusProjectCanvas();
                  }
                }}
              />
              {isNotConfigured && (
                <div className="plantuml-inline-message" role="status">
                  <TriangleAlert size={14} />
                  <span>{dict.blocks.plantumlNotConfigured}</span>
                </div>
              )}
              {renderError && (
                <div
                  className="plantuml-inline-message plantuml-inline-error"
                  role="alert"
                >
                  <TriangleAlert size={14} />
                  <span>{formatErrorDetail(renderError)}</span>
                </div>
              )}
            </>
          ) : (
            <div className="plantuml-preview" ref={diagramRef}>
              {isNotConfigured ? (
                <div className="plantuml-state" role="status">
                  <TriangleAlert size={28} />
                  <p className="plantuml-state-title">
                    {dict.blocks.plantumlNotConfigured}
                  </p>
                </div>
              ) : renderError ? (
                <div
                  className="plantuml-state plantuml-state-error"
                  role="alert"
                >
                  <TriangleAlert size={28} />
                  <p className="plantuml-state-title">
                    {dict.blocks.plantumlRenderError}
                  </p>
                  {renderError.detail && (
                    <p className="plantuml-state-detail">
                      {formatErrorDetail(renderError)}
                    </p>
                  )}
                  {renderError.line !== null && (
                    <div className="plantuml-source">
                      {getErrorContext(source, renderError.line).map((row) => (
                        <div
                          key={row.number}
                          className={`plantuml-source-line ${
                            row.number === renderError.line
                              ? "plantuml-source-line-active"
                              : ""
                          }`}
                        >
                          <span className="plantuml-source-number">
                            {row.number}
                          </span>
                          <span>{row.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : svg ? (
                <div className="plantuml-output">
                  <img
                    alt={title || dict.blocks.blockTypePlantUML}
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(
                      svg,
                    )}`}
                  />
                </div>
              ) : isRendering ? (
                <div className="plantuml-state" role="status">
                  <Loader2 size={28} className="animate-spin" />
                  <p className="plantuml-state-title">
                    {dict.blocks.plantumlRendering}
                  </p>
                </div>
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

PlantUMLBlock.displayName = "PlantUMLBlock";

export default PlantUMLBlock;
