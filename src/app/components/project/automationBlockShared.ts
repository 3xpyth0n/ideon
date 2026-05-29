export type BlockInfo = { id: string; title?: string; blockType: string };

export type ConditionOp =
  | "eq"
  | "neq"
  | "contains"
  | "exists"
  | "gt"
  | "lt"
  | "gte"
  | "lte";

export type Condition = {
  field: string;
  op: ConditionOp;
  value?: string;
};

export const SCHEDULE_PRESETS = [
  { label: "Every minute", value: "* * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at 9am", value: "0 9 * * *" },
  { label: "Every Monday 9am", value: "0 9 * * 1" },
  { label: "Custom…", value: "custom" },
] as const;

export function describeSchedule(expr: string): string {
  const preset = SCHEDULE_PRESETS.find(
    (p) => p.value === expr && p.value !== "custom",
  );
  return preset ? preset.label : expr;
}

export const CONDITION_OP_OPTIONS: {
  value: ConditionOp;
  label: string;
  numeric?: boolean;
}[] = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "contains", label: "has" },
  { value: "exists", label: "exists" },
  { value: "gt", label: ">", numeric: true },
  { value: "lt", label: "<", numeric: true },
  { value: "gte", label: ">=", numeric: true },
  { value: "lte", label: "<=", numeric: true },
];

export const ACTION_OPTIONS = [
  { value: "set_state", label: "Set state" },
  { value: "set_color", label: "Set color" },
  { value: "create_kanban_task", label: "Create Kanban task" },
  { value: "update_note", label: "Update note" },
] as const;

export const STATE_DOT: Record<string, string> = {
  success: "bg-green-500",
  error: "bg-red-500",
  warning: "bg-yellow-500",
  processing: "bg-blue-500",
};
