"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import { PenTool, Pen, Eraser, Undo2, Redo2, Trash2 } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { BlockFooter } from "./BlockFooter";
import {
  Handle,
  Position,
  NodeResizer,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import { BlockData } from "./CanvasBlock";
import { DEFAULT_BLOCK_WIDTH, DEFAULT_BLOCK_HEIGHT } from "./utils/constants";
import { getStroke } from "perfect-freehand";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";

type SketchBlockProps = NodeProps<Node<BlockData>> & {
  isReadOnly?: boolean;
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
  "#000000", // Black
  "#ef4444", // Red
  "#3b82f6", // Blue
  "#22c55e", // Green
  "#eab308", // Yellow
  "#a855f7", // Purple
  "#ffffff", // White
];

const STROKE_SIZES = [2, 4, 8, 12, 16];

// Helper to convert stroke points to SVG path
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

const SketchBlock = memo(({ id, data, selected }: SketchBlockProps) => {
  const { dict, lang } = useI18n();
  const { setNodes, getNode, getEdges } = useReactFlow();

  // State
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#ffffff");
  const [penSize, setPenSize] = useState(4);
  const [eraserSize, setEraserSize] = useState(12);
  const [activePopup, setActivePopup] = useState<
    "pen" | "eraser" | "color" | null
  >(null);
  const [title, setTitle] = useState(data.title || "");

  // Drawing state
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[] | null>(null);
  const [history, setHistory] = useState<Stroke[][]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);

  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const svgCanvasRef = useRef<SVGSVGElement | null>(null);

  // Refs for tracking state without triggering effects
  const strokesRef = useRef(strokes);
  const currentPointsRef = useRef(currentPoints);

  useEffect(() => {
    strokesRef.current = strokes;
    currentPointsRef.current = currentPoints;
  }, [strokes, currentPoints]);

  // Close popup when block is deselected
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

    canvasContainerRef.current?.style.setProperty("--sketch-cursor", url);
    svgCanvasRef.current?.style.setProperty("--sketch-cursor", url);
  }, [tool]);

  // Helper to stop propagation
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

  // Sync title
  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
  }, [data.title]);

  // Initialize from metadata
  useEffect(() => {
    if (data.metadata) {
      try {
        const parsed =
          typeof data.metadata === "string"
            ? JSON.parse(data.metadata)
            : data.metadata;

        let newStrokes: Stroke[] = [];
        if (parsed.strokes) {
          // New format
          newStrokes = parsed.strokes;
        } else if (parsed.paths) {
          // Legacy format conversion (react-sketch-canvas)
          const legacyStrokes: Stroke[] = parsed.paths.map(
            (p: {
              paths: { x: number; y: number }[];
              strokeColor: string;
              strokeWidth: number;
              drawMode: boolean;
            }) => ({
              points: p.paths.map((pt: { x: number; y: number }) => ({
                x: pt.x,
                y: pt.y,
                p: 0.5,
              })),
              color: p.strokeColor,
              size: p.strokeWidth,
              isEraser: p.drawMode === false, // approximation
            }),
          );
          newStrokes = legacyStrokes;
        }

        // Check if content differs
        if (JSON.stringify(newStrokes) !== JSON.stringify(strokesRef.current)) {
          // Update if read-only or not currently drawing
          if (isReadOnly || !currentPointsRef.current) {
            setStrokes(newStrokes);
          }
        }

        if (!isLoaded) setIsLoaded(true);
      } catch (e) {
        console.error("Failed to load sketch data", e);
      }
    } else if (!data.metadata && !isLoaded) {
      setIsLoaded(true);
    }
  }, [data.metadata, isLoaded, isReadOnly]);

  const save = useCallback(
    (newStrokes: Stroke[]) => {
      try {
        const now = new Date().toISOString();
        const editorName =
          currentUser?.displayName ||
          currentUser?.username ||
          dict.project.anonymous;

        data.onContentChange?.(
          id,
          data.content,
          now,
          editorName,
          JSON.stringify({ strokes: newStrokes }),
          title,
          data.reactions,
        );
      } catch (e) {
        console.error("Failed to save sketch", e);
      }
    },
    [data, id, currentUser, dict, title],
  );

  const triggerSave = useCallback(
    (newStrokes: Stroke[]) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        save(newStrokes);
      }, 1000);
    },
    [save],
  );

  // Helper to get consistent coordinates regardless of zoom level
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

  // Interaction Handlers
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
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isReadOnly || !currentPoints) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    e.stopPropagation();

    const newStroke: Stroke = {
      points: currentPoints,
      color: tool === "eraser" ? "#121212" : color,
      size: tool === "pen" ? penSize : eraserSize,
      isEraser: tool === "eraser",
    };

    const newStrokes = [...strokes, newStroke];

    // History
    setHistory((prev) => [...prev, strokes]);
    setRedoStack([]); // Clear redo

    setStrokes(newStrokes);
    setCurrentPoints(null);
    triggerSave(newStrokes);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    const newHistory = history.slice(0, -1);

    setRedoStack((prev) => [strokes, ...prev]);
    setHistory(newHistory);
    setStrokes(previous);
    triggerSave(previous);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    const newRedoStack = redoStack.slice(1);

    setHistory((prev) => [...prev, strokes]);
    setRedoStack(newRedoStack);
    setStrokes(next);
    triggerSave(next);
  };

  const handleClear = () => {
    setHistory((prev) => [...prev, strokes]);
    setStrokes([]);
    triggerSave([]);
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

      if (snapW && Math.abs(x - currentBlock.position.x) > 0.1)
        finalX = Math.round(x + width - DEFAULT_BLOCK_WIDTH);
      if (snapH && Math.abs(y - currentBlock.position.y) > 0.1)
        finalY = Math.round(y + height - DEFAULT_BLOCK_HEIGHT);

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
  const isHandleConnected = (handleId: string) =>
    edges.some(
      (e) =>
        (e.source === id && e.sourceHandle === handleId) ||
        (e.target === id && e.targetHandle === handleId),
    );

  return (
    <>
      <NodeResizer
        minWidth={300}
        minHeight={200}
        isVisible={selected && !isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />
      <div
        className={`block-card ${selected ? "selected" : ""} ${
          isBeingMoved ? "is-moving" : ""
        } ${isReadOnly ? "read-only" : ""} flex flex-col !p-0 select-none`}
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
            <div className="flex items-center gap-2">
              <input
                value={title}
                onChange={handleTitleChange}
                className="block-title"
                placeholder="..."
                readOnly={isReadOnly}
              />
            </div>
          </div>

          {!isReadOnly && (
            <div
              className="flex items-center gap-1 px-2 pb-1 border-b border-[var(--border)] nowheel nodrag flex-wrap relative z-50"
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
                      ? "border-[var(--text-main)] text-[var(--text-main)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                  title="Pen"
                >
                  <Pen size={14} />
                </button>
                {activePopup === "pen" && (
                  <div
                    className="absolute top-full left-0 mt-2 p-2 border border-[var(--border)] rounded-lg shadow-xl flex gap-1 z-[100] min-w-max pointer-events-auto bg-[var(--bg-island)]"
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
                      ? "border-[var(--text-main)] text-[var(--text-main)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                  title="Eraser"
                >
                  <Eraser size={14} />
                </button>
                {activePopup === "eraser" && (
                  <div
                    className="absolute top-full left-0 mt-2 p-2 border border-[var(--border)] rounded-lg shadow-xl flex gap-1 z-[100] min-w-max pointer-events-auto bg-[var(--bg-island)]"
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
                  </div>
                )}
              </div>

              <div className="w-px h-4 bg-[var(--border)] mx-1" />

              {/* Color Picker */}
              <div className="relative z-[60]">
                <button
                  type="button"
                  onClick={(e) => {
                    stopPropagation(e);
                    setActivePopup(activePopup === "color" ? null : "color");
                  }}
                  {...preventDrag}
                  className="p-1 rounded-md transition-colors text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-1"
                  title="Color"
                >
                  <div
                    className="w-4 h-4 rounded-full border border-[var(--border)]"
                    style={{ backgroundColor: color }}
                  />
                </button>
                {activePopup === "color" && (
                  <div
                    className="absolute top-full left-0 mt-2 p-2 border border-[var(--border)] rounded-lg shadow-xl flex gap-1"
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
                            ? "border-[var(--text-main)]"
                            : "border-[var(--border)]"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1" />

              {/* Actions */}
              <button
                onClick={(e) => {
                  handleUndo();
                  stopPropagation(e);
                }}
                {...preventDrag}
                disabled={history.length === 0}
                className={`p-1 rounded-md transition-all duration-200 ${
                  history.length === 0
                    ? "text-[var(--text-muted)] cursor-not-allowed opacity-30"
                    : "text-[var(--text-main)] hover:text-[var(--text-main)] hover:bg-[var(--border)] opacity-100"
                }`}
                title="Undo"
              >
                <Undo2 size={14} />
              </button>
              <button
                onClick={(e) => {
                  handleRedo();
                  stopPropagation(e);
                }}
                {...preventDrag}
                disabled={redoStack.length === 0}
                className={`p-1 rounded-md transition-all duration-200 ${
                  redoStack.length === 0
                    ? "text-[var(--text-muted)] cursor-not-allowed opacity-30"
                    : "text-[var(--text-main)] hover:text-[var(--text-main)] hover:bg-[var(--border)] opacity-100"
                }`}
                title="Redo"
              >
                <Redo2 size={14} />
              </button>
              <button
                onClick={(e) => {
                  handleClear();
                  stopPropagation(e);
                }}
                {...preventDrag}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-red-400"
                title="Clear"
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

              {/* Render Groups */}
              {(() => {
                const allStrokes = [...strokes];
                if (currentPoints) {
                  allStrokes.push({
                    points: currentPoints,
                    color: tool === "eraser" ? "#000000" : color,
                    size: tool === "pen" ? penSize : eraserSize,
                    isEraser: tool === "eraser",
                  });
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
                  if (group.type === "erase") return null; // Erasers are only used in masks

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
              })()}
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
          className="block-handle block-handle-left !z-50"
        >
          {!isHandleConnected("left") && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="right"
          type="source"
          position={Position.Right}
          isConnectable={true}
          className="block-handle block-handle-right !z-50"
        >
          {!isHandleConnected("right") && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="top"
          type="source"
          position={Position.Top}
          isConnectable={true}
          className="block-handle block-handle-top !z-50"
        >
          {!isHandleConnected("top") && <div className="handle-dot" />}
        </Handle>
        <Handle
          id="bottom"
          type="source"
          position={Position.Bottom}
          isConnectable={true}
          className="block-handle block-handle-bottom !z-50"
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
      />
    </>
  );
});

SketchBlock.displayName = "SketchBlock";

export default SketchBlock;
