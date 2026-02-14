"use client";

import { useI18n } from "@providers/I18nProvider";
import { Loader2 } from "lucide-react";

export interface AuditLog {
  id: string;
  action: string;
  status: string;
  userEmail: string | null;
  ipAddress: string | null;
  createdAt: string | unknown;
}

interface AuditTableProps {
  logs: AuditLog[];
  loading?: boolean;
}

export function AuditTable({ logs, loading }: AuditTableProps) {
  const { dict } = useI18n();

  return (
    <div className="overflow-x-auto border border-[var(--border)] bg-[var(--island-bg)]">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--bg-sidebar)] uppercase tracking-wider text-[10px] font-bold text-[var(--text-muted)]">
          <tr>
            <th className="p-4 border-b border-[var(--border)]">
              {dict.management.timestamp}
            </th>
            <th className="p-4 border-b border-[var(--border)]">
              {dict.management.action}
            </th>
            <th className="p-4 border-b border-[var(--border)]">
              {dict.management.status}
            </th>
            <th className="p-4 border-b border-[var(--border)]">
              {dict.auth.email}
            </th>
            <th className="p-4 border-b border-[var(--border)]">
              {dict.modals.ipAddress}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
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
            logs.map((log) => {
              const isSuccess = log.status === "success";
              const displayIp =
                log.ipAddress === "127.0.0.1" ||
                log.ipAddress === "::1" ||
                log.ipAddress === "::ffff:127.0.0.1"
                  ? "localhost"
                  : log.ipAddress;

              return (
                <tr
                  key={log.id}
                  className="hover:bg-[var(--bg-sidebar)] transition-colors"
                >
                  <td className="p-4 font-mono opacity-50 text-[12px]">
                    {new Date(log.createdAt as string).toLocaleString()}
                  </td>
                  <td className="p-4 font-bold text-[var(--text-main)]">
                    {log.action}
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center px-2 py-1 text-[9px] uppercase font-extrabold tracking-widest border ${
                        isSuccess ? "auditStatusSuccess" : "auditStatusFailure"
                      }`}
                    >
                      {isSuccess ? dict.common.success : dict.modals.failure}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-[11px] opacity-40">
                    {log.userEmail || "-"}
                  </td>
                  <td className="p-4 font-mono text-[11px] opacity-40">
                    {displayIp || "-"}
                  </td>
                </tr>
              );
            })
          )}
          {!loading && logs.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="py-12 text-center opacity-30 uppercase tracking-widest text-xs"
              >
                {dict.modals.noLogs}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
