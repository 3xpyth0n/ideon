"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import {
  Terminal as TerminalIcon,
  Play,
  Pause,
  X,
  Loader2,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { BlockFooter } from "./BlockFooter";
import { useTouchGestures } from "./hooks/useTouchGestures";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import { BlockData } from "./CanvasBlock";
import { BlockReactions } from "./BlockReactions";
import { useBlockReactions } from "./hooks/useBlockReactions";
import CustomNodeResizer from "./CustomNodeResizer";
import "@xterm/xterm/css/xterm.css";
import "./shell-block.css";
import { focusProjectCanvas } from "./utils/focusCanvas";

type ShellBlockProps = NodeProps<Node<BlockData>> & {
  isReadOnly?: boolean;
};

type ShellStatus = "stopped" | "connecting" | "running" | "ended";

const ShellBlock = memo(({ id, data, selected }: ShellBlockProps) => {
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
  const isEditor = data.userRole === "editor";
  const isReadOnly =
    isPreviewMode ||
    isViewer ||
    (isLocked ? !isOwner && !isProjectOwner : false);
  const canReact = !isPreviewMode || isViewer;

  const canUseShell =
    !isPreviewMode && !isViewer && (isProjectOwner || (isOwner && !isEditor));

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

  const [status, setStatus] = useState<ShellStatus>("stopped");
  const [title, setTitle] = useState(data.title || "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<{
    terminal: import("@xterm/xterm").Terminal;
    fitAddon: import("@xterm/addon-fit").FitAddon;
    serializeAddon: import("@xterm/addon-serialize").SerializeAddon;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const savedBufferRef = useRef<string | null>(null);

  const projectId = data.initialProjectId;

  useEffect(() => {
    if (data.title !== undefined && data.title !== title) {
      setTitle(data.title);
    }
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
        data.content,
        now,
        editor,
        data.metadata,
        newTitle,
        data.reactions,
      );
    },
    [id, data, currentUser, dict],
  );

  const cleanupTerminal = useCallback(
    (preserveBuffer: boolean) => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (preserveBuffer && xtermRef.current) {
        try {
          savedBufferRef.current = xtermRef.current.serializeAddon.serialize();
        } catch {
          // Ignore serialization errors
        }
      }
      if (xtermRef.current) {
        xtermRef.current.terminal.dispose();
        xtermRef.current = null;
      }
      if (wsRef.current) {
        if (
          wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          wsRef.current.send(
            JSON.stringify({ type: "shell:stop", blockId: id }),
          );
          wsRef.current.close();
        }
        wsRef.current = null;
      }
    },
    [id],
  );

  const handleStart = useCallback(async () => {
    if (!canUseShell || !projectId || !terminalRef.current) return;

    setStatus("connecting");
    setErrorMsg(null);

    try {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { SerializeAddon } = await import("@xterm/addon-serialize");

      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'Fira Code', 'Fira Mono', 'Courier New', monospace",
        theme: {
          background: "#1a1b26",
          foreground: "#c0caf5",
          cursor: "#c0caf5",
          selectionBackground: "#33467c",
          black: "#15161e",
          red: "#f7768e",
          green: "#9ece6a",
          yellow: "#e0af68",
          blue: "#7aa2f7",
          magenta: "#bb9af7",
          cyan: "#7dcfff",
          white: "#a9b1d6",
          brightBlack: "#414868",
          brightRed: "#f7768e",
          brightGreen: "#9ece6a",
          brightYellow: "#e0af68",
          brightBlue: "#7aa2f7",
          brightMagenta: "#bb9af7",
          brightCyan: "#7dcfff",
          brightWhite: "#c0caf5",
        },
        scrollback: 1000,
        convertEol: true,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      const serializeAddon = new SerializeAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(serializeAddon);
      terminal.open(terminalRef.current);

      if (savedBufferRef.current) {
        terminal.write(savedBufferRef.current);
      }

      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
        } catch {
          // Ignore fit errors during initial render
        }
      });

      xtermRef.current = { terminal, fitAddon, serializeAddon };

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/shell?projectId=${projectId}&blockId=${id}`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("running");
        ws.send(
          JSON.stringify({
            type: "shell:start",
            blockId: id,
            projectId,
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "shell:data" && msg.blockId === id) {
            terminal.write(msg.data);
          } else if (msg.type === "shell:exit" && msg.blockId === id) {
            setStatus("ended");
          } else if (msg.type === "shell:error") {
            setErrorMsg(msg.message || "Shell error");
            setStatus("stopped");
            cleanupTerminal(false);
          }
        } catch {
          // Binary data or non-JSON
        }
      };

      ws.onerror = () => {
        setErrorMsg("Connection error");
        setStatus("stopped");
        cleanupTerminal(false);
      };

      ws.onclose = (event) => {
        if (status === "running" || status === "connecting") {
          if (event.code === 4003) {
            setErrorMsg(dict.blocks.shellNoPermission as string);
          } else if (event.code === 4029) {
            setErrorMsg(dict.blocks.shellMaxSessions as string);
          }
          setStatus("ended");
        }
      };

      terminal.onData((inputData: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "shell:data",
              blockId: id,
              data: inputData,
            }),
          );
        }
      });

      terminal.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "shell:resize",
              blockId: id,
              cols,
              rows,
            }),
          );
        }
      });

      const observer = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          try {
            fitAddon.fit();
          } catch {
            // Ignore fit errors
          }
        });
      });
      observer.observe(terminalRef.current);
      resizeObserverRef.current = observer;
    } catch {
      setErrorMsg("Failed to initialize terminal");
      setStatus("stopped");
    }
  }, [canUseShell, projectId, id, cleanupTerminal, dict.blocks]);

  const handleStop = useCallback(() => {
    cleanupTerminal(true);
    setStatus("stopped");
    setErrorMsg(null);
  }, [cleanupTerminal]);

  const handleKill = useCallback(() => {
    cleanupTerminal(false);
    savedBufferRef.current = null;
    setStatus("stopped");
    setErrorMsg(null);
  }, [cleanupTerminal]);

  useEffect(() => {
    return () => {
      cleanupTerminal(true);
    };
  }, [cleanupTerminal]);

  const { handleReact, handleRemoveReaction } = useBlockReactions({
    id,
    data,
    currentUser,
    isReadOnly,
    canReact,
  });

  const isBeingMoved = !!data.movingUserColor;
  const borderColor = isBeingMoved ? data.movingUserColor : "var(--border)";

  const onLongPress = useCallback(
    (e: React.PointerEvent | PointerEvent | React.TouchEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: (e as PointerEvent).clientX,
        clientY: (e as PointerEvent).clientY,
      });
      target.dispatchEvent(event);
    },
    [],
  );

  const touchHandlers = useTouchGestures({
    onLongPress,
  });

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

      requestAnimationFrame(() => {
        try {
          xtermRef.current?.fitAddon.fit();
        } catch {
          // Ignore fit errors during resize
        }
      });
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

  return (
    <div
      className={`block-card block-type-shell ${selected ? "selected" : ""} ${
        isBeingMoved ? "is-moving" : ""
      } ${isReadOnly ? "read-only" : ""} flex flex-col p-0!`}
      style={
        isBeingMoved
          ? ({ "--block-border-color": borderColor } as React.CSSProperties)
          : undefined
      }
      {...touchHandlers}
    >
      <CustomNodeResizer
        minWidth={300}
        minHeight={200}
        isVisible={!isReadOnly}
        lineClassName="resizer-line"
        handleClassName="resizer-handle"
        keepAspectRatio={false}
        onResize={handleResize}
        onResizeEnd={handleResizeEnd}
      />

      <div className="shell-block-inner">
        <div className="shell-block-header">
          <div className="shell-block-title">
            <TerminalIcon size={16} />
            <span>{dict.blocks.blockTypeShell || "Shell"}</span>
          </div>
          <div className="shell-block-header-right">
            <input
              value={title}
              onChange={handleTitleChange}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.target as HTMLElement)?.blur?.();
                  focusProjectCanvas();
                }
              }}
              className="block-title nodrag"
              placeholder={dict.blocks.title || "..."}
              readOnly={isReadOnly}
            />
            <div className="shell-block-actions">
              {canUseShell && status === "stopped" && (
                <button
                  onClick={handleStart}
                  className="shell-action-button shell-start-button"
                >
                  <Play size={14} />
                  <span>{dict.blocks.shellStart || "Start"}</span>
                </button>
              )}
              {canUseShell && status === "connecting" && (
                <button className="shell-action-button" disabled>
                  <Loader2 size={14} className="shell-spinner" />
                  <span>{dict.blocks.shellConnecting || "Connecting..."}</span>
                </button>
              )}
              {canUseShell && (status === "running" || status === "ended") && (
                <>
                  <button
                    onClick={handleStop}
                    className="shell-action-button shell-stop-button"
                  >
                    <Pause size={14} />
                    <span>{dict.blocks.shellStop || "Stop"}</span>
                  </button>
                  <button
                    onClick={handleKill}
                    className="shell-action-button shell-kill-button"
                  >
                    <X size={14} />
                    <span>{dict.blocks.shellKill || "Kill"}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="shell-block-body nodrag">
          {status === "stopped" && !errorMsg && (
            <div className="shell-block-placeholder">
              <TerminalIcon size={32} className="shell-placeholder-icon" />
              <span>
                {canUseShell
                  ? savedBufferRef.current
                    ? dict.blocks.shellPaused ||
                      "Session paused — state preserved"
                    : dict.blocks.shellDisconnected || "Shell is not running"
                  : dict.blocks.shellNoPermission ||
                    "Only project creators and owners can use the shell"}
              </span>
            </div>
          )}

          {status === "stopped" && errorMsg && (
            <div className="shell-block-placeholder shell-error">
              <TerminalIcon size={32} className="shell-placeholder-icon" />
              <span>{errorMsg}</span>
              {canUseShell && (
                <button
                  onClick={handleStart}
                  className="shell-action-button shell-start-button shell-retry-button"
                >
                  <Play size={14} />
                  <span>{dict.blocks.shellStart || "Start"}</span>
                </button>
              )}
            </div>
          )}

          {status === "ended" && (
            <div className="shell-block-ended-overlay">
              <span>{dict.blocks.shellSessionEnded || "Session ended"}</span>
              {canUseShell && (
                <button
                  onClick={() => {
                    handleKill();
                    setTimeout(handleStart, 50);
                  }}
                  className="shell-action-button shell-start-button shell-retry-button"
                >
                  <Play size={14} />
                  <span>{dict.blocks.shellStart || "Start"}</span>
                </button>
              )}
            </div>
          )}

          <div
            ref={terminalRef}
            className="shell-terminal-container nowheel nopan nodrag"
            onWheel={(e) => e.stopPropagation()}
            style={{
              display:
                status === "running" ||
                status === "connecting" ||
                status === "ended"
                  ? "block"
                  : "none",
            }}
          />
        </div>

        <BlockFooter
          updatedAt={data.updatedAt}
          authorName={data.authorName}
          isLocked={isLocked}
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
  );
});

ShellBlock.displayName = "ShellBlock";

export default ShellBlock;
