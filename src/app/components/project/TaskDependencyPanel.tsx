"use client";

import React, { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import TaskStatusBadge from "./TaskStatusBadge";
import {
  buildTaskLinkKey,
  formatTaskNumber,
  getTaskDependencyState,
  type KanbanTaskRecord,
  type LinkedTaskReference,
  type Task,
  type TaskRelationType,
} from "./kanbanModel";

interface Props {
  task: Task;
  currentBlockId: string;
  taskRecords: KanbanTaskRecord[];
  backlinks: KanbanTaskRecord[];
  value: LinkedTaskReference[];
  onChange: (nextValue: LinkedTaskReference[]) => void;
  onNavigateToTask?: (target: { blockId: string; taskId: string }) => void;
  tr: (path: string, fallback: string) => string;
}

type ResolvedLink = {
  key: string;
  link: LinkedTaskReference;
  record?: KanbanTaskRecord;
};

export default function TaskDependencyPanel({
  task,
  currentBlockId,
  taskRecords,
  backlinks,
  value,
  onChange,
  onNavigateToTask,
  tr,
}: Props) {
  const [search, setSearch] = useState("");

  const selectedMap = useMemo(
    () =>
      new Map(
        value.map((link) => [
          buildTaskLinkKey(link.blockId, link.taskId),
          link,
        ]),
      ),
    [value],
  );

  const dependencyState = useMemo(
    () =>
      getTaskDependencyState(
        {
          ...task,
          linkedTasks: value,
        },
        taskRecords,
        backlinks,
        currentBlockId,
      ),
    [backlinks, task, taskRecords, value],
  );

  const selectedLinks = useMemo<ResolvedLink[]>(() => {
    const recordMap = new Map(
      taskRecords.map((record) => [
        buildTaskLinkKey(record.blockId, record.taskId),
        record,
      ]),
    );

    return value.map((link) => ({
      key: buildTaskLinkKey(link.blockId, link.taskId),
      link,
      record: recordMap.get(buildTaskLinkKey(link.blockId, link.taskId)),
    }));
  }, [taskRecords, value]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return taskRecords.filter((record) => {
      if (record.blockId === currentBlockId && record.taskId === task.id) {
        return false;
      }

      if (selectedMap.has(buildTaskLinkKey(record.blockId, record.taskId))) {
        return false;
      }

      if (!query) return true;

      const label = [
        formatTaskNumber(record.taskNumber),
        record.title,
        record.blockTitle,
        record.columnTitle,
      ]
        .join(" ")
        .toLowerCase();

      return label.includes(query);
    });
  }, [currentBlockId, search, selectedMap, task.id, taskRecords]);

  const addLink = (record: KanbanTaskRecord) => {
    onChange([
      ...value,
      {
        blockId: record.blockId,
        taskId: record.taskId,
        taskNumber: record.taskNumber,
        title: record.title,
        blockTitle: record.blockTitle,
        relationType: "related",
      },
    ]);
    setSearch("");
  };

  const updateRelationType = (key: string, relationType: TaskRelationType) => {
    onChange(
      value.map((link) =>
        buildTaskLinkKey(link.blockId, link.taskId) === key
          ? { ...link, relationType }
          : link,
      ),
    );
  };

  const removeLink = (key: string) => {
    onChange(
      value.filter(
        (link) => buildTaskLinkKey(link.blockId, link.taskId) !== key,
      ),
    );
  };

  const navigateToTask = (target: { blockId: string; taskId: string }) => {
    onNavigateToTask?.(target);
  };

  const blockerLinks = selectedLinks.filter(
    ({ link }) => link.relationType === "blocked-by",
  );
  const relatedLinks = selectedLinks.filter(
    ({ link }) => link.relationType !== "blocked-by",
  );

  return (
    <section className="task-modal-panel">
      <div className="task-modal-panel-head">
        <div>
          <div className="task-modal-panel-title">
            {tr("kanban.dependencies", "Dependencies")}
          </div>
        </div>
        <TaskStatusBadge status={dependencyState.status} tr={tr} />
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
            {dependencyState.resolvedBlockers.length}
          </span>
          <span className="task-modal-stat-label">
            {tr("kanban.resolvedBlockers", "Resolved blockers")}
          </span>
        </div>
        <div className="task-modal-stat-card">
          <span className="task-modal-stat-value">
            {dependencyState.blockingTasks.length}
          </span>
          <span className="task-modal-stat-label">
            {tr("kanban.blocksOthers", "Blocking")}
          </span>
        </div>
      </div>

      <div className="task-modal-builder">
        <div className="task-modal-builder-head">
          <div className="task-modal-subtitle">
            {tr("kanban.addDependency", "Add a task relation")}
          </div>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr(
            "kanban.searchTasksPlaceholder",
            "Find a task by number or title",
          )}
          className="task-modal-input"
        />
        <div className="task-modal-list task-modal-list-compact">
          {filteredRecords.length > 0 ? (
            filteredRecords.slice(0, 8).map((record) => (
              <button
                key={buildTaskLinkKey(record.blockId, record.taskId)}
                type="button"
                className="task-modal-link-row"
                onClick={() => addLink(record)}
              >
                <span className="task-modal-link-copy">
                  <span className="task-modal-link-title">
                    {[formatTaskNumber(record.taskNumber), record.title]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                  <span className="task-modal-link-meta">
                    {record.blockTitle} · {record.columnTitle}
                  </span>
                </span>
                <span className="task-modal-add-pill">
                  <Plus size={12} />
                  {tr("kanban.addLink", "Add")}
                </span>
              </button>
            ))
          ) : (
            <div className="task-modal-empty">
              {tr("kanban.noLinkableTasks", "No other tasks are available yet")}
            </div>
          )}
        </div>
      </div>

      <div className="task-modal-groups">
        <div className="task-modal-group">
          <div className="task-modal-subtitle">
            {tr("kanban.blockedBy", "Blocked by")}
          </div>
          <div className="task-modal-list">
            {blockerLinks.length > 0 ? (
              blockerLinks.map(({ key, link, record }) => (
                <div key={key} className="task-modal-selected-row">
                  <div className="task-modal-link-copy">
                    <button
                      type="button"
                      className="task-modal-link-title task-modal-link-jump"
                      onClick={() =>
                        navigateToTask({
                          blockId: record?.blockId || link.blockId,
                          taskId: record?.taskId || link.taskId,
                        })
                      }
                      title={record?.title || link.title || undefined}
                    >
                      {[
                        formatTaskNumber(record?.taskNumber ?? link.taskNumber),
                        record?.title || link.title,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </button>
                    <span className="task-modal-link-meta">
                      {record?.blockTitle || link.blockTitle} ·{" "}
                      {record?.isDone
                        ? tr("kanban.completedState", "Done")
                        : tr("kanban.waitingState", "In progress")}
                    </span>
                  </div>
                  <div className="task-modal-row-actions">
                    <div className="task-modal-select-wrap task-modal-select-wrap-inline">
                      <select
                        value={link.relationType ?? "related"}
                        onChange={(e) =>
                          updateRelationType(
                            key,
                            e.target.value as TaskRelationType,
                          )
                        }
                        className="task-modal-select task-modal-select-inline"
                      >
                        <option value="blocked-by">
                          {tr("kanban.blockedBy", "Blocked by")}
                        </option>
                        <option value="related">
                          {tr("kanban.relatedTasks", "Related")}
                        </option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className="task-modal-icon-btn"
                      onClick={() => removeLink(key)}
                      aria-label={tr(
                        "kanban.removeTaskRelation",
                        "Remove relation",
                      )}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="task-modal-empty">
                {tr("kanban.noBlockers", "No blockers set")}
              </div>
            )}
          </div>
        </div>

        <div className="task-modal-group">
          <div className="task-modal-subtitle">
            {tr("kanban.relatedTasks", "Related tasks")}
          </div>
          <div className="task-modal-list">
            {relatedLinks.length > 0 ? (
              relatedLinks.map(({ key, link, record }) => (
                <div key={key} className="task-modal-selected-row">
                  <div className="task-modal-link-copy">
                    <button
                      type="button"
                      className="task-modal-link-title task-modal-link-jump"
                      onClick={() =>
                        navigateToTask({
                          blockId: record?.blockId || link.blockId,
                          taskId: record?.taskId || link.taskId,
                        })
                      }
                      title={record?.title || link.title || undefined}
                    >
                      {[
                        formatTaskNumber(record?.taskNumber ?? link.taskNumber),
                        record?.title || link.title,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </button>
                    <span className="task-modal-link-meta">
                      {record?.blockTitle || link.blockTitle}
                      {record?.columnTitle ? ` · ${record.columnTitle}` : ""}
                    </span>
                  </div>
                  <div className="task-modal-row-actions">
                    <div className="task-modal-select-wrap task-modal-select-wrap-inline">
                      <select
                        value={link.relationType ?? "related"}
                        onChange={(e) =>
                          updateRelationType(
                            key,
                            e.target.value as TaskRelationType,
                          )
                        }
                        className="task-modal-select task-modal-select-inline"
                      >
                        <option value="blocked-by">
                          {tr("kanban.blockedBy", "Blocked by")}
                        </option>
                        <option value="related">
                          {tr("kanban.relatedTasks", "Related")}
                        </option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className="task-modal-icon-btn"
                      onClick={() => removeLink(key)}
                      aria-label={tr(
                        "kanban.removeTaskRelation",
                        "Remove relation",
                      )}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="task-modal-empty">
                {tr("kanban.noRelatedTasks", "No related tasks yet")}
              </div>
            )}
          </div>
        </div>

        <div className="task-modal-group">
          <div className="task-modal-subtitle">
            {tr("kanban.referencedBy", "Referenced by")}
          </div>
          <div className="task-modal-list">
            {backlinks.length > 0 ? (
              backlinks.map((record) => (
                <div
                  key={buildTaskLinkKey(record.blockId, record.taskId)}
                  className="task-modal-selected-row"
                >
                  <div className="task-modal-link-copy">
                    <button
                      type="button"
                      className="task-modal-link-title task-modal-link-jump"
                      onClick={() =>
                        navigateToTask({
                          blockId: record.blockId,
                          taskId: record.taskId,
                        })
                      }
                      title={record.title}
                    >
                      {[formatTaskNumber(record.taskNumber), record.title]
                        .filter(Boolean)
                        .join(" ")}
                    </button>
                    <span className="task-modal-link-meta">
                      {record.blockTitle} · {record.columnTitle}
                    </span>
                  </div>
                  <TaskStatusBadge
                    status={
                      record.linkedTasks.some(
                        (link) =>
                          link.relationType === "blocked-by" &&
                          link.blockId === currentBlockId &&
                          link.taskId === task.id,
                      )
                        ? "blocking"
                        : "related"
                    }
                    tr={tr}
                  />
                </div>
              ))
            ) : (
              <div className="task-modal-empty">
                {tr(
                  "kanban.noBacklinks",
                  "No linked tasks reference this task yet",
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
