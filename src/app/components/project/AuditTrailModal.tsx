"use client";

import { useCallback, useEffect, useState, Fragment } from "react";
import { useI18n } from "@providers/I18nProvider";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";

interface AuditEvent {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  metadata: string;
  createdAt: string;
  userId: string | null;
  userEmail: string | null;
}

interface ChainStatus {
  valid: boolean;
  entries: number;
  brokenAt: string | null;
}

type ChainState = "verifying" | "verified" | "broken";

const PAGE_SIZE = 50;

export function AuditTrailModal({
  isOpen,
  onClose,
  projectId,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const { dict } = useI18n();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [chainState, setChainState] = useState<ChainState>("verifying");
  const [chainEntries, setChainEntries] = useState(0);
  const [brokenAt, setBrokenAt] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEvents = useCallback(
    async (before?: string) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (before) params.set("before", before);
      if (actionFilter) params.set("action", actionFilter);
      if (userFilter) params.set("userId", userFilter);

      const res = await fetch(`/api/projects/${projectId}/audit?${params}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        events: AuditEvent[];
        hasMore: boolean;
      };
      return data;
    },
    [projectId, actionFilter, userFilter],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEvents();
      setEvents(data.events);
      setHasMore(data.hasMore);
    } catch {
      setEvents([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [fetchEvents]);

  const handleLoadMore = async () => {
    const last = events[events.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchEvents(last.id);
      setEvents((prev) => [...prev, ...data.events]);
      setHasMore(data.hasMore);
    } catch {
      // keep the current list on failure
    } finally {
      setLoadingMore(false);
    }
  };

  const verifyChain = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/audit/verify`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as ChainStatus;
      setChainState(data.valid ? "verified" : "broken");
      setChainEntries(data.entries);
      setBrokenAt(data.brokenAt);
    } catch {
      setChainState("broken");
      setBrokenAt(null);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      load();
      verifyChain();
    } else {
      setActionFilter("");
      setUserFilter("");
      setExpandedId(null);
    }
  }, [isOpen, load, verifyChain]);

  const distinctActions = Array.from(
    new Set(events.map((event) => event.action)),
  ).sort();
  const distinctUsers = Array.from(
    new Set(
      events
        .filter((event) => event.userId)
        .map((event) => `${event.userId}::${event.userEmail ?? ""}`),
    ),
  ).sort();

  const formatMetadata = (raw: string) => {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={dict.project.auditTitle}
      subtitle={dict.project.auditSubtitle}
      className="max-w-5xl w-full"
    >
      <div className="flex flex-col gap-6 mt-8 text-left">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {chainState === "verifying" && (
            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-widest opacity-50">
              <Loader2 className="animate-spin" size={14} />
              {dict.project.auditChainVerifying}
            </span>
          )}
          {chainState === "verified" && (
            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-(--text-main)">
              <ShieldCheck size={14} />
              {dict.project.auditChainVerified} · {chainEntries}
            </span>
          )}
          {chainState === "broken" && (
            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-red-500">
              <ShieldAlert size={14} />
              {dict.project.auditChainBroken}
            </span>
          )}
        </div>

        {chainState === "broken" && (
          <div className="border border-red-500/40 bg-red-500/5 p-4 text-xs">
            <p className="font-bold uppercase tracking-widest text-red-500">
              {dict.project.auditChainBroken}
            </p>
            {brokenAt && (
              <p className="mt-1 font-mono opacity-60">
                {dict.project.auditBrokenAt}: {brokenAt}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-50">
            {dict.project.auditFilterAction}
            <select
              className="bg-transparent border border-(--border) p-1 text-xs"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">{dict.project.auditFilterAll}</option>
              {distinctActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-50">
            {dict.project.auditFilterUser}
            <select
              className="bg-transparent border border-(--border) p-1 text-xs"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <option value="">{dict.project.auditFilterAll}</option>
              {distinctUsers.map((entry) => {
                const [userId, email] = entry.split("::");
                return (
                  <option key={userId} value={userId}>
                    {email || userId}
                  </option>
                );
              })}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto border border-(--border) bg-(--island-bg)">
          <table className="w-full text-left text-sm">
            <thead className="bg-(--bg-sidebar) uppercase tracking-wider text-[10px] font-bold text-(--text-muted)">
              <tr>
                <th className="p-4 border-b border-(--border)">
                  {dict.project.auditTimestamp}
                </th>
                <th className="p-4 border-b border-(--border)">
                  {dict.project.auditActor}
                </th>
                <th className="p-4 border-b border-(--border)">
                  {dict.project.auditAction}
                </th>
                <th className="p-4 border-b border-(--border)">
                  {dict.project.auditSummary}
                </th>
                <th className="p-4 border-b border-(--border)" />
              </tr>
            </thead>
            <tbody className="divide-y divide-(--border)">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <Loader2
                      className="animate-spin mx-auto opacity-20"
                      size={24}
                    />
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <Fragment key={event.id}>
                    <tr className="hover:bg-(--bg-sidebar) transition-colors">
                      <td className="p-4 font-mono opacity-50 text-[12px] whitespace-nowrap">
                        {new Date(event.createdAt).toLocaleString()}
                      </td>
                      <td className="p-4 font-mono text-[11px] opacity-40">
                        {event.userEmail || dict.project.auditSystem}
                      </td>
                      <td className="p-4 font-bold text-(--text-main) whitespace-nowrap">
                        {event.action}
                      </td>
                      <td className="p-4 text-[12px]">{event.summary}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() =>
                            setExpandedId(
                              expandedId === event.id ? null : event.id,
                            )
                          }
                          className="opacity-40 hover:opacity-100 transition-opacity"
                          aria-label={dict.project.auditMetadata}
                        >
                          {expandedId === event.id ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </button>
                      </td>
                    </tr>
                    {expandedId === event.id && (
                      <tr>
                        <td colSpan={5} className="p-4 bg-(--bg-sidebar)">
                          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all opacity-70">
                            {formatMetadata(event.metadata)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
              {!loading && events.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 text-center opacity-30 uppercase tracking-widest text-xs"
                  >
                    {dict.project.auditEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="text-xs uppercase tracking-widest"
            >
              {loadingMore ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                dict.project.auditLoadMore
              )}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
