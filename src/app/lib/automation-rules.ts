import type { AutomationRule } from "@lib/types/db";

type RuleRole = string | null | undefined;

const RULE_MANAGER_ROLES = new Set(["creator", "owner"]);

export function canManageAutomationRules(role: RuleRole): boolean {
  return !!role && RULE_MANAGER_ROLES.has(role);
}

// The webhook secret authenticates writes to the canvas, so only rule managers may read it
export function toRuleResponse(
  rule: AutomationRule,
  role: RuleRole,
): AutomationRule | Omit<AutomationRule, "webhookSecret"> {
  if (canManageAutomationRules(role)) return rule;
  const publicRule: Partial<AutomationRule> = { ...rule };
  delete publicRule.webhookSecret;
  return publicRule as Omit<AutomationRule, "webhookSecret">;
}
