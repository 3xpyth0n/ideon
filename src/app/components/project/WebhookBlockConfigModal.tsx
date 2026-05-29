"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Modal } from "@components/ui/Modal";
import {
  Copy,
  Check,
  ExternalLink,
  Plus,
  Trash2,
  RefreshCw,
  Play,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { toast } from "sonner";
import {
  ACTION_OPTIONS,
  CONDITION_OP_OPTIONS,
  type BlockInfo,
  type Condition,
} from "./automationBlockShared";

export type WebhookMeta = {
  ruleCreated?: boolean;
  webhookSecret?: string;
  projectId?: string;
  source?: string;
  triggerEvent?: string;
  enabled?: boolean;
  conditions?: Condition[];
  targetBlockId?: string | null;
  action?: string;
  actionParams?: Record<string, string>;
  stateDecayMinutes?: number;
  lastTriggeredAt?: number | null;
  automationState?: string;
  automationLabel?: string | null;
};

interface WebhookBlockConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockId: string;
  projectId: string;
  initialMeta: WebhookMeta;
  blockTitle?: string;
  onMetaUpdate: (patch: Partial<WebhookMeta>) => void;
}

export function WebhookBlockConfigModal({
  isOpen,
  onClose,
  blockId,
  projectId,
  initialMeta,
  blockTitle,
  onMetaUpdate,
}: WebhookBlockConfigModalProps) {
  const { dict } = useI18n();
  const tr = dict.automation;

  const endpointUrl = projectId
    ? `${
        typeof window !== "undefined" ? window.location.origin : ""
      }/webhooks/${projectId}/${blockId}`
    : "";

  const [copied, setCopied] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [triggerEvent, setTriggerEvent] = useState(
    initialMeta.triggerEvent || "*",
  );
  const [conditions, setConditions] = useState<Condition[]>(
    initialMeta.conditions ?? [],
  );
  const [action, setAction] = useState(initialMeta.action || "set_state");
  const [actionParams, setActionParams] = useState<Record<string, string>>(
    (initialMeta.actionParams as Record<string, string>) ?? {
      state: "success",
    },
  );
  const [targetBlockId, setTargetBlockId] = useState(
    initialMeta.targetBlockId ?? "",
  );
  const [stateDecayMinutes, setStateDecayMinutes] = useState(
    String(initialMeta.stateDecayMinutes ?? 1440),
  );
  const [blocks, setBlocks] = useState<BlockInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const isDirty = useRef(false);

  useEffect(() => {
    if (isOpen && projectId) {
      void fetch(`/api/projects/${projectId}/blocks`)
        .then((r) => r.json())
        .then((d: unknown) => {
          if (Array.isArray(d)) {
            setBlocks((d as BlockInfo[]).filter((b) => b.id !== blockId));
          }
        })
        .catch(() => {});
    }
  }, [isOpen, projectId, blockId]);

  const saveConfig = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      const ruleExists = !!initialMeta.ruleCreated;
      const res = await fetch(
        ruleExists
          ? `/api/projects/${projectId}/automations/${blockId}`
          : `/api/projects/${projectId}/automations`,
        {
          method: ruleExists ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            ruleExists
              ? {
                  triggerEvent,
                  conditions,
                  action,
                  actionParams,
                  targetBlockId: targetBlockId || null,
                  stateDecayMinutes: parseInt(stateDecayMinutes, 10) || 1440,
                }
              : {
                  id: blockId,
                  name: blockTitle || "Webhook",
                  source: initialMeta.source || "custom",
                  triggerEvent,
                  conditions,
                  action,
                  actionParams,
                  targetBlockId: targetBlockId || null,
                  stateDecayMinutes: parseInt(stateDecayMinutes, 10) || 1440,
                },
          ),
        },
      );
      if (!res.ok) throw new Error();
      const saved = (await res.json()) as { webhookSecret?: string };
      onMetaUpdate({
        triggerEvent,
        conditions,
        action,
        actionParams,
        targetBlockId: targetBlockId || null,
        stateDecayMinutes: parseInt(stateDecayMinutes, 10) || 1440,
        ruleCreated: true,
        ...(saved.webhookSecret ? { webhookSecret: saved.webhookSecret } : {}),
      });
      isDirty.current = false;
      toast.success(tr.ruleSaved || "Saved");
      onClose();
    } catch {
      toast.error(tr.saveError || "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [
    projectId,
    blockId,
    blockTitle,
    triggerEvent,
    conditions,
    action,
    actionParams,
    targetBlockId,
    stateDecayMinutes,
    initialMeta,
    onMetaUpdate,
    onClose,
    tr,
  ]);

  const copyUrl = useCallback(async () => {
    await navigator.clipboard.writeText(endpointUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [endpointUrl]);

  const copyCurlSnippet = useCallback(async () => {
    const snippet = `curl -X POST ${endpointUrl} \\\n  -H "Authorization: Bearer sk-ideon-..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"event":"ping"}'`;
    await navigator.clipboard.writeText(snippet);
    setSnippetCopied(true);
    setTimeout(() => setSnippetCopied(false), 1500);
  }, [endpointUrl]);

  const sendTest = useCallback(async () => {
    if (!endpointUrl) return;
    setTesting(true);
    try {
      await fetch(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Ideon-Test": "true" },
        body: JSON.stringify({ event: "test" }),
      });
      toast.success(tr.testSent || "Test event sent");
    } catch {
      toast.error(tr.testError || "Failed to send test event");
    } finally {
      setTesting(false);
    }
  }, [endpointUrl, tr]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        blockTitle
          ? `${tr.webhookBlockLabel || "Webhook"} — ${blockTitle}`
          : tr.configure || "Configure"
      }
      className="w-full max-w-lg"
    >
      <div className="flex flex-col gap-4 mt-3 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest opacity-40">
            {tr.triggerEvent || "Event"}
          </label>
          <input
            className="zen-input text-sm"
            value={triggerEvent}
            onChange={(e) => {
              setTriggerEvent(e.target.value);
              isDirty.current = true;
            }}
            placeholder="pull_request.opened"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold uppercase tracking-widest opacity-40">
              {tr.conditions || "Conditions"}
            </label>
            <button
              type="button"
              onClick={() => {
                setConditions((prev) => [
                  ...prev,
                  { field: "", op: "eq", value: "" },
                ]);
                isDirty.current = true;
              }}
              className="flex items-center gap-1 text-[10px] opacity-40 hover:opacity-70 transition-opacity"
            >
              <Plus size={10} />
              {tr.conditionsAdd || "Add"}
            </button>
          </div>
          {conditions.length === 0 ? (
            <p className="text-[11px] opacity-30">
              {tr.conditionsEmpty || "No conditions — fires on every request"}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {conditions.map((cond, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_60px_1fr_auto] items-center gap-1.5"
                >
                  <input
                    className="zen-input text-xs font-mono"
                    value={cond.field}
                    onChange={(e) => {
                      setConditions((prev) =>
                        prev.map((c, j) =>
                          j === i ? { ...c, field: e.target.value } : c,
                        ),
                      );
                      isDirty.current = true;
                    }}
                    placeholder="payload.field"
                  />
                  <select
                    className="zen-input text-xs text-center"
                    value={cond.op}
                    onChange={(e) => {
                      setConditions((prev) =>
                        prev.map((c, j) =>
                          j === i
                            ? { ...c, op: e.target.value as Condition["op"] }
                            : c,
                        ),
                      );
                      isDirty.current = true;
                    }}
                  >
                    {CONDITION_OP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {cond.op !== "exists" ? (
                    <input
                      className="zen-input text-xs"
                      value={cond.value ?? ""}
                      onChange={(e) => {
                        setConditions((prev) =>
                          prev.map((c, j) =>
                            j === i ? { ...c, value: e.target.value } : c,
                          ),
                        );
                        isDirty.current = true;
                      }}
                      placeholder="opened"
                    />
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setConditions((prev) => prev.filter((_, j) => j !== i));
                      isDirty.current = true;
                    }}
                    className="shrink-0 opacity-30 hover:opacity-70 hover:text-red-500 transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest opacity-40">
            {tr.action || "Action"}
          </label>
          <select
            className="zen-input text-sm"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              isDirty.current = true;
            }}
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {action === "set_state" && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest opacity-40">
              {tr.stateSuccess || "State"}
            </label>
            <select
              className="zen-input text-sm"
              value={actionParams.state ?? "success"}
              onChange={(e) => {
                setActionParams((p) => ({ ...p, state: e.target.value }));
                isDirty.current = true;
              }}
            >
              <option value="success">{tr.stateSuccess || "Success"}</option>
              <option value="error">{tr.stateError || "Error"}</option>
              <option value="warning">{tr.stateWarning || "Warning"}</option>
              <option value="processing">
                {tr.stateProcessing || "Processing"}
              </option>
            </select>
            <input
              className="zen-input text-sm mt-1"
              value={actionParams.label ?? ""}
              onChange={(e) => {
                setActionParams((p) => ({ ...p, label: e.target.value }));
                isDirty.current = true;
              }}
              placeholder={tr.stateLabelPlaceholder || '"CI passed"'}
            />
          </div>
        )}
        {action === "set_color" && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest opacity-40">
              {tr.actionSetColor || "Color"}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="w-9 h-8 rounded cursor-pointer border border-border/50 bg-transparent"
                value={actionParams.color ?? "#6366f1"}
                onChange={(e) => {
                  setActionParams((p) => ({ ...p, color: e.target.value }));
                  isDirty.current = true;
                }}
              />
              <input
                className="zen-input text-sm font-mono flex-1"
                value={actionParams.color ?? "#6366f1"}
                onChange={(e) => {
                  setActionParams((p) => ({ ...p, color: e.target.value }));
                  isDirty.current = true;
                }}
                placeholder={tr.colorPlaceholder || "#ef4444"}
              />
            </div>
          </div>
        )}
        {action === "create_kanban_task" && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest opacity-40">
              {tr.taskTitle || "Task title"}
            </label>
            <input
              className="zen-input text-sm"
              value={actionParams.title ?? ""}
              onChange={(e) => {
                setActionParams((p) => ({ ...p, title: e.target.value }));
                isDirty.current = true;
              }}
              placeholder={
                tr.taskTitlePlaceholder || "PR: {{payload.pull_request.title}}"
              }
            />
          </div>
        )}
        {action === "update_note" && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest opacity-40">
              {tr.textToPrepend || "Text to prepend"}
            </label>
            <input
              className="zen-input text-sm"
              value={actionParams.text ?? ""}
              onChange={(e) => {
                setActionParams((p) => ({ ...p, text: e.target.value }));
                isDirty.current = true;
              }}
              placeholder={
                tr.textToPrependPlaceholder || "Issue: {{payload.issue.title}}"
              }
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest opacity-40">
            {tr.targetBlock || "Target block"}
          </label>
          <select
            className="zen-input text-sm"
            value={targetBlockId}
            onChange={(e) => {
              setTargetBlockId(e.target.value);
              isDirty.current = true;
            }}
          >
            <option value="">{tr.noTarget || "None"}</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title || b.blockType} ({b.id.slice(0, 6)}…)
              </option>
            ))}
          </select>
          <p className="text-[10px] opacity-30 leading-relaxed">
            {tr.targetHint ||
              "This block will be affected when the automation fires"}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest opacity-40">
            {tr.stateDecayMinutes || "Decay (minutes)"}
          </label>
          <input
            className="zen-input text-sm"
            type="number"
            min={1}
            max={525600}
            value={stateDecayMinutes}
            onChange={(e) => {
              setStateDecayMinutes(e.target.value);
              isDirty.current = true;
            }}
          />
          <p className="text-[10px] opacity-30 leading-relaxed">
            {tr.stateDecayMinutesHint ||
              "After this many minutes, the block visual state resets to neutral. Default: 1440."}
          </p>
        </div>

        {endpointUrl && (
          <>
            {/* URL section */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest opacity-40">
                URL
              </label>
              <button
                onClick={() => void copyUrl()}
                className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-md ring-1 ring-border/50 bg-black/5 dark:bg-white/5 group hover:ring-border transition-all"
                title={endpointUrl}
              >
                <span className="text-[11px] font-mono opacity-60 truncate flex-1 group-hover:opacity-90 transition-opacity">
                  {endpointUrl}
                </span>
                {copied ? (
                  <Check size={11} className="shrink-0 text-green-500" />
                ) : (
                  <Copy
                    size={11}
                    className="shrink-0 opacity-30 group-hover:opacity-60 transition-opacity"
                  />
                )}
              </button>
            </div>

            {/* Curl example section */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold uppercase tracking-widest opacity-40">
                  {tr.curlExample || "Example"}
                </label>
                <button
                  onClick={() => void copyCurlSnippet()}
                  className="flex items-center gap-1 text-[10px] opacity-40 hover:opacity-70 transition-opacity"
                >
                  {snippetCopied ? (
                    <Check size={10} className="text-green-500" />
                  ) : (
                    <Copy size={10} />
                  )}
                  {snippetCopied
                    ? dict.common.copied || "Copied"
                    : dict.common.copy || "Copy"}
                </button>
              </div>
              <pre className="text-[10px] font-mono opacity-50 leading-relaxed px-3 py-2.5 rounded-md border border-border/50 overflow-x-auto whitespace-pre">
                {`curl -X POST \\
  ${endpointUrl.replace(/^https?:\/\/[^/]+/, "")} \\
  -H "Authorization: Bearer sk-ideon-..." \\
  -H "Content-Type: application/json" \\
  -d '{"event":"ping"}'`}
              </pre>
              <a
                href="/account#api-keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[10px] opacity-40 hover:opacity-70 transition-opacity"
              >
                <ExternalLink size={9} />
                {tr.getApiKey || "Get an API key in Settings → Developers"}
              </a>
            </div>
          </>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => void saveConfig()}
            disabled={saving || !targetBlockId}
            className="btn-primary text-sm py-2 w-[140px] flex items-center gap-2 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              !targetBlockId
                ? tr.noTargetSelected || "Select a target block first"
                : undefined
            }
          >
            {saving ? <RefreshCw size={13} className="animate-spin" /> : null}
            {tr.save || "Save"}
          </button>
          {initialMeta.ruleCreated && endpointUrl && (
            <button
              onClick={() => void sendTest()}
              disabled={testing}
              className="btn-secondary text-sm py-2 flex items-center gap-1.5 px-4 disabled:opacity-40"
            >
              {testing ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Play size={13} />
              )}
              {tr.runNow || "Test"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
