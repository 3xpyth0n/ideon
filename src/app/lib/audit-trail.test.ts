import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import {
  appendAuditEvent,
  verifyProjectChain,
  getProjectAuditEvents,
} from "./audit-trail";
import { getDb } from "./db";

const PROJECT_A = "11111111-1111-1111-1111-111111111111";
const PROJECT_B = "22222222-2222-2222-2222-222222222222";
const USER = "33333333-3333-3333-3333-333333333333";

interface StoredEntry {
  id: string;
  projectId: string | null;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  metadata: string;
  prevHash: string | null;
  hash: string;
  createdAt: string;
}

// Independent reimplementation of the documented chain formula:
// hash = SHA256((prevHash ?? "genesis:<scope>") + "|" + canonical(fields))
function expectedHash(
  prevHash: string | null,
  scope: string,
  fields: StoredEntry,
): string {
  const canonical = JSON.stringify({
    action: fields.action,
    createdAt: fields.createdAt,
    entityId: fields.entityId,
    entityType: fields.entityType,
    id: fields.id,
    metadata: fields.metadata,
    projectId: fields.projectId,
    summary: fields.summary,
    userId: fields.userId,
  });
  const prev = prevHash ?? `genesis:${scope}`;
  return createHash("sha256")
    .update(`${prev}|${canonical}`, "utf8")
    .digest("hex");
}

async function readChain(projectId: string | null): Promise<StoredEntry[]> {
  let query = getDb().selectFrom("auditEvents").selectAll();
  query =
    projectId === null
      ? query.where("projectId", "is", null)
      : query.where("projectId", "=", projectId);
  return query.orderBy("createdAt", "asc").orderBy("id", "asc").execute();
}

beforeEach(async () => {
  await getDb().deleteFrom("auditEvents").execute();
});

describe("appendAuditEvent", () => {
  it("chains 5 events with correct prevHash links and genesis root", async () => {
    for (let i = 0; i < 5; i++) {
      await appendAuditEvent({
        projectId: PROJECT_A,
        userId: USER,
        action: `test.action${i}`,
        summary: `event ${i}`,
        metadata: { index: i },
      });
    }

    const rows = await readChain(PROJECT_A);
    expect(rows).toHaveLength(5);
    expect(rows[0].prevHash).toBeNull();

    let prevHash: string | null = null;
    for (const row of rows) {
      expect(row.prevHash).toBe(prevHash);
      expect(row.hash).toBe(expectedHash(prevHash, PROJECT_A, row));
      prevHash = row.hash;
    }

    const verification = await verifyProjectChain(PROJECT_A);
    expect(verification).toEqual({ valid: true, entries: 5, brokenAt: null });
  });

  it("keeps timestamps strictly monotonic under same-millisecond bursts", async () => {
    const appends = Array.from({ length: 20 }, (_, i) =>
      appendAuditEvent({
        projectId: PROJECT_A,
        userId: USER,
        action: "test.burst",
        summary: `burst ${i}`,
      }),
    );
    await Promise.all(appends);

    const rows = await readChain(PROJECT_A);
    const timestamps = rows.map((r) => Date.parse(r.createdAt));
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }

    const verification = await verifyProjectChain(PROJECT_A);
    expect(verification.valid).toBe(true);
    expect(verification.entries).toBe(20);
  });

  it("serializes concurrent appends in the same scope", async () => {
    await Promise.all([
      appendAuditEvent({
        projectId: PROJECT_A,
        userId: USER,
        action: "test.a",
        summary: "a",
      }),
      appendAuditEvent({
        projectId: PROJECT_A,
        userId: USER,
        action: "test.b",
        summary: "b",
      }),
    ]);

    const rows = await readChain(PROJECT_A);
    expect(rows).toHaveLength(2);
    expect(rows[1].prevHash).toBe(rows[0].hash);

    const verification = await verifyProjectChain(PROJECT_A);
    expect(verification).toEqual({ valid: true, entries: 2, brokenAt: null });
  });

  it("keeps project scopes independent from the global scope", async () => {
    await appendAuditEvent({
      projectId: PROJECT_A,
      userId: USER,
      action: "test.project",
      summary: "project event",
    });
    await appendAuditEvent({
      projectId: null,
      userId: USER,
      action: "account.update",
      summary: "global event",
    });
    await appendAuditEvent({
      projectId: PROJECT_B,
      userId: USER,
      action: "test.other",
      summary: "other project event",
    });

    expect(await readChain(PROJECT_A)).toHaveLength(1);
    expect(await readChain(null)).toHaveLength(1);
    expect(await readChain(PROJECT_B)).toHaveLength(1);

    expect((await verifyProjectChain(PROJECT_A)).valid).toBe(true);
    expect((await verifyProjectChain(PROJECT_B)).valid).toBe(true);
  });

  it("records the system actor when userId is null", async () => {
    await appendAuditEvent({
      projectId: PROJECT_A,
      userId: null,
      action: "automation.set_state",
      summary: "system event",
    });

    const rows = await readChain(PROJECT_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("00000000-0000-0000-0000-000000000000");
    expect((await verifyProjectChain(PROJECT_A)).valid).toBe(true);
  });
});

describe("verifyProjectChain", () => {
  it("detects tampering and reports brokenAt", async () => {
    await appendAuditEvent({
      projectId: PROJECT_A,
      userId: USER,
      action: "test.one",
      summary: "one",
    });
    await appendAuditEvent({
      projectId: PROJECT_A,
      userId: USER,
      action: "test.two",
      summary: "two",
    });
    await appendAuditEvent({
      projectId: PROJECT_A,
      userId: USER,
      action: "test.three",
      summary: "three",
    });

    const rows = await readChain(PROJECT_A);
    await getDb()
      .updateTable("auditEvents")
      .set({ summary: "tampered" })
      .where("id", "=", rows[1].id)
      .execute();

    const result = await verifyProjectChain(PROJECT_A);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(rows[1].id);
    expect(result.entries).toBe(3);
  });

  it("detects a deleted entry through the prevHash link", async () => {
    await appendAuditEvent({
      projectId: PROJECT_A,
      userId: USER,
      action: "test.one",
      summary: "one",
    });
    await appendAuditEvent({
      projectId: PROJECT_A,
      userId: USER,
      action: "test.two",
      summary: "two",
    });
    await appendAuditEvent({
      projectId: PROJECT_A,
      userId: USER,
      action: "test.three",
      summary: "three",
    });

    const rows = await readChain(PROJECT_A);
    await getDb()
      .deleteFrom("auditEvents")
      .where("id", "=", rows[1].id)
      .execute();

    const result = await verifyProjectChain(PROJECT_A);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(rows[2].id);
    expect(result.entries).toBe(2);
  });

  it("returns valid for an empty chain", async () => {
    const result = await verifyProjectChain(PROJECT_A);
    expect(result).toEqual({ valid: true, entries: 0, brokenAt: null });
  });
});

describe("getProjectAuditEvents", () => {
  async function seed(count: number) {
    for (let i = 0; i < count; i++) {
      await appendAuditEvent({
        projectId: PROJECT_A,
        userId: USER,
        action: i % 2 === 0 ? "temporal.create" : "temporal.apply",
        summary: `p${i}`,
      });
    }
  }

  it("paginates newest first with a cursor and no overlap", async () => {
    await seed(5);

    const page1 = await getProjectAuditEvents(PROJECT_A, { limit: 2 });
    expect(page1.events).toHaveLength(2);
    expect(page1.hasMore).toBe(true);

    const page2 = await getProjectAuditEvents(PROJECT_A, {
      limit: 2,
      before: page1.events[1].id,
    });
    expect(page2.events).toHaveLength(2);
    expect(page2.hasMore).toBe(true);

    const page1Ids = new Set(page1.events.map((e) => e.id));
    expect(page2.events.some((e) => page1Ids.has(e.id))).toBe(false);

    const page3 = await getProjectAuditEvents(PROJECT_A, {
      limit: 2,
      before: page2.events[1].id,
    });
    expect(page3.events).toHaveLength(1);
    expect(page3.hasMore).toBe(false);

    const all = [...page1.events, ...page2.events, ...page3.events];
    expect(all).toHaveLength(5);
    expect(new Set(all.map((e) => e.id)).size).toBe(5);
  });

  it("filters by action", async () => {
    await seed(6);

    const filtered = await getProjectAuditEvents(PROJECT_A, {
      limit: 50,
      action: "temporal.create",
    });
    expect(filtered.events).toHaveLength(3);
    expect(filtered.events.every((e) => e.action === "temporal.create")).toBe(
      true,
    );
  });

  it("joins the actor email when the user row exists", async () => {
    await getDb()
      .insertInto("users")
      .values({
        id: USER,
        email: "actor@example.com",
        displayName: "Test User",
        role: "member",
        lastOnline: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      })
      .execute();
    await appendAuditEvent({
      projectId: PROJECT_A,
      userId: USER,
      action: "test.join",
      summary: "joined",
    });

    const result = await getProjectAuditEvents(PROJECT_A, { limit: 10 });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].userEmail).toBe("actor@example.com");
  });

  it("returns no events for an empty project", async () => {
    const result = await getProjectAuditEvents(PROJECT_B, { limit: 10 });
    expect(result.events).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });
});
