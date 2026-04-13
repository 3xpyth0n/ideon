import React from "react";

import type { TaskDependencyState } from "./kanbanModel";

type Props = {
  status: TaskDependencyState["status"];
  tr: (path: string, fallback: string) => string;
};

const STATUS_COPY: Record<
  Exclude<TaskDependencyState["status"], "clear">,
  { key: string; fallback: string; className: string }
> = {
  blocked: {
    key: "kanban.statusBlocked",
    fallback: "Blocked",
    className: "kb-task-status-blocked",
  },
  ready: {
    key: "kanban.statusReady",
    fallback: "Ready to unblock",
    className: "kb-task-status-ready",
  },
  blocking: {
    key: "kanban.statusBlocking",
    fallback: "Blocking others",
    className: "kb-task-status-blocking",
  },
  related: {
    key: "kanban.statusRelated",
    fallback: "Related",
    className: "kb-task-status-related",
  },
};

export default function TaskStatusBadge({ status, tr }: Props) {
  if (status === "clear") return null;

  const config = STATUS_COPY[status];

  return (
    <span className={`kb-task-status ${config.className}`}>
      {tr(config.key, config.fallback)}
    </span>
  );
}
