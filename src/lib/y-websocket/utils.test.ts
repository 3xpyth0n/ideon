import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { auditRejectedWrite } from "./utils";
import { appendAuditEvent } from "../../app/lib/audit-trail";

vi.mock("../../app/lib/audit-trail", () => ({
  appendAuditEvent: vi.fn(() => Promise.resolve()),
}));

const USER_A = "11111111-1111-1111-1111-111111111111";

function projectDocName(): string {
  return `project-${uuidv4()}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllTimers();
});

describe("auditRejectedWrite", () => {
  it("audits a rejected write from a read-only connection", () => {
    const docName = projectDocName();
    const projectId = docName.replace("project-", "");

    auditRejectedWrite(docName, USER_A, "viewer", "read-only connection");

    expect(appendAuditEvent).toHaveBeenCalledTimes(1);
    const call = vi.mocked(appendAuditEvent).mock.calls[0][0];
    expect(call.action).toBe("graph.write_rejected");
    expect(call.projectId).toBe(projectId);
    expect(call.userId).toBe(USER_A);
    expect(call.entityType).toBe("project");
    expect(call.entityId).toBe(projectId);
    expect(call.metadata).toEqual({
      role: "viewer",
      reason: "read-only connection",
    });
  });

  it("audits a rejected write from a connection without role", () => {
    const docName = projectDocName();

    auditRejectedWrite(docName, null, null, "missing role");

    expect(appendAuditEvent).toHaveBeenCalledTimes(1);
    const call = vi.mocked(appendAuditEvent).mock.calls[0][0];
    expect(call.userId).toBeNull();
    expect(call.metadata).toEqual({ role: null, reason: "missing role" });
  });

  it("ignores access channels and non-project docs", () => {
    const projectId = uuidv4();
    auditRejectedWrite(
      `project-${projectId}-access`,
      USER_A,
      "viewer",
      "read-only connection",
    );
    auditRejectedWrite(
      "user-settings",
      USER_A,
      "viewer",
      "read-only connection",
    );

    expect(appendAuditEvent).not.toHaveBeenCalled();
  });
});
