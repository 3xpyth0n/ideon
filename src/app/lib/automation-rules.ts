import type { AutomationRule } from "@lib/types/db";

type RuleRole = string | null | undefined;

const RULE_MANAGER_ROLES = new Set(["creator", "owner"]);

export function canManageAutomationRules(role: RuleRole): boolean {
  return !!role && RULE_MANAGER_ROLES.has(role);
}

// The webhook secret is only served on explicit request by the dedicated secret endpoint
export function toRuleResponse(
  rule: AutomationRule,
): Omit<AutomationRule, "webhookSecret"> {
  const publicRule: Partial<AutomationRule> = { ...rule };
  delete publicRule.webhookSecret;
  return publicRule as Omit<AutomationRule, "webhookSecret">;
}
