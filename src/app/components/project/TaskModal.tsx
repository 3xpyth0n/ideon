"use client";
import React, { useEffect, useRef, useState } from "react";
import { Modal } from "@components/ui/Modal";
import AssigneeCheckboxList from "./AssigneeCheckboxList";
import MarkdownEditor from "./MarkdownEditor";
import type { Field } from "./KanbanSettingsModal";

type UserProfile = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

type Task = {
  id: string;
  text: string;
  checked: boolean;
  assigneeIds?: string[];
  assigneeId?: string;
  assigneeName?: string;
  fields?: Record<string, string | undefined>;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  collaborators: UserProfile[];
  fields: Field[];
  tr: (path: string, fallback: string) => string;
  onSave: (task: Task) => void;
}

export default function TaskModal({
  isOpen,
  onClose,
  task,
  collaborators,
  fields,
  tr,
  onSave,
}: Props) {
  const [localTitle, setLocalTitle] = useState("");
  const [localDesc, setLocalDesc] = useState("");
  const [descEditing, setDescEditing] = useState(false);
  const [localAssignees, setLocalAssignees] = useState<string[]>([]);
  const [localFields, setLocalFields] = useState<
    Record<string, string | undefined>
  >({});
  const initializedTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      initializedTaskIdRef.current = null;
      setDescEditing(false);
      return;
    }
    if (!task) return;
    if (initializedTaskIdRef.current === task.id) return;
    initializedTaskIdRef.current = task.id;

    const lines = (task.text || "").split("\n");
    setLocalTitle(lines[0] || "");
    setLocalDesc(lines.slice(1).join("\n") || "");
    setDescEditing(false);
    setLocalAssignees(
      task.assigneeIds
        ? [...task.assigneeIds]
        : task.assigneeId
          ? [task.assigneeId]
          : [],
    );
    setLocalFields(task.fields ? { ...task.fields } : {});
  }, [isOpen, task]);

  if (!task) return null;

  const handleSave = () => {
    const merged: Task = {
      ...task,
      text: [localTitle, localDesc].filter((s) => s !== "").join("\n"),
      assigneeIds: localAssignees,
      fields: localFields,
    };
    onSave(merged);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tr("kanban.editTaskTitle", "Edit task")}
      showCloseButton
    >
      <div className="flex gap-4 text-left">
        <div className="w-64">
          <div className="text-2xs opacity-60 mb-2">
            {tr("kanban.assignees", "Assignees")}
          </div>
          <AssigneeCheckboxList
            collaborators={collaborators}
            value={localAssignees}
            onChange={setLocalAssignees}
          />

          <div className="mt-4 text-2xs opacity-60 mb-2">
            {tr("kanban.fields", "Fields")}
          </div>
          <div className="space-y-2">
            {fields.map((f) => (
              <div key={f.id} className="flex items-center gap-2">
                <div className="flex-1 text-2xs">{f.name}</div>
                <div className="flex-1">
                  {f.type === "number" ? (
                    <input
                      type="number"
                      value={localFields[f.id] ?? ""}
                      onChange={(e) =>
                        setLocalFields((s) => ({
                          ...s,
                          [f.id]: e.target.value,
                        }))
                      }
                      className="w-full px-2 py-1 rounded bg-transparent border border-white/6 text-2xs"
                    />
                  ) : f.type === "select" ? (
                    <select
                      value={localFields[f.id] ?? ""}
                      onChange={(e) =>
                        setLocalFields((s) => ({
                          ...s,
                          [f.id]: e.target.value,
                        }))
                      }
                      className="w-full rounded px-2 py-1 bg-white/5 text-2xs"
                    >
                      <option value="">—</option>
                      {(f.options || []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "date" ? (
                    <input
                      type="date"
                      value={localFields[f.id] ?? ""}
                      onChange={(e) =>
                        setLocalFields((s) => ({
                          ...s,
                          [f.id]: e.target.value,
                        }))
                      }
                      className="px-2 py-1 rounded bg-transparent border border-white/6 text-2xs"
                    />
                  ) : (
                    <input
                      className="w-full px-2 py-1 rounded bg-transparent border border-white/6 text-2xs"
                      value={localFields[f.id] ?? ""}
                      onChange={(e) =>
                        setLocalFields((s) => ({
                          ...s,
                          [f.id]: e.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1">
          <div className="mb-2">
            <input
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              className="w-full px-3 py-2 rounded bg-transparent border border-white/6 text-sm font-semibold"
              placeholder={tr("blocks.title", "Title")}
            />
          </div>
          <div>
            <div
              className={`relative w-full min-h-50 rounded p-3 text-sm ${
                descEditing
                  ? "bg-transparent border border-white/6"
                  : "bg-transparent"
              }`}
            >
              {!descEditing ? (
                <div className="pr-16 min-h-44">
                  <MarkdownEditor
                    content={localDesc}
                    isReadOnly
                    placeholder={tr(
                      "kanban.descriptionPlaceholder",
                      "Description (supports markdown)",
                    )}
                  />
                </div>
              ) : (
                <div className="pr-16 min-h-44">
                  <textarea
                    value={localDesc}
                    onChange={(e) => setLocalDesc(e.target.value)}
                    onBlur={() => setDescEditing(false)}
                    placeholder={tr(
                      "kanban.descriptionPlaceholder",
                      "Description (supports markdown)",
                    )}
                    className="w-full min-h-44 bg-transparent text-sm outline-none resize-y"
                  />
                </div>
              )}
              <button
                onClick={() => setDescEditing((v) => !v)}
                className="absolute top-3 right-3 px-2 py-1 rounded text-2xs border border-white/10 hover:bg-white/5"
              >
                {descEditing
                  ? tr("common.done", "Done")
                  : tr("common.edit", "Edit")}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button onClick={onClose} className="px-3 py-1 rounded">
              {tr("common.cancel", "Cancel")}
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 rounded bg-accent text-white ring-1 ring-white/10"
            >
              {tr("common.save", "Save")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
