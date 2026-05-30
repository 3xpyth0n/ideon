"use client";

import { memo, useState, useCallback } from "react";
import {
  Handle,
  Position,
  type NodeProps,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import {
  Webhook,
  Copy,
  Check,
  Settings,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { BlockData } from "./CanvasBlock";
import { AutomationStateBadge } from "./AutomationStateBadge";
import { BlockTitleInput } from "./BlockTitleInput";
import { BlockFooter } from "./BlockFooter";
import { focusProjectCanvas } from "./utils/focusCanvas";
import CustomNodeResizer from "./CustomNodeResizer";
import { STATE_DOT } from "./automationBlockShared";
import {
  WebhookBlockConfigModal,
  type WebhookMeta,
} from "./WebhookBlockConfigModal";

const WebhookBlock = memo(
  ({ id, data, selected }: NodeProps<Node<BlockData>>) => {
    const { dict, lang } = useI18n();
    const tr = dict.automation;
    const isViewer = data.userRole === "viewer";
    const isReadOnly = data.isPreviewMode || isViewer;
    const { getEdges } = useReactFlow();

    const parsedMeta = useCallback((): WebhookMeta => {
      if (!data.metadata) return {};
      if (typeof data.metadata === "string") {
        try {
          return JSON.parse(data.metadata) as WebhookMeta;
        } catch {
          return {};
        }
      }
      return data.metadata as WebhookMeta;
    }, [data.metadata]);

    const meta = parsedMeta();
    const projectId = meta.projectId ?? "";
    const endpointUrl = projectId
      ? `${
          typeof window !== "undefined" ? window.location.origin : ""
        }/webhooks/${projectId}/${id}`
      : "";

    const [title, setTitle] = useState(data.title || "");
    const [copied, setCopied] = useState(false);
    const [enabled, setEnabled] = useState(meta.enabled ?? true);
    const [configOpen, setConfigOpen] = useState(false);

    const edges = getEdges();
    const isHandleConnected = (handleId: string) =>
      edges.some(
        (e) =>
          (e.source === id && e.sourceHandle === handleId) ||
          (e.target === id && e.targetHandle === handleId),
      );

    const updateMetadata = useCallback(
      (patch: Partial<WebhookMeta>) => {
        const current = parsedMeta();
        data.onContentChange?.(
          id,
          data.content || "",
          new Date().toISOString(),
          data.lastEditor || "",
          { ...current, ...patch },
        );
      },
      [parsedMeta, data, id],
    );

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      const current = parsedMeta();
      data.onContentChange?.(
        id,
        data.content || "",
        new Date().toISOString(),
        data.currentUser?.displayName ||
          data.currentUser?.username ||
          data.lastEditor ||
          "",
        current,
        newTitle,
        data.reactions,
      );
    };

    const toggleEnabled = useCallback(async () => {
      if (!projectId || isReadOnly) return;
      const next = !enabled;
      setEnabled(next);
      updateMetadata({ enabled: next });
      await fetch(`/api/projects/${projectId}/automations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
    }, [projectId, id, enabled, isReadOnly, updateMetadata]);

    const copyUrl = useCallback(async () => {
      if (!endpointUrl) return;
      await navigator.clipboard.writeText(endpointUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }, [endpointUrl]);

    const automationState = meta.automationState as
      | "processing"
      | "success"
      | "warning"
      | "error"
      | undefined;
    const action = meta.action || "set_state";
    const actionParams = (meta.actionParams as Record<string, string>) ?? {};
    const targetBlockId = meta.targetBlockId;

    return (
      <div
        className={`block-card block-type-webhook ${
          selected ? "selected" : ""
        } ${
          isReadOnly ? "read-only" : ""
        } flex flex-col p-0! relative w-full h-full`}
      >
        <CustomNodeResizer
          minWidth={260}
          minHeight={140}
          isVisible={!isReadOnly}
          lineClassName="resizer-line"
          handleClassName="resizer-handle"
        />

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

        <div className="w-full h-full flex flex-col overflow-hidden rounded-[inherit]">
          {/* Header */}
          <div className="block-header flex items-center justify-between pt-4 px-4 mb-2 gap-2 shrink-0">
            <div className="flex items-center gap-2 shrink-0">
              <Webhook
                size={14}
                className="block-type-icon shrink-0 opacity-60"
              />
              <span className="text-sm uppercase tracking-wider opacity-50 font-bold shrink-0">
                {tr.webhookBlockLabel || "Webhook"}
              </span>
              {automationState ? (
                <AutomationStateBadge
                  state={automationState}
                  customLabel={meta.automationLabel ?? null}
                />
              ) : !targetBlockId && !isReadOnly ? (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              ) : null}
            </div>
            <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
              <BlockTitleInput
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
                placeholder={dict.blocks.title || "..."}
                readOnly={isReadOnly}
              />
              {!isReadOnly && (
                <>
                  <button
                    onClick={() => setConfigOpen(true)}
                    className="shrink-0 opacity-40 hover:opacity-80 transition-opacity"
                    aria-label={tr.configure || "Configure"}
                    title={tr.configure || "Configure"}
                  >
                    <Settings size={14} />
                  </button>
                  <button
                    onClick={() => void toggleEnabled()}
                    className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                    aria-label={enabled ? "Enabled" : "Disabled"}
                  >
                    {enabled ? (
                      <ToggleRight size={16} className="text-green-500" />
                    ) : (
                      <ToggleLeft size={16} />
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Content — no block-content class to avoid overflow:visible from editor CSS */}
          <div className="flex-1 px-4 pb-2 flex flex-col gap-2 min-h-0 overflow-hidden">
            {/* POST endpoint row */}
            <button
              onClick={() => void copyUrl()}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-black/5 dark:bg-white/5 group w-full text-left shrink-0"
              title={endpointUrl || undefined}
              disabled={!endpointUrl}
            >
              <span className="text-[9px] font-bold uppercase tracking-widest opacity-40 shrink-0">
                POST
              </span>
              <span className="text-[10px] font-mono opacity-40 truncate flex-1 group-hover:opacity-70 transition-opacity">
                {endpointUrl
                  ? `/${id.slice(0, 8)}…`
                  : tr.webhookSetupPending || "Pending…"}
              </span>
              {endpointUrl &&
                (copied ? (
                  <Check size={10} className="shrink-0 text-green-500" />
                ) : (
                  <Copy
                    size={10}
                    className="shrink-0 opacity-20 group-hover:opacity-60 transition-opacity"
                  />
                ))}
            </button>

            {/* Event + conditions row */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[9px] font-semibold uppercase tracking-widest opacity-25 shrink-0">
                {tr.triggerEvent || "Event"}
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/6 dark:bg-white/6 opacity-70 truncate max-w-[120px]">
                {meta.triggerEvent || "*"}
              </span>
              {meta.conditions && meta.conditions.length > 0 && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 opacity-40">
                  +{meta.conditions.length}
                </span>
              )}
            </div>

            <div className="border-t border-border/20 shrink-0" />

            {/* Action summary or setup CTA */}
            {targetBlockId ? (
              <div className="flex items-center gap-1.5 shrink-0">
                {action === "set_state" && (
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                      STATE_DOT[actionParams.state ?? "success"] ??
                      "bg-green-500"
                    }`}
                  />
                )}
                {action === "set_color" && actionParams.color && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: actionParams.color }}
                  />
                )}
                <span className="text-[10px] opacity-40 truncate">
                  {action === "set_state"
                    ? `${tr.setsStateTo || "Sets state to"} ${
                        actionParams.state || "success"
                      }${actionParams.label ? ` · ${actionParams.label}` : ""}`
                    : action === "set_color"
                      ? `${tr.actionSetColor || "Set color"} ${
                          actionParams.color || ""
                        }`
                      : action === "create_kanban_task"
                        ? tr.actionCreateKanban || "Creates Kanban task"
                        : tr.actionUpdateNote || "Prepends text"}
                </span>
              </div>
            ) : !isReadOnly ? (
              <button
                onClick={() => setConfigOpen(true)}
                className="inline-flex items-center gap-1.5 self-start !text-[10px] font-medium px-2 py-1 rounded-md text-amber-400 bg-amber-400/10 ring-1 ring-amber-400/30 hover:bg-amber-400/20 hover:ring-amber-400/50 transition-all shrink-0"
              >
                <Settings size={10} className="shrink-0" />
                {tr.setupRequired || "Setup required"}
              </button>
            ) : null}

            {meta.lastTriggeredAt && (
              <p className="text-[9px] opacity-20 mt-auto shrink-0">
                {tr.lastTriggered || "Last triggered"}{" "}
                {new Date(meta.lastTriggeredAt).toLocaleString()}
              </p>
            )}
          </div>

          <BlockFooter
            updatedAt={data.updatedAt}
            authorName={data.authorName}
            isContentLocked={data.isContentLocked}
            isPositionLocked={data.isPositionLocked}
            dict={dict}
            lang={lang}
          />
        </div>

        <WebhookBlockConfigModal
          isOpen={configOpen}
          onClose={() => setConfigOpen(false)}
          blockId={id}
          projectId={projectId}
          initialMeta={meta}
          blockTitle={title}
          onMetaUpdate={updateMetadata}
        />
      </div>
    );
  },
);

WebhookBlock.displayName = "WebhookBlock";
export default WebhookBlock;
