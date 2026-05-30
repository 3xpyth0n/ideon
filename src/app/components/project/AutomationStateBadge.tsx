"use client";

import { Loader2, Check, AlertTriangle, X } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";

type AutomationState = "processing" | "success" | "warning" | "error";

const STATE_CONFIG: Record<
  AutomationState,
  {
    borderColor: string;
    badgeBg: string;
    badgeText: string;
    Icon: React.ComponentType<{ size?: number; className?: string }> | null;
  }
> = {
  processing: {
    borderColor: "bg-blue-500",
    badgeBg: "bg-blue-500/15",
    badgeText: "text-blue-500",
    Icon: Loader2,
  },
  success: {
    borderColor: "bg-green-500",
    badgeBg: "bg-green-500/15",
    badgeText: "text-green-500",
    Icon: Check,
  },
  warning: {
    borderColor: "bg-yellow-500",
    badgeBg: "bg-yellow-500/15",
    badgeText: "text-yellow-500",
    Icon: AlertTriangle,
  },
  error: {
    borderColor: "bg-red-500",
    badgeBg: "bg-red-500/15",
    badgeText: "text-red-500",
    Icon: X,
  },
};

export const AUTOMATION_STATE_BORDER_COLORS: Record<AutomationState, string> = {
  processing: "#3b82f6",
  success: "#22c55e",
  warning: "#eab308",
  error: "#ef4444",
};

type Props = {
  state: AutomationState;
  customLabel?: string | null;
  onReset?: () => void;
};

export function AutomationStateBadge({ state, customLabel, onReset }: Props) {
  const { dict } = useI18n();
  const tr = dict.automation;
  const config = STATE_CONFIG[state];
  const { Icon } = config;
  const fallbackLabels: Record<AutomationState, string> = {
    processing: tr.stateBadgeProcessing || "Processing",
    success: tr.stateBadgeSuccess || "Success",
    warning: tr.stateBadgeWarning || "Warning",
    error: tr.stateBadgeError || "Error",
  };
  const displayLabel = customLabel || fallbackLabels[state];
  const resetLabel = tr.resetState || "Reset state";

  const baseClass = `inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 mx-1 rounded shrink-0 ${config.badgeBg} ${config.badgeText}`;

  if (onReset) {
    return (
      <span
        className={`relative cursor-pointer group/automation-badge overflow-visible ${baseClass}`}
        onClick={(e) => {
          e.stopPropagation();
          onReset();
        }}
      >
        {/* Tooltip */}
        <span
          className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium opacity-0 group-hover/automation-badge:opacity-100 transition-opacity duration-150 z-50"
          style={{
            backgroundColor: "var(--text-main)",
            color: "var(--bg-page)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {resetLabel}
          <span
            className="absolute top-full left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 w-1.5 h-1.5"
            style={{ backgroundColor: "var(--text-main)" }}
          />
        </span>
        {/* Icon — fades on hover */}
        {Icon && (
          <Icon
            size={10}
            className={`transition-opacity duration-150 group-hover/automation-badge:opacity-0 ${
              state === "processing" ? "animate-spin" : ""
            }`}
          />
        )}
        {/* Label — blurs and fades on hover */}
        <span className="max-w-[80px] truncate transition-[filter,opacity] duration-150 group-hover/automation-badge:blur-[2px] group-hover/automation-badge:opacity-0">
          {displayLabel}
        </span>
        {/* X centered over the whole badge */}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/automation-badge:opacity-100 transition-opacity duration-150 z-10">
          <X size={11} />
        </span>
      </span>
    );
  }

  return (
    <span className={baseClass} title={displayLabel}>
      {Icon && (
        <Icon
          size={10}
          className={state === "processing" ? "animate-spin" : undefined}
        />
      )}
      <span className="max-w-[80px] truncate">{displayLabel}</span>
    </span>
  );
}
