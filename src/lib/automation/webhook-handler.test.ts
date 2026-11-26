import { describe, expect, it } from "vitest";
import { buildRunPayload } from "./webhook-handler";

describe("buildRunPayload", () => {
  it("describes a cron run with its schedule", () => {
    expect(buildRunPayload("cron:0 9 * * *", "scheduled")).toMatchObject({
      cron: true,
      schedule: "cron:0 9 * * *",
      manual: false,
    });
  });

  it("describes a manual webhook run as a test event", () => {
    const payload = buildRunPayload("*", "manual");

    expect(payload).toMatchObject({ event: "test", manual: true });
    expect(payload).not.toHaveProperty("cron");
  });
});
