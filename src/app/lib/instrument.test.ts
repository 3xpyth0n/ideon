import { describe, it, expect, beforeEach } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { unzipSync } from "fflate";
import {
  buildDossier,
  buildDossierArchive,
  getBlockProvenance,
} from "./instrument";
import { renderDossierPdf, lockPdf } from "./instrument-pdf";
import { buildRecordBundle, computeStateHash, sealState } from "./records";
import { appendAuditEvent } from "./audit-trail";
import { getDb } from "./db";

const PROJECT_ID = "77777777-7777-4777-8777-777777777777";
const USER_ID = "88888888-8888-4888-8888-888888888888";

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function graphNode(
  id: string,
  content: string,
  title: string,
): Record<string, unknown> {
  return {
    id,
    type: "text",
    position: { x: 10, y: 20 },
    data: { blockType: "text", content, title, metadata: "{}" },
  };
}

function snapshotDiff(blocks: Record<string, unknown>[]): string {
  return JSON.stringify([
    { type: "graphSnapshot", payload: { blocks, links: [] } },
  ]);
}

async function seedState(
  diff: string,
  intent: string,
  timestampOffsetMs: number,
): Promise<string> {
  const id = randomUUID();
  await getDb()
    .insertInto("temporalStates")
    .values({
      id,
      projectId: PROJECT_ID,
      parentId: null,
      authorId: USER_ID,
      intent,
      diff,
      isSnapshot: 1,
      isAuto: 0,
      timestamp: new Date(Date.now() + timestampOffsetMs).toISOString(),
    })
    .execute();
  return id;
}

beforeEach(async () => {
  const db = getDb();
  await db.deleteFrom("sealedStates").execute();
  await db.deleteFrom("temporalStates").execute();
  await db.deleteFrom("blocks").execute();
  await db.deleteFrom("auditEvents").execute();
  await db.deleteFrom("projects").execute();
  await db.deleteFrom("users").execute();
  const now = new Date().toISOString();
  await db
    .insertInto("users")
    .values({
      id: USER_ID,
      email: "dossier@example.com",
      username: "dossier",
      role: "member",
      createdAt: now,
    })
    .execute();
  await db
    .insertInto("projects")
    .values({
      id: PROJECT_ID,
      name: "Dossier test project",
      description: null,
      ownerId: USER_ID,
      folderId: null,
      currentStateId: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
});

describe("buildDossier", () => {
  it("assembles certificate, inventory, delta, seals and timeline", async () => {
    const stateA = await seedState(
      snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
      "first state",
      1_000,
    );
    const sealA = await sealState({
      projectId: PROJECT_ID,
      stateId: stateA,
      authorId: USER_ID,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const stateB = await seedState(
      snapshotDiff([
        graphNode("block-a", "alpha", "Block A"),
        graphNode("block-b", "beta", "Block B"),
      ]),
      "second state",
      2_000,
    );
    const stateBDiff = await getDb()
      .selectFrom("temporalStates")
      .select("diff")
      .where("id", "=", stateB)
      .executeTakeFirst();
    const sealB = await sealState({
      projectId: PROJECT_ID,
      stateId: stateB,
      authorId: USER_ID,
      summary: "livraison client",
    });

    const dossier = await buildDossier(PROJECT_ID, sealB.id);

    expect(dossier.certificate.projectName).toBe("Dossier test project");
    expect(dossier.certificate.authorEmail).toBe("dossier@example.com");
    expect(dossier.certificate.sealedAt).toBe(sealB.createdAt);
    expect(dossier.certificate.stateHash).toBe(
      computeStateHash(stateBDiff?.diff ?? ""),
    );
    expect(dossier.certificate.integrity).toBe("verified");

    const bundle = await buildRecordBundle(sealB);
    const expectedBundleHash = createHash("sha256")
      .update(JSON.stringify(bundle), "utf8")
      .digest("hex");
    expect(dossier.certificate.bundleHash).toBe(expectedBundleHash);

    expect(dossier.inventory.map((block) => block.id)).toEqual([
      "block-a",
      "block-b",
    ]);

    expect(dossier.delta.added.map((block) => block.id)).toEqual(["block-b"]);
    expect(dossier.delta.modified).toEqual([]);
    expect(dossier.delta.removed).toEqual([]);

    expect(dossier.sealSummary.count).toBe(2);
    expect(dossier.sealSummary.number).toBe(2);
    expect(dossier.sealSummary.firstSealAt).toBe(sealA.createdAt);

    expect(
      dossier.timeline.some(
        (entry) => entry.action === "seal" && entry.actor !== null,
      ),
    ).toBe(true);
  });

  it("collapses consecutive canvas updates into one human row", async () => {
    for (const messages of [2, 2, 2]) {
      await appendAuditEvent({
        projectId: PROJECT_ID,
        userId: USER_ID,
        action: "graph.update",
        summary: `${messages} canvas updates, ${messages * 617} bytes`,
        metadata: { messages, bytes: messages * 617 },
      });
    }
    await appendAuditEvent({
      projectId: PROJECT_ID,
      userId: USER_ID,
      action: "temporal.create",
      summary: "Snapshot created",
    });
    for (const messages of [1, 3]) {
      await appendAuditEvent({
        projectId: PROJECT_ID,
        userId: USER_ID,
        action: "graph.update",
        summary: `${messages} canvas updates, ${messages * 617} bytes`,
        metadata: { messages, bytes: messages * 617 },
      });
    }

    const state = await seedState(
      snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
      "only state",
      1_000,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId: state,
      authorId: USER_ID,
    });

    const dossier = await buildDossier(PROJECT_ID, seal.id);

    const canvasRows = dossier.timeline.filter(
      (entry) => entry.action === "canvas work",
    );
    expect(canvasRows).toHaveLength(2);
    expect(canvasRows[0].summary).toBe(
      "6 canvas updates (working state between snapshots)",
    );
    expect(canvasRows[1].summary).toBe(
      "4 canvas updates (working state between snapshots)",
    );
    expect(dossier.timeline.some((entry) => entry.action === "snapshot")).toBe(
      true,
    );
    expect(dossier.timeline).toHaveLength(4);
  });

  it("reports an empty delta for the first dossier", async () => {
    const stateA = await seedState(
      snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
      "only state",
      1_000,
    );
    const sealA = await sealState({
      projectId: PROJECT_ID,
      stateId: stateA,
      authorId: USER_ID,
    });

    const dossier = await buildDossier(PROJECT_ID, sealA.id);

    expect(dossier.delta.added).toEqual([]);
    expect(dossier.delta.modified).toEqual([]);
    expect(dossier.delta.removed).toEqual([]);
    expect(dossier.sealSummary.count).toBe(1);
    expect(dossier.sealSummary.number).toBe(1);
    expect(dossier.sealSummary.firstSealAt).toBe(sealA.createdAt);
  });

  it("renders the PDF with a canvas map image", async () => {
    const state = await seedState(
      snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
      "only state",
      1_000,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId: state,
      authorId: USER_ID,
    });
    const dossier = await buildDossier(PROJECT_ID, seal.id);
    const onePixelPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const pdf = await renderDossierPdf(dossier, onePixelPng);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(2_000);
  });

  it("rejects an unknown seal", async () => {
    await expect(buildDossier(PROJECT_ID, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("renderDossierPdf", () => {
  it("renders a PDF with the certificate, and a larger one with the canvas map", async () => {
    const state = await seedState(
      snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
      "only state",
      1_000,
    );
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId: state,
      authorId: USER_ID,
    });
    const dossier = await buildDossier(PROJECT_ID, seal.id);

    const pdf = await renderDossierPdf(dossier);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);

    const pdfWithMap = await renderDossierPdf(dossier, TINY_PNG_DATA_URL);
    expect(pdfWithMap.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdfWithMap.length).toBeGreaterThan(pdf.length);
  });
});

describe("lockPdf", () => {
  const qpdfAvailable = spawnSync("qpdf", ["--version"]).error === undefined;

  it.skipIf(!qpdfAvailable)(
    "locks the PDF with AES-256 and no modification rights",
    async () => {
      const state = await seedState(
        snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
        "only state",
        1_000,
      );
      const seal = await sealState({
        projectId: PROJECT_ID,
        stateId: state,
        authorId: USER_ID,
      });
      const dossier = await buildDossier(PROJECT_ID, seal.id);
      const locked = await lockPdf(await renderDossierPdf(dossier));

      expect(locked.subarray(0, 5).toString()).toBe("%PDF-");
      const raw = locked.toString("latin1");
      expect(raw).toContain("/Encrypt");
      expect(raw).toContain("/AESV3");

      const dir = mkdtempSync(join(tmpdir(), "ideon-lock-test-"));
      const lockedPath = join(dir, "locked.pdf");
      writeFileSync(lockedPath, locked);

      // qpdf --show-encryption reads the locked file without the (empty)
      // user password and reports the enforced restrictions.
      const shown = spawnSync("qpdf", ["--show-encryption", lockedPath], {
        encoding: "utf8",
      });
      expect(shown.status).toBe(0);
      expect(shown.stdout).toContain("modify anything: not allowed");
      expect(shown.stdout).toContain("extract for any purpose: allowed");
      expect(shown.stdout).toContain("print high resolution: allowed");
    },
  );
});

describe("verify-record script", () => {
  const scriptPath = resolve(process.cwd(), "scripts/verify-record.mjs");

  function runVerifier(file: string) {
    return spawnSync("node", [scriptPath, file], { encoding: "utf8" });
  }

  it("accepts an intact bundle", async () => {
    const state = await seedState(
      snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
      "only state",
      1_000,
    );
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId: state,
      authorId: USER_ID,
    });
    const bundle = await buildRecordBundle(seal);

    const dir = mkdtempSync(join(tmpdir(), "ideon-verify-"));
    const file = join(dir, "idon-record.json");
    writeFileSync(file, JSON.stringify(bundle));

    const result = runVerifier(file);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("VALID");
  });

  it("rejects a tampered state", async () => {
    const state = await seedState(
      snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
      "only state",
      1_000,
    );
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId: state,
      authorId: USER_ID,
    });
    const bundle = await buildRecordBundle(seal);

    const dir = mkdtempSync(join(tmpdir(), "ideon-verify-"));
    const file = join(dir, "idon-record.json");
    writeFileSync(
      file,
      JSON.stringify({ ...bundle, state: `${bundle.state} tampered` }),
    );

    const result = runVerifier(file);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("INVALID");
    expect(result.stderr).toContain("state hash mismatch");
  });

  it("rejects a tampered audit entry", async () => {
    const state = await seedState(
      snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
      "only state",
      1_000,
    );
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId: state,
      authorId: USER_ID,
    });
    const bundle = await buildRecordBundle(seal);

    const audit = bundle.audit.map((entry, index) =>
      index === bundle.audit.length - 1
        ? { ...entry, summary: "tampered summary" }
        : entry,
    );

    const dir = mkdtempSync(join(tmpdir(), "idon-verify-"));
    const file = join(dir, "idon-record.json");
    writeFileSync(file, JSON.stringify({ ...bundle, audit }));

    const result = runVerifier(file);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("INVALID");
    expect(result.stderr).toContain("audit chain broken");
  });

  it("rejects an unknown format", async () => {
    const state = await seedState(
      snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
      "only state",
      1_000,
    );
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId: state,
      authorId: USER_ID,
    });
    const bundle = await buildRecordBundle(seal);

    const dir = mkdtempSync(join(tmpdir(), "idon-verify-"));
    const file = join(dir, "idon-record.json");
    writeFileSync(
      file,
      JSON.stringify({
        ...bundle,
        manifest: { ...bundle.manifest, format: "other-format" },
      }),
    );

    const result = runVerifier(file);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("INVALID");
    expect(result.stderr).toContain("unknown format");
  });
});

describe("buildDossierArchive", () => {
  it("packs the PDF, the bundle and the verifier into a ZIP", async () => {
    const state = await seedState(
      snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
      "only state",
      1_000,
    );
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId: state,
      authorId: USER_ID,
    });
    const dossier = await buildDossier(PROJECT_ID, seal.id);
    const pdf = await renderDossierPdf(dossier);

    const archive = await buildDossierArchive(
      PROJECT_ID,
      seal.id,
      pdf,
      dossier.certificate.projectName,
      dossier.certificate.sealedAt,
    );

    expect(archive.filename).toBe(
      `dossier-dossier-test-project-${seal.createdAt.slice(0, 10)}.zip`,
    );

    const entries = unzipSync(new Uint8Array(archive.content));
    const names = Object.keys(entries);
    expect(names).toHaveLength(3);
    expect(names.some((name) => name.endsWith(".pdf"))).toBe(true);
    expect(names).toContain(`ideon-record-${seal.id}.json`);
    expect(names).toContain("verify-record.mjs");

    const pdfEntry = Buffer.from(
      entries[names.find((name) => name.endsWith(".pdf")) as string],
    );
    expect(pdfEntry.subarray(0, 5).toString()).toBe("%PDF-");

    const bundle = JSON.parse(
      new TextDecoder().decode(entries[`ideon-record-${seal.id}.json`]),
    );
    expect(bundle.manifest.format).toBe("ideon-record-v1");
    expect(bundle.manifest.stateHash).toBe(seal.stateHash);

    const script = new TextDecoder().decode(entries["verify-record.mjs"]);
    expect(script).toContain("VALID");
  });

  it("ships an archive whose bundled verifier accepts its own bundle", async () => {
    const state = await seedState(
      snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
      "only state",
      1_000,
    );
    const seal = await sealState({
      projectId: PROJECT_ID,
      stateId: state,
      authorId: USER_ID,
    });
    const dossier = await buildDossier(PROJECT_ID, seal.id);
    const pdf = await renderDossierPdf(dossier);
    const archive = await buildDossierArchive(
      PROJECT_ID,
      seal.id,
      pdf,
      dossier.certificate.projectName,
      dossier.certificate.sealedAt,
    );

    const dir = mkdtempSync(join(tmpdir(), "ideon-archive-"));
    for (const [name, data] of Object.entries(
      unzipSync(new Uint8Array(archive.content)),
    )) {
      writeFileSync(join(dir, name), data);
    }

    const result = spawnSync(
      "node",
      [
        join(dir, "verify-record.mjs"),
        join(dir, `ideon-record-${seal.id}.json`),
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("VALID");
  });

  it("rejects an unknown seal", async () => {
    await expect(
      buildDossierArchive(
        PROJECT_ID,
        randomUUID(),
        Buffer.from("%PDF-"),
        "P",
        new Date().toISOString(),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("getBlockProvenance", () => {
  it("tracks creation, modifications and seal membership", async () => {
    await seedState(
      snapshotDiff([graphNode("block-x", "v1", "Block X")]),
      "created",
      1_000,
    );
    await seedState(
      snapshotDiff([graphNode("block-x", "v2", "Block X")]),
      "modified",
      2_000,
    );
    const stateC = await seedState(
      snapshotDiff([graphNode("block-x", "v2", "Block X")]),
      "unchanged",
      3_000,
    );

    const beforeSeal = await getBlockProvenance(PROJECT_ID, "block-x");
    expect(beforeSeal.created?.stateId).toBeTruthy();
    expect(beforeSeal.modifications).toHaveLength(1);
    expect(beforeSeal.sealed).toBe(false);

    await sealState({
      projectId: PROJECT_ID,
      stateId: stateC,
      authorId: USER_ID,
    });

    const afterSeal = await getBlockProvenance(PROJECT_ID, "block-x");
    expect(afterSeal.created?.authorEmail).toBe("dossier@example.com");
    expect(afterSeal.modifications).toHaveLength(1);
    expect(afterSeal.sealed).toBe(true);
  });

  it("returns no creation for an unknown block", async () => {
    await seedState(
      snapshotDiff([graphNode("block-a", "alpha", "Block A")]),
      "only state",
      1_000,
    );

    const provenance = await getBlockProvenance(PROJECT_ID, "missing-block");
    expect(provenance.created).toBeNull();
    expect(provenance.modifications).toEqual([]);
    expect(provenance.sealed).toBe(false);
  });
});
