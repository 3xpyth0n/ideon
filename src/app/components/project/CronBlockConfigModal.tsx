"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Modal } from "@components/ui/Modal";
import { RefreshCw, Play, Check } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { toast } from "sonner";
import {
  ACTION_OPTIONS,
  SCHEDULE_PRESETS,
  type BlockInfo,
} from "./automationBlockShared";

export type CronMeta = {
  ruleCreated?: boolean;
  projectId?: string;
  schedule?: string;
  enabled?: boolean;
  targetBlockId?: string | null;
  action?: string;
  actionParams?: Record<string, string>;
  lastTriggeredAt?: number | null;
  automationState?: string;
  automationLabel?: string | null;
};

interface CronBlockConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockId: string;
  projectId: string;
  initialMeta: CronMeta;
  blockTitle?: string;
  onMetaUpdate: (patch: Partial<CronMeta>) => void;
}

export function CronBlockConfigModal({
  isOpen,
  onClose,
  blockId,
  projectId,
  initialMeta,
  blockTitle,
  onMetaUpdate,
}: CronBlockConfigModalProps) {
  const { dict } = useI18n();
  const tr = dict.automation;

  const [schedule, setSchedule] = useState(initialMeta.schedule || "0 9 * * *");
  const [presetValue, setPresetValue] = useState(() => {
    const s = initialMeta.schedule || "0 9 * * *";
    const match = SCHEDULE_PRESETS.find(
      (p) => p.value === s && p.value !== "custom",
    );
    return match ? match.value : "custom";
  });
  const [action, setAction] = useState(initialMeta.action || "set_state");
  const [actionParams, setActionParams] = useState<Record<string, string>>(
    (initialMeta.actionParams as Record<string, string>) ?? {
      state: "success",
    },
  );
  const [targetBlockId, setTargetBlockId] = useState(
    initialMeta.targetBlockId ?? "",
  );
  const [blocks, setBlocks] = useState<BlockInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
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

  const handlePresetChange = (val: string) => {
    setPresetValue(val as (typeof SCHEDULE_PRESETS)[number]["value"]);
    if (val !== "custom") {
      setSchedule(val);
      isDirty.current = true;
    }
  };

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
                  triggerEvent: `cron:${schedule}`,
                  action,
                  actionParams,
                  targetBlockId: targetBlockId || null,
                }
              : {
                  id: blockId,
                  name: blockTitle || "Cron",
                  source: "custom",
                  triggerEvent: `cron:${schedule}`,
                  action,
                  actionParams,
                  targetBlockId: targetBlockId || null,
                },
          ),
        },
      );
      if (!res.ok) throw new Error();
      onMetaUpdate({
        schedule,
        action,
        actionParams,
        targetBlockId: targetBlockId || null,
        ruleCreated: true,
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
    schedule,
    action,
    actionParams,
    targetBlockId,
    initialMeta,
    onMetaUpdate,
    onClose,
    tr,
  ]);

  const runNow = useCallback(async () => {
    if (!projectId) return;
    setRunning(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/automations/${blockId}/trigger`,
        {
          method: "POST",
        },
      );
      if (!res.ok) throw new Error();
      toast.success(tr.testSent || "Triggered");
    } catch {
      toast.error(tr.testError || "Failed to trigger");
    } finally {
      setRunning(false);
    }
  }, [projectId, blockId, tr]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        blockTitle
          ? `${tr.cronBlockLabel || "Cron"} — ${blockTitle}`
          : tr.configure || "Configure"
      }
      className="w-full max-w-lg"
    >
      <div className="flex flex-col gap-4 mt-3 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-widest opacity-40">
            {tr.schedule || "Schedule"}
          </label>
          <select
            className="zen-input text-sm"
            value={presetValue}
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            {SCHEDULE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {presetValue === "custom" && (
            <input
              className="zen-input text-sm font-mono mt-1"
              value={schedule}
              onChange={(e) => {
                setSchedule(e.target.value);
                isDirty.current = true;
              }}
              placeholder="0 9 * * *"
            />
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
              placeholder={tr.stateLabelPlaceholder || '"Deployed"'}
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
              placeholder={tr.taskTitlePlaceholder || "Daily standup {{date}}"}
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
              placeholder={tr.textToPrependPlaceholder || "Reminder: {{date}}"}
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
            {saving ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Check size={13} />
            )}
            {tr.save || "Save"}
          </button>
          {initialMeta.ruleCreated && (
            <button
              onClick={() => void runNow()}
              disabled={running}
              className="btn-secondary text-sm py-2 flex items-center gap-1.5 px-4 disabled:opacity-40"
              title={tr.runNow || "Run now"}
            >
              {running ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Play size={13} />
              )}
              {tr.runNow || "Run now"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
