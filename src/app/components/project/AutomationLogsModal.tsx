"use client";

import { useState, useEffect } from "react";
import { Modal } from "@components/ui/Modal";
import {
  CheckCircle2,
  XCircle,
  SkipForward,
  FlaskConical,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";

interface AutomationLog {
  id: string;
  status: "success" | "error" | "skipped" | "test";
  payload: string | null;
  error: string | null;
  appliedAt: number;
}

interface AutomationLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockId: string;
  projectId: string;
  blockTitle?: string;
}

const STATUS_ICON: Record<AutomationLog["status"], React.ReactNode> = {
  success: <CheckCircle2 size={13} className="text-green-500 shrink-0" />,
  error: <XCircle size={13} className="text-red-500 shrink-0" />,
  skipped: <SkipForward size={13} className="text-yellow-500 shrink-0" />,
  test: <FlaskConical size={13} className="text-blue-400 shrink-0" />,
};

const STATUS_LABEL: Record<AutomationLog["status"], string> = {
  success: "Scheduled",
  error: "Error",
  skipped: "Skipped",
  test: "Manual",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function PayloadPreview({ raw }: { raw: string | null }) {
  const [open, setOpen] = useState(false);
  if (!raw) return null;
  let pretty: string;
  try {
    pretty = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    pretty = raw;
  }
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] opacity-50 hover:opacity-80 transition-opacity"
      >
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        payload
      </button>
      {open && (
        <pre
          className="mt-1 text-[10px] font-mono p-2 rounded overflow-x-auto max-h-32 whitespace-pre-wrap break-all text-left"
          style={{ background: "var(--bg-subtle)" }}
        >
          {pretty}
        </pre>
      )}
    </div>
  );
}

export function AutomationLogsModal({
  isOpen,
  onClose,
  blockId,
  projectId,
  blockTitle,
}: AutomationLogsModalProps) {
  const { dict } = useI18n();
  const tr = dict.automation;
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(false);
    fetch(`/api/projects/${projectId}/automations/${blockId}/logs`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<AutomationLog[]>;
      })
      .then((data) => setLogs(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [isOpen, projectId, blockId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        blockTitle
          ? `${tr.logsTitle || "Logs"} — ${blockTitle}`
          : tr.logsTitle || "Logs"
      }
      className="w-full max-w-2xl"
    >
      <div className="mt-2 min-h-[120px]">
        {loading && (
          <div className="flex items-center justify-center py-10 opacity-50">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}
        {!loading && error && (
          <p className="text-center text-sm py-8 opacity-50">
            {tr.logsLoadError || "Failed to load logs"}
          </p>
        )}
        {!loading && !error && logs.length === 0 && (
          <p className="text-center text-sm py-8 opacity-50">
            {tr.logsEmpty || "No executions recorded yet"}
          </p>
        )}
        {!loading && !error && logs.length > 0 && (
          <ul className="space-y-2">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex flex-col gap-0.5 rounded-md px-3 py-2 text-xs"
                style={{ background: "var(--bg-subtle)" }}
              >
                <div className="flex items-center gap-2">
                  {STATUS_ICON[log.status]}
                  <span className="font-medium">
                    {STATUS_LABEL[log.status]}
                  </span>
                  <span className="ml-auto opacity-40 tabular-nums">
                    {formatTime(log.appliedAt)}
                  </span>
                </div>
                {log.error && (
                  <p
                    className={`text-[11px] mt-0.5 break-all font-mono ${
                      log.status === "error" ? "text-red-500" : "opacity-40"
                    }`}
                  >
                    {log.error}
                  </p>
                )}
                <PayloadPreview raw={log.payload} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
