"use client";

import { useState } from "react";
import { useI18n } from "@providers/I18nProvider";
import { Download, FileJson, FileText } from "lucide-react";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { AuditLog } from "./AuditTable";

interface AuditExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: AuditLog[];
}

type ExportFormat = "json" | "csv";

export function AuditExportModal({
  isOpen,
  onClose,
  logs,
}: AuditExportModalProps) {
  const { dict } = useI18n();
  const [format, setFormat] = useState<ExportFormat>("json");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `audit-logs-${timestamp}`;

      // Prepare data with readable timestamps
      const dataToExport = logs.map((log) => ({
        timestamp: new Date(log.createdAt as string).toLocaleString(),
        action: log.action,
        status: log.status,
        email: log.userEmail || "-",
        ipAddress: log.ipAddress || "-",
      }));

      if (format === "json") {
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        downloadBlob(blob, `${filename}.json`);
      } else if (format === "csv") {
        // Simple CSV generation
        const headers = [
          "Timestamp",
          "Action",
          "Status",
          "Email",
          "IP Address",
        ];
        const csvContent = [
          headers.join(","),
          ...dataToExport.map((row) =>
            [
              `"${row.timestamp}"`,
              `"${row.action}"`,
              `"${row.status}"`,
              `"${row.email}"`,
              `"${row.ipAddress}"`,
            ].join(","),
          ),
        ].join("\n");
        const blob = new Blob([csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        downloadBlob(blob, `${filename}.csv`);
      }

      onClose();
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5" />
          {dict.common.exportLogs}
        </div>
      }
      subtitle={dict.common.selectFormat}
      className="max-w-md w-full"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <label className="modal-label">{dict.common.exportFormat}</label>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setFormat("json")}
              className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                format === "json"
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-white/10 hover:bg-white/5"
              }`}
            >
              <FileJson
                className={format === "json" ? "text-blue-500" : "opacity-50"}
              />
              <div className="flex flex-col">
                <span className="font-bold text-sm">
                  {dict.common.formatJson}
                </span>
              </div>
            </button>

            <button
              onClick={() => setFormat("csv")}
              className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                format === "csv"
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-white/10 hover:bg-white/5"
              }`}
            >
              <FileText
                className={format === "csv" ? "text-blue-500" : "opacity-50"}
              />
              <div className="flex flex-col">
                <span className="font-bold text-sm">
                  {dict.common.formatCsv}
                </span>
              </div>
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <Button
            onClick={onClose}
            disabled={exporting}
            className="btn-secondary"
          >
            {dict.common.cancel}
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting}
            className="btn-primary"
          >
            {exporting ? dict.common.loading : dict.common.export}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
