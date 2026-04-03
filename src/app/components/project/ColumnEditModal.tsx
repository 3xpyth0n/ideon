"use client";
import React, { useEffect, useState } from "react";
import { Modal } from "@components/ui/Modal";
import { useI18n } from "@providers/I18nProvider";
import type { ColumnDef } from "./KanbanSettingsModal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  column: ColumnDef | null;
  onSave: (patch: Partial<ColumnDef>) => void;
}

export default function ColumnEditModal({
  isOpen,
  onClose,
  column,
  onSave,
}: Props) {
  const { dict } = useI18n();
  const [title, setTitle] = useState<string>(column?.title || "");
  const [color, setColor] = useState<string>(column?.color || "#000000");
  const [description, setDescription] = useState<string>(
    column?.description || "",
  );

  useEffect(() => {
    if (isOpen) {
      setTitle(column?.title || "");
      setColor(column?.color || "#000000");
      setDescription(column?.description || "");
    }
  }, [isOpen, column]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={dict.kanban.editColumn}
      showCloseButton
    >
      <div className="space-y-4 text-left">
        <div className="p-2 bg-white/2 rounded-2xl flex items-center justify-center gap-2">
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              background: color,
            }}
          />
          <div className="text-sm font-semibold">{title || ""}</div>
        </div>

        <div>
          <div className="text-2xs opacity-60 mb-1">{dict.blocks.title}</div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={dict.kanban.defaultColumnTitle}
            className="w-full px-2 py-1 rounded bg-transparent border border-white/6 text-sm"
          />
        </div>

        <div>
          <div className="text-2xs opacity-60 mb-1">
            {dict.kanban.colorLabel}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-8 p-0 border-none"
            />
            <div className="flex gap-2">
              {[
                "#1f6feb",
                "#238636",
                "#db6f21",
                "#d73a49",
                "#6f42c1",
                "#a371f7",
                "#fb8532",
                "#0366d6",
              ].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ background: c }}
                  className="w-6 h-6 rounded-full border"
                />
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="text-2xs opacity-60 mb-1">
            {dict.blocks.description}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-2 py-1 rounded bg-transparent border border-white/6 text-2xs"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              onClose();
            }}
            className="px-3 py-1 rounded"
          >
            {dict.common.cancel}
          </button>
          <button
            onClick={() => {
              const nextTitle = title.trim() || column?.title || "";
              onSave({ title: nextTitle, color, description });
              onClose();
            }}
            className="px-3 py-1 rounded bg-accent text-white ring-1 ring-white/10"
          >
            {dict.common.save}
          </button>
        </div>
      </div>
    </Modal>
  );
}
