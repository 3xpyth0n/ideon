"use client";

import React, { useEffect, useState } from "react";
import { Modal } from "@components/ui/Modal";
import { useI18n } from "@providers/I18nProvider";
import { Plus, Trash2, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { GoSingleSelect } from "react-icons/go";
import { BsCalendar2Date } from "react-icons/bs";
import { TbNumber } from "react-icons/tb";

import type {
  Column as ColumnDef,
  Field,
  FieldType,
  Option,
  Task,
} from "./kanbanModel";

export type { ColumnDef, Field, FieldType, Option, Task };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialFields?: Field[];
  initialColumns?: ColumnDef[];
  onSave: (columns: ColumnDef[], fields: Field[]) => void;
}

export default function KanbanSettingsModal({
  isOpen,
  onClose,
  initialFields,
  initialColumns,
  onSave,
}: Props) {
  const { dict } = useI18n();
  const [fields, setFields] = useState<Field[]>(() =>
    initialFields ? JSON.parse(JSON.stringify(initialFields)) : [],
  );
  const [columnsState, setColumnsState] = useState<ColumnDef[]>(() =>
    initialColumns ? JSON.parse(JSON.stringify(initialColumns)) : [],
  );

  useEffect(() => {
    if (isOpen) {
      setFields(initialFields ? JSON.parse(JSON.stringify(initialFields)) : []);
      setColumnsState(
        initialColumns ? JSON.parse(JSON.stringify(initialColumns)) : [],
      );
    }
  }, [isOpen, initialFields, initialColumns]);

  const reorderArray = <T extends { id: string }>(
    arr: T[],
    fromId: string,
    toId: string,
  ) => {
    const from = arr.findIndex((x) => x.id === fromId);
    const to = arr.findIndex((x) => x.id === toId);
    if (from === -1 || to === -1) return arr;
    const copy = arr.slice();
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  };

  const addField = () => {
    setFields((s) => [
      ...s,
      {
        id: `f-${Math.random().toString(36).slice(2, 9)}`,
        name: dict.kanban.newField,
        type: "text",
        color: "#666666",
      },
    ]);
  };

  const removeField = (id: string) =>
    setFields((s) => s.filter((f) => f.id !== id));

  const moveField = (id: string, dir: 1 | -1) => {
    setFields((s) => {
      const i = s.findIndex((x) => x.id === id);
      if (i === -1) return s;
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = s.slice();
      const tmp = next[i];
      next[i] = next[j];
      next[j] = tmp;
      return next;
    });
  };

  const updateField = (id: string, patch: Partial<Field>) =>
    setFields((s) => s.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const addOption = (id: string) =>
    setFields((s) =>
      s.map((f) =>
        f.id === id
          ? {
              ...f,
              options: [
                ...(f.options || []),
                {
                  id: `o-${Math.random().toString(36).slice(2, 9)}`,
                  label: dict.kanban.optionLabel,
                  color: "#666666",
                  description: "",
                },
              ],
            }
          : f,
      ),
    );

  const updateOption = (id: string, idx: number, label: string) =>
    setFields((s) =>
      s.map((f) =>
        f.id === id
          ? {
              ...f,
              options: (f.options || []).map((o, i) =>
                i !== idx ? o : { ...o, label },
              ),
            }
          : f,
      ),
    );

  const updateOptionColor = (id: string, idx: number, color: string) =>
    setFields((s) =>
      s.map((f) =>
        f.id === id
          ? {
              ...f,
              options: (f.options || []).map((o, i) =>
                i !== idx ? o : { ...o, color },
              ),
            }
          : f,
      ),
    );

  const updateOptionDescription = (
    id: string,
    idx: number,
    description: string,
  ) =>
    setFields((s) =>
      s.map((f) =>
        f.id === id
          ? {
              ...f,
              options: (f.options || []).map((o, i) =>
                i !== idx ? o : { ...o, description },
              ),
            }
          : f,
      ),
    );

  const removeOption = (id: string, idx: number) =>
    setFields((s) =>
      s.map((f) =>
        f.id === id
          ? { ...f, options: (f.options || []).filter((_, i) => i !== idx) }
          : f,
      ),
    );

  const moveOption = (id: string, idx: number, dir: 1 | -1) =>
    setFields((s) =>
      s.map((f) => {
        if (f.id !== id) return f;
        const opts = (f.options || []).slice();
        const j = idx + dir;
        if (j < 0 || j >= opts.length) return f;
        const tmp = opts[idx];
        opts[idx] = opts[j];
        opts[j] = tmp;
        return { ...f, options: opts };
      }),
    );

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedFieldId((prev) => prev ?? fields[0]?.id ?? null);
    }
  }, [isOpen, fields]);

  const selectedField =
    fields.find((x) => x.id === selectedFieldId) || fields[0] || null;

  // drag state
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  const [dragOptionInfo, setDragOptionInfo] = useState<{
    fieldId: string;
    optionId: string;
  } | null>(null);

  const reorderField = (fromId: string, toId: string) =>
    setFields((s) => reorderArray(s, fromId, toId));
  const reorderOption = (fieldId: string, fromId: string, toId: string) =>
    setFields((s) =>
      s.map((f) => {
        if (f.id !== fieldId) return f;
        const opts = (f.options || []) as Option[];
        const next = reorderArray(opts, fromId, toId);
        return { ...f, options: next };
      }),
    );

  const handleSave = async () => {
    try {
      const res = onSave(columnsState, fields) as Promise<unknown> | void;
      if (res && typeof (res as Promise<unknown>).then === "function")
        (await res) as Promise<unknown>;
      onClose();
    } catch (err) {
      console.error("[KanbanSettingsModal] Save failed", err);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={dict.kanban.boardSettings}
      showCloseButton
    >
      <div className="flex gap-4">
        <div className="w-72 border-r pr-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-sm font-semibold">{dict.kanban.fields}</div>
            </div>
            <div>
              <button
                onClick={() => addField()}
                className="flex items-center gap-2 px-2 py-1 rounded bg-white/5"
                type="button"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className="space-y-1 overflow-y-auto max-h-[60vh]">
            {fields.map((f) => (
              <button
                key={f.id}
                draggable
                onDragStart={() => setDragFieldId(f.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragFieldId && dragFieldId !== f.id)
                    reorderField(dragFieldId, f.id);
                  setDragFieldId(null);
                }}
                onClick={() => setSelectedFieldId(f.id)}
                className={`w-full text-left px-2 py-1 rounded flex items-center justify-between ${
                  selectedFieldId === f.id ? "bg-white/4" : "hover:bg-white/2"
                }`}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <div className="opacity-60">
                    {f.type === "select" ? (
                      <GoSingleSelect size={20} />
                    ) : f.type === "number" ? (
                      <TbNumber size={20} />
                    ) : f.type === "date" ? (
                      <BsCalendar2Date size={20} />
                    ) : (
                      <span className="text-2xs">Aa</span>
                    )}
                  </div>
                  <div
                    className={`text-2xs truncate max-w-35 ${
                      selectedFieldId === f.id ? "font-semibold underline" : ""
                    }`}
                  >
                    {f.name}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-60">
                  <button
                    type="button"
                    className="p-1 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveField(f.id, -1);
                    }}
                    title={dict.kanban.moveUp}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      moveField(f.id, 1);
                    }}
                    title={dict.kanban.moveDown}
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1">
          {!selectedField ? (
            <div className="text-2xs opacity-60">
              {dict.kanban.selectFieldHint}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  value={selectedField.name}
                  onChange={(e) =>
                    updateField(selectedField.id, { name: e.target.value })
                  }
                  className="flex-1 min-w-0 px-2 py-1 rounded bg-transparent border border-white/6"
                />
                <select
                  value={selectedField.type}
                  onChange={(e) => {
                    updateField(selectedField.id, {
                      type: e.target.value as FieldType,
                      options:
                        e.target.value === "select"
                          ? selectedField.options || [
                              {
                                id: `o-${Math.random()
                                  .toString(36)
                                  .slice(2, 9)}`,
                                label: dict.kanban.optionLabel,
                                color: "#666666",
                                description: "",
                              },
                            ]
                          : undefined,
                    });
                  }}
                  className="px-2 py-1 rounded bg-transparent border border-white/6"
                >
                  <option value="text">{dict.kanban.fieldTypeText}</option>
                  <option value="date">{dict.kanban.fieldTypeDate}</option>
                  <option value="select">
                    {dict.kanban.fieldTypeSingleSelect}
                  </option>
                  <option value="number">{dict.kanban.fieldTypeNumber}</option>
                </select>
                <button
                  className="p-1 rounded"
                  onClick={() => removeField(selectedField.id)}
                  title={dict.kanban.removeField}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {selectedField.type !== "select" && (
                <div className="flex items-center gap-2">
                  <label className="text-2xs opacity-70">
                    {dict.kanban.colorLabel}
                  </label>
                  <input
                    type="color"
                    value={selectedField.color || "#666666"}
                    onChange={(e) =>
                      updateField(selectedField.id, { color: e.target.value })
                    }
                    className="w-8 h-8 p-0 border-none"
                    title={dict.kanban.fieldColor}
                  />
                </div>
              )}

              {selectedField.type === "select" && (
                <div className="space-y-2">
                  {(selectedField.options || []).map((opt, i) => (
                    <div
                      key={opt.id}
                      className="p-2 border rounded bg-white/2"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (
                          dragOptionInfo &&
                          dragOptionInfo.fieldId === selectedField.id &&
                          dragOptionInfo.optionId !== opt.id
                        )
                          reorderOption(
                            selectedField.id,
                            dragOptionInfo.optionId,
                            opt.id,
                          );
                        setDragOptionInfo(null);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="p-1 rounded cursor-grab opacity-60 hover:opacity-100"
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            setDragOptionInfo({
                              fieldId: selectedField.id,
                              optionId: opt.id,
                            });
                          }}
                          title={dict.common.dragToReorder}
                          aria-label={dict.common.dragToReorder}
                        >
                          <GripVertical size={12} />
                        </button>
                        <input
                          value={opt.label}
                          onChange={(e) =>
                            updateOption(selectedField.id, i, e.target.value)
                          }
                          className="flex-1 min-w-0 px-2 py-1 rounded bg-transparent border border-white/6"
                        />
                        <input
                          type="color"
                          value={opt.color || "#666666"}
                          onChange={(e) =>
                            updateOptionColor(
                              selectedField.id,
                              i,
                              e.target.value,
                            )
                          }
                          className="w-8 h-8 p-0 border-none"
                          title={dict.kanban.optionColor}
                        />
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="p-1 rounded"
                            onClick={() => moveOption(selectedField.id, i, -1)}
                            title={dict.kanban.moveUp}
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            type="button"
                            className="p-1 rounded"
                            onClick={() => moveOption(selectedField.id, i, 1)}
                            title={dict.kanban.moveDown}
                          >
                            <ArrowDown size={12} />
                          </button>
                          <button
                            className="p-1 rounded"
                            onClick={() => removeOption(selectedField.id, i)}
                            type="button"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={opt.description || ""}
                        onChange={(e) =>
                          updateOptionDescription(
                            selectedField.id,
                            i,
                            e.target.value,
                          )
                        }
                        placeholder={dict.project.projectDescriptionOptional}
                        className="w-full mt-2 px-2 py-1 rounded bg-transparent border border-white/6 text-2xs"
                      />
                    </div>
                  ))}
                  <div>
                    <button
                      onClick={() => addOption(selectedField.id)}
                      className="mt-1 px-2 py-1 rounded bg-white/5 text-2xs"
                      type="button"
                    >
                      {dict.kanban.addOption}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <button
              onClick={() => {
                setFields(
                  initialFields
                    ? JSON.parse(JSON.stringify(initialFields))
                    : [],
                );
                setColumnsState(
                  initialColumns
                    ? JSON.parse(JSON.stringify(initialColumns))
                    : [],
                );
                onClose();
              }}
              className="px-3 py-1 rounded"
              type="button"
            >
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
      </div>
    </Modal>
  );
}
