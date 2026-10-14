"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Loader2 } from "lucide-react";
import { Modal } from "@components/ui/Modal";

interface ProvenanceEntry {
  authorEmail: string | null;
  at: string;
  stateId: string;
}

interface ProvenanceData {
  created: ProvenanceEntry | null;
  modifications: ProvenanceEntry[];
  sealed: boolean;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export function ProvenanceModal({
  isOpen,
  onClose,
  projectId,
  blockId,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  blockId: string | null;
}) {
  const { dict } = useI18n();
  const t = dict.project.instrument;
  const [provenance, setProvenance] = useState<ProvenanceData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchProvenance = useCallback(async () => {
    if (!blockId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/provenance?blockId=${encodeURIComponent(
          blockId,
        )}`,
      );
      if (!res.ok) throw new Error("provenance fetch failed");
      const data = (await res.json()) as ProvenanceData;
      setProvenance(data);
    } catch {
      setProvenance(null);
    } finally {
      setLoading(false);
    }
  }, [blockId, projectId]);

  useEffect(() => {
    if (isOpen && blockId) {
      void fetchProvenance();
    }
  }, [isOpen, blockId, fetchProvenance]);

  const renderEntry = (label: string, entry: ProvenanceEntry) => (
    <div className="flex flex-col gap-1 border-b border-(--border) py-2 last:border-b-0">
      <span className="text-xs uppercase tracking-widest opacity-50">
        {label}
      </span>
      <span className="text-sm">
        {entry.authorEmail ?? "—"} · {formatTimestamp(entry.at)}
      </span>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.provenanceTitle}
      className="max-w-lg"
    >
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && provenance && (
        <div className="flex flex-col gap-4">
          {provenance.sealed && (
            <span className="self-start border border-(--border) px-3 py-1 text-xs opacity-70">
              {t.provenanceSealed}
            </span>
          )}

          {provenance.created ? (
            renderEntry(t.provenanceCreated, provenance.created)
          ) : (
            <p className="text-sm opacity-40">{t.provenanceEmpty}</p>
          )}

          {provenance.modifications.length > 0 && (
            <div className="flex flex-col">
              <span className="text-xs uppercase tracking-widest opacity-50">
                {t.provenanceModified} ({provenance.modifications.length})
              </span>
              {provenance.modifications.map((entry) => (
                <div
                  key={entry.stateId}
                  className="flex flex-col gap-1 border-b border-(--border) py-2 last:border-b-0"
                >
                  <span className="text-sm">
                    {entry.authorEmail ?? "—"} · {formatTimestamp(entry.at)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs opacity-40">{t.provenanceGranularityNote}</p>
        </div>
      )}
    </Modal>
  );
}
