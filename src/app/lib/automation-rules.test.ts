import { describe, expect, it } from "vitest";
import type { AutomationRule } from "@lib/types/db";
import { toRuleResponse } from "./automation-rules";

const rule = { id: "rule-1", webhookSecret: "secret" } as AutomationRule;

describe("toRuleResponse", () => {
  it.each(["creator", "owner"])("keeps the secret for %s", (role) => {
    expect(toRuleResponse(rule, role)).toHaveProperty("webhookSecret");
  });

  it.each(["editor", "viewer", null, undefined])(
    "removes the secret for %j",
    (role) => {
      expect(toRuleResponse(rule, role)).not.toHaveProperty("webhookSecret");
      expect(toRuleResponse(rule, role)).toHaveProperty("id", "rule-1");
    },
  );
});
