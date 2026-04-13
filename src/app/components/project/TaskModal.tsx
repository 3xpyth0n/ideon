"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@components/ui/Modal";
import AssigneeCheckboxList from "./AssigneeCheckboxList";
import MarkdownEditor from "./MarkdownEditor";
import TaskDependencyPanel from "./TaskDependencyPanel";
import TaskStatusBadge from "./TaskStatusBadge";
import {
  formatTaskNumber,
  getTaskDependencyState,
  type Field,
  type KanbanTaskRecord,
  type LinkedTaskReference,
  type Task,
} from "./kanbanModel";

type UserProfile = {
  id: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  collaborators: UserProfile[];
  fields: Field[];
  tr: (path: string, fallback: string) => string;
  onSave: (task: Task) => void;
  onNavigateToTask?: (target: { blockId: string; taskId: string }) => void;
  currentBlockId: string;
  taskRecords: KanbanTaskRecord[];
  backlinks: KanbanTaskRecord[];
}

export default function TaskModal({
  isOpen,
  onClose,
  task,
  collaborators,
  fields,
  tr,
  onSave,
  onNavigateToTask,
  currentBlockId,
  taskRecords,
  backlinks,
}: Props) {
  const [localTitle, setLocalTitle] = useState("");
  const [localDesc, setLocalDesc] = useState("");
  const [descEditing, setDescEditing] = useState(false);
  const [localAssignees, setLocalAssignees] = useState<string[]>([]);
  const [localFields, setLocalFields] = useState<
    Record<string, string | undefined>
  >({});
  const [localLinkedTasks, setLocalLinkedTasks] = useState<
    LinkedTaskReference[]
  >([]);
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
    setLocalLinkedTasks(task.linkedTasks ? [...task.linkedTasks] : []);
  }, [isOpen, task]);

  const draftTask = useMemo(
    () =>
      task
        ? {
            ...task,
            linkedTasks: localLinkedTasks,
          }
        : null,
    [localLinkedTasks, task],
  );

  const dependencyState = useMemo(
    () =>
      draftTask
        ? getTaskDependencyState(
            draftTask,
            taskRecords,
            backlinks,
            currentBlockId,
          )
        : null,
    [backlinks, draftTask, taskRecords],
  );

  if (!task || !draftTask || !dependencyState) return null;

  const handleSave = () => {
    const merged: Task = {
      ...task,
      text: [localTitle, localDesc].filter((s) => s !== "").join("\n"),
      assigneeIds: localAssignees,
      fields: localFields,
      linkedTasks: localLinkedTasks.length > 0 ? localLinkedTasks : undefined,
    };
    onSave(merged);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tr("kanban.editTaskTitle", "Edit task")}
      className="task-modal-dashboard-modal"
      showCloseButton
    >
      <div className="task-modal-dashboard">
        <div className="task-modal-hero">
          <div className="task-modal-hero-copy">
            <div className="task-modal-panel-title">
              {typeof task.taskNumber === "number"
                ? `${tr("kanban.taskNumber", "Task number")} ${formatTaskNumber(
                    task.taskNumber,
                  )}`
                : tr("kanban.workflowStatus", "Workflow")}
            </div>
            <div className="task-modal-hero-head">
              <div className="task-modal-hero-title-wrap">
                <div className="task-modal-hero-title">
                  {localTitle || tr("kanban.addTask", "Task")}
                </div>
                <TaskStatusBadge status={dependencyState.status} tr={tr} />
              </div>
            </div>
          </div>

          <div className="task-modal-stats-grid">
            <div className="task-modal-stat-card">
              <span className="task-modal-stat-value">
                {dependencyState.activeBlockers.length}
              </span>
              <span className="task-modal-stat-label">
                {tr("kanban.activeBlockers", "Active blockers")}
              </span>
            </div>
            <div className="task-modal-stat-card">
              <span className="task-modal-stat-value">
                {localLinkedTasks.length}
              </span>
              <span className="task-modal-stat-label">
                {tr("kanban.linkedTasks", "Linked tasks")}
              </span>
            </div>
            <div className="task-modal-stat-card">
              <span className="task-modal-stat-value">{backlinks.length}</span>
              <span className="task-modal-stat-label">
                {tr("kanban.referencedBy", "Referenced by")}
              </span>
            </div>
          </div>
        </div>

        <div className="task-modal-layout">
          <div className="task-modal-main">
            <section className="task-modal-panel">
              <div className="task-modal-panel-head">
                <div>
                  <div className="task-modal-panel-title">
                    {tr("kanban.taskDetails", "Task details")}
                  </div>
                </div>
              </div>

              <div className="task-modal-field">
                <label className="task-modal-label">
                  {tr("blocks.title", "Title")}
                </label>
                <input
                  value={localTitle}
                  onChange={(e) => setLocalTitle(e.target.value)}
                  className="task-modal-input task-modal-title-input"
                  placeholder={tr("blocks.title", "Title")}
                />
              </div>

              <div className="task-modal-field">
                <div className="task-modal-field-head">
                  <label className="task-modal-label">
                    {tr("kanban.descriptionLabel", "Description")}
                  </label>
                  <button
                    type="button"
                    onClick={() => setDescEditing((value) => !value)}
                    className="task-modal-secondary-btn"
                  >
                    {descEditing
                      ? tr("common.done", "Done")
                      : tr("common.edit", "Edit")}
                  </button>
                </div>
                <div
                  className={`task-modal-editor ${
                    descEditing ? "is-editing" : ""
                  }`}
                >
                  {!descEditing ? (
                    <MarkdownEditor
                      content={localDesc}
                      isReadOnly
                      placeholder={tr(
                        "kanban.descriptionPlaceholder",
                        "Description (supports markdown)",
                      )}
                    />
                  ) : (
                    <textarea
                      value={localDesc}
                      onChange={(e) => setLocalDesc(e.target.value)}
                      onBlur={() => setDescEditing(false)}
                      placeholder={tr(
                        "kanban.descriptionPlaceholder",
                        "Description (supports markdown)",
                      )}
                      className="task-modal-textarea"
                    />
                  )}
                </div>
              </div>
            </section>

            <TaskDependencyPanel
              task={draftTask}
              currentBlockId={currentBlockId}
              taskRecords={taskRecords}
              backlinks={backlinks}
              value={localLinkedTasks}
              onChange={setLocalLinkedTasks}
              onNavigateToTask={onNavigateToTask}
              tr={tr}
            />
          </div>

          <aside className="task-modal-sidebar">
            <section className="task-modal-panel">
              <div className="task-modal-panel-head">
                <div>
                  <div className="task-modal-panel-title">
                    {tr("kanban.assignees", "Assignees")}
                  </div>
                </div>
              </div>
              <AssigneeCheckboxList
                collaborators={collaborators}
                value={localAssignees}
                onChange={setLocalAssignees}
              />
            </section>

            <section className="task-modal-panel">
              <div className="task-modal-panel-head">
                <div>
                  <div className="task-modal-panel-title">
                    {tr("kanban.fields", "Fields")}
                  </div>
                </div>
              </div>
              <div className="task-modal-field-list">
                {fields.length > 0 ? (
                  fields.map((f) => (
                    <label key={f.id} className="task-modal-field-row">
                      <span className="task-modal-field-name">{f.name}</span>
                      {f.type === "number" ? (
                        <input
                          type="number"
                          value={localFields[f.id] ?? ""}
                          onChange={(e) =>
                            setLocalFields((state) => ({
                              ...state,
                              [f.id]: e.target.value,
                            }))
                          }
                          className="task-modal-input"
                        />
                      ) : f.type === "select" ? (
                        <div className="task-modal-select-wrap">
                          <select
                            value={localFields[f.id] ?? ""}
                            onChange={(e) =>
                              setLocalFields((state) => ({
                                ...state,
                                [f.id]: e.target.value,
                              }))
                            }
                            className="task-modal-select"
                          >
                            <option value="">—</option>
                            {(f.options || []).map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : f.type === "date" ? (
                        <input
                          type="date"
                          value={localFields[f.id] ?? ""}
                          onChange={(e) =>
                            setLocalFields((state) => ({
                              ...state,
                              [f.id]: e.target.value,
                            }))
                          }
                          className="task-modal-input"
                        />
                      ) : (
                        <input
                          value={localFields[f.id] ?? ""}
                          onChange={(e) =>
                            setLocalFields((state) => ({
                              ...state,
                              [f.id]: e.target.value,
                            }))
                          }
                          className="task-modal-input"
                        />
                      )}
                    </label>
                  ))
                ) : (
                  <div className="task-modal-empty">
                    {tr("kanban.noFieldsConfigured", "No fields configured.")}
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>

        <div className="task-modal-actions-row">
          <button
            type="button"
            onClick={onClose}
            className="task-modal-ghost-btn"
          >
            {tr("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="task-modal-primary-btn"
          >
            {tr("common.save", "Save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
