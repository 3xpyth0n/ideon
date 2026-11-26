import { describe, expect, it } from "vitest";
import { canUseShell } from "./shell-access";

describe("canUseShell", () => {
  it.each(["superadmin", "admin"])("allows %s", (role) => {
    expect(canUseShell(role)).toBe(true);
  });

  it.each(["member", "", null, undefined, "Admin"])("denies %j", (role) => {
    expect(canUseShell(role)).toBe(false);
  });
});
