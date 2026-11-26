import { describe, expect, it } from "vitest";
import type { AutomationRule } from "@lib/types/db";
import { canManageAutomationRules, toRuleResponse } from "./automation-rules";

const rule = { id: "rule-1", webhookSecret: "secret" } as AutomationRule;

describe("toRuleResponse", () => {
  it("never includes the webhook secret", () => {
    expect(toRuleResponse(rule)).not.toHaveProperty("webhookSecret");
    expect(toRuleResponse(rule)).toHaveProperty("id", "rule-1");
  });
});

describe("canManageAutomationRules", () => {
  it.each(["creator", "owner"])("allows %s", (role) => {
    expect(canManageAutomationRules(role)).toBe(true);
  });

  it.each(["editor", "viewer", null, undefined])("denies %j", (role) => {
    expect(canManageAutomationRules(role)).toBe(false);
  });
});
