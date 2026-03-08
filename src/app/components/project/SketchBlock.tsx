"use client";

import { memo, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useYjsStrokes } from "./useYjsStrokes";
import * as Y from "yjs";
import { PenTool, Pen, Eraser, Trash2 } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { BlockFooter } from "./BlockFooter";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import { BlockData } from "./CanvasBlock";
import { useYDoc } from "./YDocContext";
import { getStroke } from "perfect-freehand";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";

type SketchBlockProps = NodeProps<Node<BlockData>> & {
  isReadOnly?: boolean;
  yDoc?: Y.Doc;
};

interface Point {
  x: number;
  y: number;
  p: number;
}

interface Stroke {
  points: Point[];
  color: string;
  size: number;
  isEraser: boolean;
}

const COLORS = [
  "#000000",
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ffffff",
];

const STROKE_SIZES = [2, 4, 8, 12, 16];

function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return "";

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y1 + y0) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"],
  );

  d.push("Z");
  return d.join(" ");
}

const SketchBlock = memo((props: SketchBlockProps) => {
  const { id, data, selected } = props;
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

  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#ffffff");
  const [penSize, setPenSize] = useState(4);
  const [eraserSize, setEraserSize] = useState(12);
  const [customEraserInput, setCustomEraserInput] = useState<string>("");
  const [activePopup, setActivePopup] = useState<
    "pen" | "eraser" | "color" | null
  >(null);
  const [title, setTitle] = useState(data.title || "");

  const [currentPoints, setCurrentPoints] = useState<Point[] | null>(null);
  // Use yDoc from context (enterprise pattern)
  const yDoc = useYDoc();
  const userId = currentUser?.id || "";
  const { strokes, addStroke, drafts, setDraft } = useYjsStrokes(yDoc, id);

  let updateMyPresence: ((presence: Partial<unknown>) => void) | undefined =
    undefined;
  try {
    // @ts-expect-error window.ideonUpdateMyPresence is injected at runtime for live cursor updates
    if (typeof window !== "undefined" && window.ideonUpdateMyPresence) {
      // @ts-expect-error window.ideonUpdateMyPresence is injected at runtime for live cursor updates
      updateMyPresence = window.ideonUpdateMyPresence;
    }
  } catch {
    // ignore
  }

  const handleClearSketch = useCallback(() => {
    const yArr = yDoc.getArray<Stroke>(`sketch-strokes-${id}`);
    yArr.delete(0, yArr.length);
    const yDrafts = yDoc.getMap<Stroke>(`sketch-drafts-${id}`);
    yDrafts.clear();
  }, [yDoc, id]);

  const otherDrafts = useMemo(() => {
    return Object.entries(drafts)
      .filter(([clientId]) => clientId !== userId)
      .map(([, draft]) => draft);
  }, [drafts, userId]);

  useEffect(() => {
    if (isReadOnly || !userId) return;
    if (currentPoints && currentPoints.length > 0) {
      setDraft(userId, {
        points: currentPoints,
        color: tool === "eraser" ? "#000000" : color,
        size: tool === "pen" ? penSize : eraserSize,
        isEraser: tool === "eraser",
      });
    } else {
      setDraft(userId, null);
    }
  }, [
    currentPoints,
    isReadOnly,
    userId,
    tool,
    color,
    penSize,
    eraserSize,
    setDraft,
  ]);

  useEffect(() => {
    return () => {
      if (userId) setDraft(userId, null);
    };
  }, [userId, setDraft]);
  const [isLoaded, setIsLoaded] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const svgCanvasRef = useRef<SVGSVGElement | null>(null);
  const lastCursorUpdate = useRef(0);
  const pendingCursorRAF = useRef<number | null>(null);

  const strokesRef = useRef(strokes);
  const currentPointsRef = useRef(currentPoints);

  useEffect(() => {
    strokesRef.current = strokes;
    currentPointsRef.current = currentPoints;
  }, [strokes, currentPoints]);

  useEffect(() => {
    if (!selected) {
      setActivePopup(null);
    }
  }, [selected]);

  useEffect(() => {
    const penSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pen"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`;
    const eraserSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eraser"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`;

    const svgString = tool === "pen" ? penSvg : eraserSvg;
    const hotspot = tool === "pen" ? "2 22" : "12 12";

    const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(
      svgString,
    )}") ${hotspot}, crosshair`;

    if (isReadOnly) {
      canvasContainerRef.current?.style.removeProperty("--sketch-cursor");
      svgCanvasRef.current?.style.removeProperty("--sketch-cursor");
      return;
    }

    canvasContainerRef.current?.style.setProperty("--sketch-cursor", url);
    svgCanvasRef.current?.style.setProperty("--sketch-cursor", url);
  }, [tool, isReadOnly]);

  const stopPropagation = (e: React.SyntheticEvent | Event) => {
    e.stopPropagation();
  };

  const preventDrag = {
    onPointerDown: stopPropagation,
    onMouseDown: stopPropagation,
    onMouseUp: stopPropagation,
    onTouchStart: stopPropagation,
    onTouchEnd: stopPropagation,
  };

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
    canReact,
  });

  const isBeingMoved = !!data.movingUserColor;
  const borderColor = isBeingMoved ? data.movingUserColor : "var(--border)";

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
        JSON.stringify({ strokes }),
        newTitle,
        data.reactions,
      );
    },
    [id, data, currentUser, dict, strokes],
  );

  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title]);

  useEffect(() => {
    if (
      data.metadata &&
      (!isLoaded || isReadOnly || !currentPointsRef.current)
    ) {
      try {
        if (!isLoaded) setIsLoaded(true);
      } catch (e) {
        console.error("Failed to load sketch data", e);
      }
    } else if (!data.metadata && !isLoaded) {
      setIsLoaded(true);
    }
  }, [data.metadata, isLoaded, isReadOnly]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!data.onContentChange) return;
    if (!isReadOnly && currentPointsRef.current) return;
    try {
      const now = new Date().toISOString();
      const editorName =
        currentUser?.displayName ||
        currentUser?.username ||
        dict.project.anonymous;
      data.onContentChange(
        id,
        data.content,
        now,
        editorName,
        JSON.stringify({ strokes }),
        title,
        data.reactions,
      );
    } catch (e) {
      console.error("Failed to save sketch", e);
    }
  }, [JSON.stringify(strokes), title, isReadOnly]);

  const getPointFromEvent = (e: React.PointerEvent<Element>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const el = e.currentTarget;
    const scaleX = rect.width > 0 ? el.clientWidth / rect.width : 1;
    const scaleY = rect.height > 0 ? el.clientHeight / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      p: e.pressure || 0.5,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isReadOnly) return;
    setActivePopup(null); // Close popup when drawing starts
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation(); // Stop ReactFlow panning
    const point = getPointFromEvent(e);
    setCurrentPoints([point]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isReadOnly || !currentPoints) return;
    e.stopPropagation();
    const point = getPointFromEvent(e);
    setCurrentPoints((pts) => [...(pts || []), point]);
    if (updateMyPresence) {
      const now = performance.now();
      if (now - lastCursorUpdate.current < 33) {
        if (pendingCursorRAF.current === null) {
          const svg = svgCanvasRef.current;
          const clientX = e.clientX;
          const clientY = e.clientY;
          pendingCursorRAF.current = requestAnimationFrame(() => {
            pendingCursorRAF.current = null;
            if (performance.now() - lastCursorUpdate.current >= 33) {
              lastCursorUpdate.current = performance.now();
              if (svg) {
                const rect = svg.getBoundingClientRect();
                const x = (clientX - rect.left) / rect.width;
                const y = (clientY - rect.top) / rect.height;
                updateMyPresence({ cursor: { x, y } });
              }
            }
          });
        }
        return;
      }
      lastCursorUpdate.current = now;
      const svg = svgCanvasRef.current;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        updateMyPresence({ cursor: { x, y } });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (updateMyPresence) {
      if (pendingCursorRAF.current !== null) {
        cancelAnimationFrame(pendingCursorRAF.current);
        pendingCursorRAF.current = null;
      }
      updateMyPresence({ cursor: undefined });
    }
    if (isReadOnly || !currentPoints) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    e.stopPropagation();
    addStroke({
      points: currentPoints,
      color: tool === "eraser" ? "#121212" : color,
      size: tool === "pen" ? penSize : eraserSize,
      isEraser: tool === "eraser",
    });
    setCurrentPoints(null);
  };

  const handleApplyCustomEraserSize = () => {
    const parsed = parseInt(customEraserInput, 10);
    if (isNaN(parsed)) return;
    const validSize = Math.max(1, Math.min(100, parsed));
    setEraserSize(validSize);
    setCustomEraserInput("");
    setActivePopup(null);
  };

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

  const edges = getEdges();
  const isHandleConnected = (handleId: string) =>
    edges.some(
      (e) =>
        (e.source === id && e.sourceHandle === handleId) ||
        (e.target === id && e.targetHandle === handleId),
    );

  return (
    <>
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
      <div
        className={`block-card ${selected ? "selected" : ""} ${
          isBeingMoved ? "is-moving" : ""
        } ${isReadOnly ? "read-only" : ""} flex flex-col p-0! select-none`}
        style={{ "--block-border-color": borderColor } as React.CSSProperties}
      >
        <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit]">
          {/* Header */}
          <div className="block-header flex items-center justify-between pt-4 px-4 mb-2 handle-drag-target">
            <div className="flex items-center gap-2">
              <PenTool size={16} />
              <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
                {dict.blocks.blockTypeSketch || "Sketch"}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
              <input
                value={title}
                onChange={handleTitleChange}
                className="block-title"
                placeholder={dict.blocks.title || "..."}
                readOnly={isReadOnly}
              />
            </div>
          </div>

          {!isReadOnly && (
            <div
              className="flex items-center gap-1 px-2 pb-1 border-b border-(--border) nowheel nodrag flex-wrap relative z-50"
              {...preventDrag}
              onClick={stopPropagation}
            >
              {/* Pen Tool */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    stopPropagation(e);
                    if (tool === "pen") {
                      setActivePopup(activePopup === "pen" ? null : "pen");
                    } else {
                      setTool("pen");
                      setActivePopup("pen");
                    }
                  }}
                  {...preventDrag}
                  className={`p-1 rounded-t-sm transition-colors border-b-2 ${
                    tool === "pen"
                      ? "border-(--text-main) text-(--text-main)"
                      : "border-transparent text-(--text-muted) hover:text-(--text-main)"
                  }`}
                  title="Pen"
                >
                  <Pen size={14} />
                </button>
                {activePopup === "pen" && (
                  <div
                    className="absolute top-full left-0 mt-2 p-2 border border-(--border) rounded-lg shadow-xl flex gap-1 z-100 min-w-max pointer-events-auto bg-(--bg-island)"
                    {...preventDrag}
                    onClick={stopPropagation}
                  >
                    {STROKE_SIZES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={(e) => {
                          stopPropagation(e);
                          setPenSize(s);
                          setActivePopup(null);
                        }}
                        {...preventDrag}
                        className="flex items-center justify-center rounded-md transition-colors"
                        style={{
                          width: "32px",
                          height: "32px",
                          backgroundColor:
                            penSize === s ? "var(--border)" : "transparent",
                        }}
                      >
                        <div
                          className="rounded-full"
                          style={{
                            width: Math.max(2, s),
                            height: Math.max(2, s),
                            backgroundColor:
                              penSize === s
                                ? "var(--text-main)"
                                : "var(--text-muted)",
                          }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Eraser Tool */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    stopPropagation(e);
                    if (tool === "eraser") {
                      setActivePopup(
                        activePopup === "eraser" ? null : "eraser",
                      );
                    } else {
                      setTool("eraser");
                      setActivePopup("eraser");
                    }
                  }}
                  {...preventDrag}
                  className={`p-1 rounded-t-sm transition-colors border-b-2 ${
                    tool === "eraser"
                      ? "border-(--text-main) text-(--text-main)"
                      : "border-transparent text-(--text-muted) hover:text-(--text-main)"
                  }`}
                  title="Eraser"
                >
                  <Eraser size={14} />
                </button>
                {activePopup === "eraser" && (
                  <div
                    className="absolute top-full left-0 mt-2 p-2 border border-(--border) rounded-lg shadow-xl flex gap-1 z-100 min-w-max pointer-events-auto bg-(--bg-island)"
                    {...preventDrag}
                    onClick={stopPropagation}
                  >
                    {STROKE_SIZES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={(e) => {
                          stopPropagation(e);
                          setEraserSize(s);
                          setActivePopup(null);
                        }}
                        {...preventDrag}
                        className="flex items-center justify-center rounded-md transition-colors w-8 h-8"
                        style={{
                          backgroundColor:
                            eraserSize === s ? "var(--border)" : "transparent",
                        }}
                      >
                        <div
                          className="rounded-full"
                          style={{
                            width: Math.max(2, s),
                            height: Math.max(2, s),
                            backgroundColor:
                              eraserSize === s
                                ? "var(--text-main)"
                                : "var(--text-muted)",
                            borderRadius: "50%",
                          }}
                        />
                      </button>
                    ))}
                    <div className="w-px h-8 bg-(--border) mx-1" />
                    <input
                      type="number"
                      value={customEraserInput}
                      onChange={(e) => {
                        stopPropagation(e);
                        setCustomEraserInput(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        stopPropagation(e);
                        if (e.key === "Enter") {
                          handleApplyCustomEraserSize();
                        }
                      }}
                      {...preventDrag}
                      placeholder="Custom"
                      className="w-20 px-2 py-1 text-sm rounded border border-(--border) bg-transparent text-(--text-main)"
                      style={{
                        appearance: "textfield",
                      }}
                      min="1"
                      max="50"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        stopPropagation(e);
                        handleApplyCustomEraserSize();
                      }}
                      {...preventDrag}
                      disabled={
                        !customEraserInput ||
                        isNaN(parseInt(customEraserInput, 10))
                      }
                      className="px-2 py-1 text-sm rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: "var(--border)",
                        color: "var(--text-main)",
                      }}
                    >
                      ✓
                    </button>
                  </div>
                )}
              </div>

              <div className="w-px h-4 bg-(--border) mx-1" />

              {/* Color Picker */}
              <div className="relative z-60">
                <button
                  type="button"
                  onClick={(e) => {
                    stopPropagation(e);
                    setActivePopup(activePopup === "color" ? null : "color");
                  }}
                  {...preventDrag}
                  className="p-1 rounded-md transition-colors text-(--text-muted) hover:text-(--text-main) flex items-center gap-1"
                  title="Color"
                >
                  <div
                    className="w-4 h-4 rounded-full border border-(--border)"
                    style={{ backgroundColor: color }}
                  />
                </button>
                {activePopup === "color" && (
                  <div
                    className="absolute top-full left-0 mt-2 p-2 border border-(--border) rounded-lg shadow-xl flex gap-1"
                    {...preventDrag}
                    onClick={stopPropagation}
                    style={{
                      pointerEvents: "auto",
                      backgroundColor: "var(--bg-island)",
                      zIndex: 100,
                    }}
                  >
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={(e) => {
                          stopPropagation(e);
                          setColor(c);
                          setActivePopup(null);
                          setTool("pen");
                        }}
                        {...preventDrag}
                        className={`w-6 h-6 rounded-full border ${
                          color === c
                            ? "border-(--text-main)"
                            : "border-(--border)"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1" />

              {/* Actions */}
              {/* Clear/Trash Button */}
              <button
                type="button"
                onClick={(e) => {
                  stopPropagation(e);
                  handleClearSketch();
                }}
                className="p-1 rounded-t-sm transition-colors border-b-2 border-transparent text-(--text-muted) hover:text-red-500"
                style={{ marginLeft: 4 }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}

          {/* SVG Canvas Area */}
          <div
            ref={canvasContainerRef}
            className={`block-content flex-1 flex flex-col min-h-0 relative nowheel nodrag select-none sketch-cursor`}
            style={{
              touchAction: "none",
              zIndex: 0,
              position: "relative",
              background: "rgba(128, 128, 128, 0.05)",
            }}
          >
            <svg
              ref={svgCanvasRef}
              className="w-full h-full absolute inset-0 touch-none sketch-cursor"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{ zIndex: 10 }}
            >
              <defs>
                {(() => {
                  // 1. Prepare all strokes including current interaction
                  const allStrokes = [...strokes];
                  if (currentPoints) {
                    allStrokes.push({
                      points: currentPoints,
                      color: tool === "eraser" ? "#000000" : color,
                      size: tool === "pen" ? penSize : eraserSize,
                      isEraser: tool === "eraser",
                    });
                  }

                  // 2. Group consecutive strokes by type
                  const groups: {
                    type: "draw" | "erase";
                    strokes: Stroke[];
                    id: string;
                  }[] = [];
                  let currentGroup: {
                    type: "draw" | "erase";
                    strokes: Stroke[];
                    id: string;
                  } | null = null;

                  allStrokes.forEach((stroke, i) => {
                    const type = stroke.isEraser ? "erase" : "draw";
                    if (!currentGroup || currentGroup.type !== type) {
                      currentGroup = {
                        type,
                        strokes: [stroke],
                        id: `group-${i}`,
                      };
                      groups.push(currentGroup);
                    } else {
                      currentGroup.strokes.push(stroke);
                    }
                  });

                  // 3. Generate masks for each "draw" group
                  // A draw group needs a mask that includes all *subsequent* erase groups
                  return groups.map((group, i) => {
                    if (group.type !== "draw") return null;

                    const subsequentErasers = groups
                      .slice(i + 1)
                      .filter((g) => g.type === "erase");
                    if (subsequentErasers.length === 0) return null; // No mask needed

                    const maskId = `mask-${group.id}`;
                    return (
                      <mask key={maskId} id={maskId}>
                        <rect width="100%" height="100%" fill="white" />
                        {subsequentErasers.flatMap((g) =>
                          g.strokes.map((s, j) => (
                            <path
                              key={`${g.id}-${j}`}
                              d={getSvgPathFromStroke(
                                getStroke(s.points, {
                                  size: s.size,
                                  thinning: 0.5,
                                  smoothing: 0.5,
                                  streamline: 0.5,
                                  simulatePressure: true,
                                }),
                              )}
                              fill="black"
                            />
                          )),
                        )}
                      </mask>
                    );
                  });
                })()}
              </defs>

              {/* Render Groups: local + remote drafts (memoized for perf) */}
              {useMemo(() => {
                const allStrokes = [...strokes];
                if (currentPoints) {
                  allStrokes.push({
                    points: currentPoints,
                    color: tool === "eraser" ? "#000000" : color,
                    size: tool === "pen" ? penSize : eraserSize,
                    isEraser: tool === "eraser",
                  });
                }
                if (otherDrafts.length > 0) {
                  allStrokes.push(...otherDrafts);
                }
                const groups: {
                  type: "draw" | "erase";
                  strokes: Stroke[];
                  id: string;
                }[] = [];
                let currentGroup: {
                  type: "draw" | "erase";
                  strokes: Stroke[];
                  id: string;
                } | null = null;
                allStrokes.forEach((stroke, i) => {
                  const type = stroke.isEraser ? "erase" : "draw";
                  if (!currentGroup || currentGroup.type !== type) {
                    currentGroup = {
                      type,
                      strokes: [stroke],
                      id: `group-${i}`,
                    };
                    groups.push(currentGroup);
                  } else {
                    currentGroup.strokes.push(stroke);
                  }
                });
                return groups.map((group, i) => {
                  if (group.type === "erase") return null;
                  const subsequentErasers = groups
                    .slice(i + 1)
                    .filter((g) => g.type === "erase");
                  const maskId =
                    subsequentErasers.length > 0
                      ? `mask-${group.id}`
                      : undefined;
                  return (
                    <g
                      key={group.id}
                      mask={maskId ? `url(#${maskId})` : undefined}
                    >
                      {group.strokes.map((stroke, j) => (
                        <path
                          key={`${group.id}-${j}`}
                          d={getSvgPathFromStroke(
                            getStroke(stroke.points, {
                              size: stroke.size,
                              thinning: 0.5,
                              smoothing: 0.5,
                              streamline: 0.5,
                              simulatePressure: true,
                            }),
                          )}
                          fill={stroke.color}
                        />
                      ))}
                    </g>
                  );
                });
              }, [
                strokes,
                currentPoints,
                tool,
                color,
                penSize,
                eraserSize,
                otherDrafts,
              ])}

              {/* Show eraser preview while drawing */}
              {currentPoints && tool === "eraser" && (
                <path
                  d={getSvgPathFromStroke(
                    getStroke(currentPoints, {
                      size: eraserSize,
                      thinning: 0.5,
                      smoothing: 0.5,
                      streamline: 0.5,
                      simulatePressure: true,
                    }),
                  )}
                  fill="rgba(200, 100, 100, 0.1)"
                  stroke="rgba(200, 100, 100, 0.6)"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                />
              )}
            </svg>
          </div>

          <BlockFooter
            updatedAt={data.updatedAt}
            authorName={data.authorName}
            isLocked={isLocked}
            dict={dict}
            lang={lang}
          />
        </div>

        <Handle
          id="left"
          type="source"
          position={Position.Left}
          isConnectable={true}
          className="block-handle block-handle-left z-50!"
        >
          {!isHandleConnected("left") && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="right"
          type="source"
          position={Position.Right}
          isConnectable={true}
          className="block-handle block-handle-right z-50!"
        >
          {!isHandleConnected("right") && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="top"
          type="source"
          position={Position.Top}
          isConnectable={true}
          className="block-handle block-handle-top z-50!"
        >
          {!isHandleConnected("top") && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="bottom"
          type="source"
          position={Position.Bottom}
          isConnectable={true}
          className="block-handle block-handle-bottom z-50!"
        >
          {!isHandleConnected("bottom") && <div className="handle-dot" />}
        </Handle>
      </div>
      <BlockReactions
        reactions={data.reactions}
        onReact={handleReact}
        onRemoveReaction={handleRemoveReaction}
        currentUserId={currentUser?.id}
        isReadOnly={isReadOnly}
        canReact={canReact}
      />
    </>
  );
});

SketchBlock.displayName = "SketchBlock";

export default SketchBlock;
