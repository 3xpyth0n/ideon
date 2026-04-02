"use client";
import React, { useEffect, useState } from "react";
import { Modal } from "@components/ui/Modal";
import { useI18n } from "@providers/I18nProvider";
import type { Field, Option } from "./KanbanSettingsModal";

interface Column {
  id: string;
  title: string;
  tasks: unknown[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fields: Field[];
  columns: Column[];
  projectId?: string | undefined;
  blockId: string;
  onSaved?: (fields: Field[]) => void;
}

export default function FieldPickerModal({
  isOpen,
  onClose,
  fields,
  columns,
  projectId,
  blockId,
  onSaved,
}: Props) {
  const { dict } = useI18n();
  const [local, setLocal] = useState<Field[]>(() =>
    fields ? JSON.parse(JSON.stringify(fields)) : [],
  );

  useEffect(() => {
    if (isOpen) setLocal(fields ? JSON.parse(JSON.stringify(fields)) : []);
  }, [isOpen, fields]);

  const setVisible = (id: string, visible: boolean) =>
    setLocal((s) => s.map((f) => (f.id === id ? { ...f, visible } : f)));
  const setDefault = (id: string, v?: string) =>
    setLocal((s) =>
      s.map((f) => (f.id === id ? { ...f, defaultValue: v } : f)),
    );

  const handleSave = async () => {
    const metadata = JSON.stringify({ columns, fields: local });
    try {
      if (!projectId) throw new Error("projectId missing");
      const res = await fetch(`/api/projects/${projectId}/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata }),
      });
      if (!res.ok) throw new Error("failed to save");
      onSaved?.(local);
      onClose();
    } catch (err) {
      console.error("Failed to save block metadata", err);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={dict.kanban.selectFields}
      showCloseButton
    >
      <div className="space-y-4">
        {local.length === 0 ? (
          <div className="text-2xs opacity-50">
            {dict.kanban.noFieldsConfigured}
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {local.map((f) => (
              <div key={f.id} className="flex items-start gap-3">
                <div className="pt-2">
                  <input
                    type="checkbox"
                    checked={f.visible ?? true}
                    onChange={(e) => setVisible(f.id, e.target.checked)}
                  />
                </div>
                <div className="flex-1">
                  <div className="text-2xs opacity-60 mb-1">{f.name}</div>
                  {f.type === "text" && (
                    <input
                      value={f.defaultValue ?? ""}
                      onChange={(e) => setDefault(f.id, e.target.value)}
                      className="w-full px-2 py-1 rounded bg-transparent border border-white/6"
                    />
                  )}
                  {f.type === "date" && (
                    <input
                      type="date"
                      value={f.defaultValue ?? ""}
                      onChange={(e) => setDefault(f.id, e.target.value)}
                      className="px-2 py-1 rounded bg-transparent border border-white/6"
                    />
                  )}
                  {f.type === "select" && (
                    <select
                      value={f.defaultValue ?? ""}
                      onChange={(e) => setDefault(f.id, e.target.value)}
                      className="w-full rounded px-2 py-1 bg-white/5"
                    >
                      <option value="">—</option>
                      {(f.options || []).map((o: Option) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {f.type === "number" && (
                    <input
                      type="number"
                      value={f.defaultValue ?? ""}
                      onChange={(e) => setDefault(f.id, e.target.value)}
                      className="px-2 py-1 rounded bg-transparent border border-white/6"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-3 py-1 rounded" type="button">
            {dict.common.cancel}
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1 rounded bg-accent text-white ring-1 ring-white/10"
            type="button"
          >
            {dict.common.save}
          </button>
        </div>
      </div>
    </Modal>
  );
}
