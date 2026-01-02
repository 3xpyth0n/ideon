"use client";

import { useI18n } from "@providers/I18nProvider";
import { Shield } from "lucide-react";
import { useState } from "react";
import { AuditTable } from "@components/audit/AuditTable";

interface AuditLog {
  id: string;
  action: string;
  status: string;
  userEmail: string | null;
  ipAddress: string | null;
  createdAt: string | unknown;
}

export default function AuditClient({
  logs: initialLogs,
}: {
  logs: AuditLog[];
}) {
  const { dict } = useI18n();
  const [logs] = useState(initialLogs);

  return (
    <div className="flex h-screen w-full flex-col overflow-y-auto bg-[var(--bg-page)] p-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 flex items-center gap-3">
          <Shield className="opacity-50" size={24} />
          <h1 className="text-2xl font-bold uppercase tracking-widest">
            {dict.common.securityAuditLog}
          </h1>
        </header>

        <AuditTable logs={logs} />
      </div>
    </div>
  );
}
