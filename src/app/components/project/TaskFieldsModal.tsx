"use client";
import React, { useEffect, useState } from "react";
import { Modal } from "@components/ui/Modal";
import { useI18n } from "@providers/I18nProvider";
import type { Field, Option } from "./KanbanSettingsModal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fields: Field[];
  values?: Record<string, string | undefined>;
  onSave: (values: Record<string, string | undefined>) => void;
  onOpenFieldPicker?: () => void;
}

export default function TaskFieldsModal({
  isOpen,
  onClose,
  fields,
  values,
  onSave,
  onOpenFieldPicker,
}: Props) {
  const { dict } = useI18n();
  const [local, setLocal] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    setLocal(values ? JSON.parse(JSON.stringify(values)) : {});
  }, [values, isOpen]);

  const setVal = (fieldId: string, v: string | undefined) => {
    setLocal((s) => ({ ...s, [fieldId]: v }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={dict.kanban.editFields}
      showCloseButton
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onOpenFieldPicker?.()}
            className="text-2xs text-accent px-2 py-1 border border-white/10 rounded"
          >
            {dict.kanban.selectFields}
          </button>
        </div>
        {fields.length === 0 ? (
          <div className="text-2xs opacity-50">
            {dict.kanban.noCustomFieldsConfigured}
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.id} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-2xs opacity-60 mb-1">{f.name}</div>

                  {f.type === "text" && (
                    <input
                      value={local[f.id] ?? ""}
                      onChange={(e) => setVal(f.id, e.target.value)}
                      className="w-full px-2 py-1 rounded bg-transparent border border-white/6"
                    />
                  )}

                  {f.type === "date" && (
                    <input
                      type="date"
                      value={local[f.id] ?? ""}
                      onChange={(e) => setVal(f.id, e.target.value)}
                      className="px-2 py-1 rounded bg-transparent border border-white/6"
                    />
                  )}

                  {f.type === "select" && (
                    <select
                      value={local[f.id] ?? ""}
                      onChange={(e) => setVal(f.id, e.target.value)}
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
                      value={local[f.id] ?? ""}
                      onChange={(e) => setVal(f.id, e.target.value)}
                      className="w-full px-2 py-1 rounded bg-transparent border border-white/6"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <button
            onClick={() => {
              onClose();
            }}
            className="px-3 py-1 rounded"
            type="button"
          >
            {dict.common.cancel}
          </button>
          <button
            onClick={() => {
              onSave(local);
              onClose();
            }}
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
