"use client";

import { useState, useEffect, useRef } from "react";
import { Modal } from "@components/ui/Modal";
import { Terminal, Play, Pause, Copy, Loader2 } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";

interface LogEvent {
  id: string;
  text: string;
  type: string;
  created: number;
}

interface VercelLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deploymentId: string;
  deploymentUrl: string;
}

export function VercelLogsModal({
  isOpen,
  onClose,
  deploymentId,
}: VercelLogsModalProps) {
  const { dict } = useI18n();
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const blocksDict = (dict.blocks || {}) as Record<string, string>;

  useEffect(() => {
    if (!isOpen || isPaused) return;

    const eventSource = new EventSource(
      `/api/vercel/deployments/${deploymentId}/logs`,
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "stdout" || data.type === "stderr") {
        setLogs((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substr(2, 9),
            text: data.payload.text,
            type: data.type,
            created: data.payload.created,
          },
        ]);
        setLoading(false);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setLoading(false);
    };

    return () => {
      eventSource.close();
    };
  }, [isOpen, deploymentId, isPaused]);

  useEffect(() => {
    if (!isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isPaused]);

  const handleCopyAll = () => {
    const text = logs.map((l) => l.text).join("\n");
    navigator.clipboard.writeText(text);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="w-full max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden bg-[var(--bg-island)] border border-[var(--border)] shadow-2xl"
    >
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-[var(--brand-primary)]/10 rounded-2xl">
            <Terminal className="text-[var(--brand-primary)]" size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter m-0 lowercase first-letter:uppercase">
              {blocksDict.vercelLogsTitle || "Deployment Logs"}
            </h1>
            <p className="text-[var(--text-tertiary)] text-sm m-0 mt-1 font-mono opacity-60">
              {deploymentId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-[11px] font-bold uppercase transition-colors ${
              isPaused
                ? "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
                : "bg-[var(--bg-sidebar)] text-[var(--text-main)] border border-[var(--border)] hover:bg-[var(--bg-island)]"
            }`}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
            {isPaused
              ? blocksDict.vercelLogsResume || "Resume"
              : blocksDict.vercelPause || "Pause"}
          </button>
          <button
            onClick={handleCopyAll}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-[var(--bg-sidebar)] text-[var(--text-main)] border border-[var(--border)] text-[11px] font-bold uppercase hover:bg-[var(--bg-island)] transition-colors"
          >
            <Copy size={12} />
            {dict.common?.copy || "Copy"}
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-[12px] leading-relaxed selection:bg-blue-500/30 nopan nodrag nowheel"
        onWheel={(e) => e.stopPropagation()}
      >
        {loading && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40">
            <Loader2
              size={24}
              className="animate-spin text-[var(--brand-primary)]"
            />
            <span className="text-[11px] uppercase tracking-widest opacity-40">
              {blocksDict.vercelLogsStreaming || "Streaming events..."}
            </span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-full opacity-20 italic">
            {blocksDict.vercelLogsNoLogs ||
              "No logs available for this deployment"}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-4 group">
                <span className="text-gray-600 select-none w-20 flex-shrink-0 text-right opacity-40 group-hover:opacity-100 transition-opacity">
                  {new Date(log.created).toLocaleTimeString([], {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span
                  className={`break-all ${
                    log.type === "stderr" ? "text-red-400" : "text-gray-300"
                  }`}
                >
                  {log.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
