"use client";

import { memo, useCallback, useState, useEffect, useRef, useMemo } from "react";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import { Sigma } from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
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
import {
  resolveNoteModeShortcutAction,
  shouldStartNoteInEditMode,
  type NoteModeShortcutHandler,
} from "./utils/interaction";
import dynamic from "next/dynamic";
import {
  AutomationStateBadge,
  AUTOMATION_STATE_BORDER_COLORS,
} from "./AutomationStateBadge";
import {
  useBlockAutomationState,
  useResetBlockAutomationState,
} from "./AutomationStatesContext";

const VimEditor = dynamic(() => import("./VimEditor"), { ssr: false });

type LatexBlockProps = NodeProps<Node<BlockData, "latex">>;

const SPLIT_REGEX = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g;

function LatexRenderer({ content }: { content: string }) {
  const segments = content.split(SPLIT_REGEX);
  return (
    <div className="latex-preview h-full overflow-y-auto px-4 py-2 leading-loose">
      {segments.map((seg, i) => {
        if (seg.startsWith("$$") && seg.endsWith("$$")) {
          try {
            return (
              <span
                key={i}
                className="block my-2 text-center"
                dangerouslySetInnerHTML={{
                  __html: katex.renderToString(seg.slice(2, -2), {
                    displayMode: true,
                    throwOnError: true,
                  }),
                }}
              />
            );
          } catch {
            return (
              <code key={i} className="text-red-400 text-sm break-all">
                {seg}
              </code>
            );
          }
        }
        if (seg.startsWith("$") && seg.endsWith("$")) {
          try {
            return (
              <span
                key={i}
                dangerouslySetInnerHTML={{
                  __html: katex.renderToString(seg.slice(1, -1), {
                    displayMode: false,
                    throwOnError: true,
                  }),
                }}
              />
            );
          } catch {
            return (
              <code key={i} className="text-red-400 text-sm">
                {seg}
              </code>
            );
          }
        }
        return <span key={i}>{seg}</span>;
      })}
    </div>
  );
}

const LatexBlock = memo(({ data, selected, id }: LatexBlockProps) => {
  const { dict, lang } = useI18n();
  const { getEdges } = useReactFlow();

  const currentUser = data.currentUser;
  const projectOwnerId = data.projectOwnerId;
  const ownerId = data.ownerId;
  const isPreviewMode = data.isPreviewMode;
  const isLocked = data.isLocked;

  const isProjectOwner = currentUser?.id && projectOwnerId === currentUser.id;
  const isOwner = currentUser?.id && ownerId === currentUser.id;
  const isViewer = data.userRole === "viewer";

  const VALID_AUTOMATION_STATES = [
    "processing",
    "success",
    "warning",
    "error",
  ] as const;
  type ActiveAutomationState = (typeof VALID_AUTOMATION_STATES)[number];
  const automationStateEntry = useBlockAutomationState(id);
  const resetBlockState = useResetBlockAutomationState();
  const isDecayed =
    automationStateEntry?.decayAt !== undefined &&
    Date.now() > automationStateEntry.decayAt;
  const automationState: ActiveAutomationState | null =
    !isDecayed &&
    automationStateEntry?.state &&
    (VALID_AUTOMATION_STATES as readonly string[]).includes(
      automationStateEntry.state,
    )
      ? (automationStateEntry.state as ActiveAutomationState)
      : null;

  const isReadOnly =
    isPreviewMode ||
    isViewer ||
    (isLocked ? !isOwner && !isProjectOwner : false);
  const canReact = !isPreviewMode || isViewer;

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
    canReact,
  });

  const [isEditing, setIsEditing] = useState(() =>
    shouldStartNoteInEditMode(data.content, isReadOnly),
  );
  const [title, setTitle] = useState(data.title || "");
  const [localContent, setLocalContent] = useState(data.content || "");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (document.activeElement !== textareaRef.current) {
      setLocalContent(data.content || "");
    }
  }, [data.content]);

  const focusEditor = useCallback(() => {
    if (isReadOnly || !isEditing) return;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [isEditing, isReadOnly]);

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

  const latexVimExtensions = useMemo(() => [], []);

  const lastSyncedTextRef = useRef<string | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onContentChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingContentRef = useRef<string | null>(null);
  const pendingTitleRef = useRef<string | null>(null);
  const onTitleChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const dataRef = useRef(data);
  const titleRef = useRef(title);

  const syncToYjs = useCallback(
    (text: string) => {
      if (!data.yText) return;

      const nextText = clampBlockContent(text);
      if (lastSyncedTextRef.current === nextText) return;
      lastSyncedTextRef.current = nextText;

      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      syncTimeoutRef.current = setTimeout(() => {
        syncTimeoutRef.current = null;
        if (!data.yText) return;

        const currentText = safeReadYText(data.yText, data.content ?? "");
        if (currentText === nextText) {
          return;
        }

        syncYTextValue(data.yText, nextText);
      }, 500);
    },
    [data.content, data.yText],
  );

  useEffect(() => {
    dataRef.current = data;
  });

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      if (onContentChangeTimerRef.current)
        clearTimeout(onContentChangeTimerRef.current);
      if (onTitleChangeTimerRef.current)
        clearTimeout(onTitleChangeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setTitle(data.title || "");
  }, [data.title]);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);

      pendingTitleRef.current = newTitle;
      if (onTitleChangeTimerRef.current)
        clearTimeout(onTitleChangeTimerRef.current);
      onTitleChangeTimerRef.current = setTimeout(() => {
        onTitleChangeTimerRef.current = null;
        const latestTitle = pendingTitleRef.current;
        if (latestTitle === null) return;
        pendingTitleRef.current = null;
        const d = dataRef.current;
        d.onContentChange?.(
          id,
          clampBlockContent(d.content || ""),
          new Date().toISOString(),
          currentUser?.displayName ||
            currentUser?.username ||
            dict.project.anonymous,
          d.metadata ? JSON.stringify(d.metadata) : undefined,
          latestTitle,
          d.reactions,
        );
      }, 150);
    },
    [id, currentUser, dict],
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      const safeContent = clampBlockContent(newContent);
      const currentBlockContent = data.content ?? "";

      if (safeContent === currentBlockContent) {
        return;
      }

      const currentYContent = safeReadYText(data.yText, currentBlockContent);
      if (safeContent === currentYContent) {
        lastSyncedTextRef.current = safeContent;
        return;
      }

      syncToYjs(safeContent);

      pendingContentRef.current = safeContent;
      if (onContentChangeTimerRef.current)
        clearTimeout(onContentChangeTimerRef.current);
      onContentChangeTimerRef.current = setTimeout(() => {
        onContentChangeTimerRef.current = null;
        const latestContent = pendingContentRef.current;
        if (latestContent === null) return;
        pendingContentRef.current = null;
        const d = dataRef.current;
        d.onContentChange?.(
          id,
          latestContent,
          new Date().toISOString(),
          d.lastEditor,
          d.metadata ? JSON.stringify(d.metadata) : undefined,
          titleRef.current,
          d.reactions,
        );
      }, 150);
    },
    [id, data.content, data.yText, syncToYjs],
  );

  const handleVimChange = useCallback(
    (value: string) => {
      const safeContent = clampBlockContent(value);
      const currentBlockContent = data.content ?? "";

      if (safeContent === currentBlockContent) {
        return;
      }

      const currentYContent = safeReadYText(data.yText, currentBlockContent);
      if (safeContent === currentYContent) {
        lastSyncedTextRef.current = safeContent;
        return;
      }

      syncToYjs(safeContent);

      pendingContentRef.current = safeContent;
      if (onContentChangeTimerRef.current)
        clearTimeout(onContentChangeTimerRef.current);
      onContentChangeTimerRef.current = setTimeout(() => {
        onContentChangeTimerRef.current = null;
        const latestContent = pendingContentRef.current;
        if (latestContent === null) return;
        pendingContentRef.current = null;
        const d = dataRef.current;
        d.onContentChange?.(
          id,
          latestContent,
          new Date().toISOString(),
          d.lastEditor,
          d.metadata ? JSON.stringify(d.metadata) : undefined,
          titleRef.current,
          d.reactions,
        );
      }, 150);
    },
    [id, data.content, data.yText, syncToYjs],
  );

  const handleResize = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const { width, height, x, y } = params;
      data.onResize?.(id, {
        width: Math.round(width),
        height: Math.round(height),
        x: Math.round(x),
        y: Math.round(y),
      });
    },
    [id, data],
  );

  const handleResizeEnd = useCallback(
    (
      _evt: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const { width, height, x, y } = params;
      data.onResizeEnd?.(id, {
        width: Math.round(width),
        height: Math.round(height),
        x: Math.round(x),
        y: Math.round(y),
      });
    },
    [id, data],
  );

  const handleNoteModeShortcut = useCallback<NoteModeShortcutHandler>(
    (key) => {
      const action = resolveNoteModeShortcutAction({
        key,
        isEditing,
        isReadOnly,
        vimMode: !!currentUser?.vimMode,
        hasRichTextEditor: false,
      });

      switch (action) {
        case "switchToPreview":
          setIsEditing(false);
          return "handled";
        case "switchToEdit":
          setIsEditing(true);
          focusEditor();
          return "handled";
        case "noop":
          return "handled";
        case "passThrough":
        default:
          return "passThrough";
      }
    },
    [currentUser?.vimMode, isEditing, isReadOnly, focusEditor],
  );

  useEffect(() => {
    data.registerNoteModeShortcutHandler?.(id, handleNoteModeShortcut);

    return () => {
      data.registerNoteModeShortcutHandler?.(id, null);
    };
  }, [data.registerNoteModeShortcutHandler, handleNoteModeShortcut, id]);

  const handleEditorPreviewShortcut = useCallback(() => {
    handleNoteModeShortcut("p");
  }, [handleNoteModeShortcut]);

  return (
    <>
      <CustomNodeResizer
        isVisible={!isReadOnly}
        minWidth={200}
        minHeight={180}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />
      <div
        className={`block-card block-type-latex ${selected ? "selected" : ""} ${
          isReadOnly ? "read-only" : ""
        } flex flex-col p-0! relative`}
        style={
          automationState
            ? ({
                borderColor: AUTOMATION_STATE_BORDER_COLORS[automationState],
              } as React.CSSProperties)
            : undefined
        }
        onMouseDown={(event) => {
          if (isReadOnly || !isEditing) return;

          const target = event.target as HTMLElement;
          if (
            target.closest(
              "button, input, textarea, select, a, [contenteditable='true']",
            )
          ) {
            return;
          }

          focusEditor();
        }}
      >
        <div className="w-full h-full flex flex-col rounded-[inherit]">
          <div className="block-header flex items-center justify-between pt-4 px-4 mb-2">
            <div className="flex items-center gap-2">
              <Sigma size={16} />
              <span className="text-sm uppercase tracking-wider opacity-50 font-bold">
                {dict.blocks.blockTypeLatex || "LaTeX"}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
              {automationState && (
                <AutomationStateBadge
                  state={automationState}
                  customLabel={automationStateEntry?.label ?? null}
                  onReset={isReadOnly ? undefined : () => resetBlockState(id)}
                />
              )}
              <BlockTitleInput
                value={title}
                onChange={handleTitleChange}
                onFocus={() => {}}
                onBlur={() => {}}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    (e.target as HTMLElement)?.blur?.();
                    focusProjectCanvas();
                  }
                }}
                placeholder={dict.blocks.title || "..."}
                disabled={isReadOnly}
              />
            </div>
          </div>

          <div
            className="flex-1 min-h-0 overflow-hidden nodrag nopan nowheel"
            onContextMenu={(e) => e.preventDefault()}
            onWheel={(e) => e.stopPropagation()}
            onMouseDown={(event) => {
              if (isEditing && !isReadOnly) event.stopPropagation();
              const target = event.target as HTMLElement;
              if (
                target.closest(
                  "button, input, textarea, a, [contenteditable='true']",
                )
              ) {
                return;
              }
              focusEditor();
            }}
            onClick={(e) => {
              if (isEditing) e.stopPropagation();
            }}
          >
            {isEditing && !isReadOnly ? (
              currentUser?.vimMode ? (
                <VimEditor
                  value={data.content || ""}
                  onChange={handleVimChange}
                  editable={!isReadOnly}
                  vimEnabled={true}
                  extensions={latexVimExtensions}
                  theme="dark"
                  className="h-full font-mono text-sm leading-relaxed"
                  onPreviewShortcut={handleEditorPreviewShortcut}
                />
              ) : (
                <textarea
                  ref={textareaRef}
                  data-latex-editor
                  className="w-full h-full resize-none bg-transparent font-mono text-sm leading-relaxed outline-none px-4 py-2 text-inherit"
                  value={localContent}
                  onChange={(e) => {
                    setLocalContent(e.target.value);
                    handleContentChange(e.target.value);
                  }}
                  placeholder={
                    dict.blocks.latexPlaceholder ||
                    "Write LaTeX — use $...$ for inline math, $$...$$ for display math"
                  }
                  readOnly={isReadOnly}
                  onKeyDown={(e) => {
                    if (e.key === "p" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleEditorPreviewShortcut();
                    }
                  }}
                />
              )
            ) : (
              <LatexRenderer content={data.content || ""} />
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
                  onClick={() => {
                    setIsEditing(true);
                    focusEditor();
                  }}
                  className={`zen-mode-switch-btn ${isEditing ? "active" : ""}`}
                >
                  {dict.common.edit}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className={`zen-mode-switch-btn ${
                    !isEditing ? "active" : ""
                  }`}
                >
                  {dict.common.preview}
                </button>
              </div>
            )}
          </BlockFooter>
        </div>

        <BlockReactions
          reactions={data.reactions}
          onReact={handleReact}
          onRemoveReaction={handleRemoveReaction}
          currentUserId={currentUser?.id}
          isReadOnly={isReadOnly}
          canReact={canReact}
        />

        <Handle
          id="left"
          type="source"
          position={Position.Left}
          isConnectable={true}
          className="block-handle block-handle-left z-50!"
        >
          {!isLeftSourceConnected && <div className="handle-dot" />}
        </Handle>

        <Handle
          id="right"
          type="source"
          position={Position.Right}
          isConnectable={true}
          className="block-handle block-handle-right z-50!"
        >
          {!isRightSourceConnected && <div className="handle-dot" />}
        </Handle>

        <Handle
          id="top"
          type="source"
          position={Position.Top}
          isConnectable={true}
          className="block-handle block-handle-top z-50!"
        >
          {!isTopSourceConnected && <div className="handle-dot" />}
        </Handle>

        <Handle
          id="bottom"
          type="source"
          position={Position.Bottom}
          isConnectable={true}
          className="block-handle block-handle-bottom z-50!"
        >
          {!isBottomSourceConnected && <div className="handle-dot" />}
        </Handle>
      </div>
    </>
  );
});

LatexBlock.displayName = "LatexBlock";

export default LatexBlock;
