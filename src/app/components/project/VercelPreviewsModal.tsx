"use client";

import { useState, useEffect } from "react";
import { Modal } from "@components/ui/Modal";
import {
  Archive,
  ExternalLink,
  GitBranch,
  Clock,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { useI18n } from "@providers/I18nProvider";

interface PreviewDeployment {
  id: string;
  url: string;
  branch: string;
  commitMessage?: string;
  githubPrId?: number;
  created: number;
}

interface VercelPreviewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

export function VercelPreviewsModal({
  isOpen,
  onClose,
  projectId,
}: VercelPreviewsModalProps) {
  const { dict } = useI18n();
  const [previews, setPreviews] = useState<PreviewDeployment[]>([]);
  const [loading, setLoading] = useState(true);

  const blocksDict = (dict.blocks || {}) as Record<string, string>;

  useEffect(() => {
    if (isOpen) {
      fetchPreviews();
    }
  }, [isOpen, projectId]);

  const fetchPreviews = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vercel/projects/${projectId}/previews`);
      if (res.ok) {
        setPreviews(await res.json());
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="w-full max-w-2xl p-0 overflow-hidden bg-[var(--bg-island)] border border-[var(--border)] shadow-xl"
    >
      <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-[var(--brand-primary)]/10 rounded-2xl">
            <Archive className="text-[var(--brand-primary)]" size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter m-0 lowercase first-letter:uppercase">
              {blocksDict.vercelPreviews || "Preview Deployments"}
            </h1>
            <p className="text-[var(--text-tertiary)] text-sm m-0 mt-1">
              {blocksDict.vercelPreviewsDesc ||
                "Active preview deployments per branch."}
            </p>
          </div>
        </div>
      </div>

      <div
        className="p-6 flex flex-col gap-4 max-h-[70vh] overflow-y-auto nopan nodrag nowheel"
        onWheel={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-30">
            <Loader2 size={32} className="animate-spin" />
            <span className="text-xs uppercase font-bold tracking-widest">
              {blocksDict.vercelLoadingDeployments ||
                "Fetching active deployments..."}
            </span>
          </div>
        ) : previews.length === 0 ? (
          <div className="text-center py-20 opacity-30 text-sm italic">
            {blocksDict.vercelNoDeploymentsFound ||
              "No active preview deployments found for this project."}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {previews.map((preview) => (
              <div
                key={preview.id}
                className="p-4 bg-[var(--bg-sidebar)] border border-[var(--border)] rounded-xl hover:border-[var(--brand-primary)]/30 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 bg-[var(--bg-tertiary)] px-2 py-0.5 rounded text-[11px] font-bold text-[var(--text-secondary)] border border-[var(--border-color)]">
                        <GitBranch size={10} />
                        {preview.branch}
                      </span>
                      {preview.githubPrId && (
                        <span className="flex items-center gap-1 text-[10px] text-blue-500 font-bold">
                          <MessageSquare size={10} />
                          PR #{preview.githubPrId}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--text-tertiary)] font-mono truncate max-w-[200px]">
                      {preview.commitMessage}
                    </span>
                  </div>
                  <a
                    href={`https://${preview.url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] transition-all"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
                <div className="flex items-center justify-between text-[10px] opacity-40 font-bold uppercase tracking-widest">
                  <div className="flex items-center gap-2">
                    <Clock size={10} />
                    {new Date(preview.created).toLocaleDateString()}{" "}
                    {new Date(preview.created).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <span>{preview.id}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
