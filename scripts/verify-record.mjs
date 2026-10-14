#!/usr/bin/env node
// Verifies an Ideon record bundle (format idon-record-v1) without Ideon:
// recomputes the state hash and re-walks the audit hash chain.
// Zero dependencies: node:crypto + node:fs only.
//
//   node scripts/verify-record.mjs idon-record-<sealId>.json
//
// Prints VALID or INVALID with a precise reason; exits 0 or 1.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const BUNDLE_FORMAT = "ideon-record-v1";

function fail(reason) {
  console.error(`INVALID: ${reason}`);
  process.exit(1);
}

// Same field order and defaults as the server-side canonicalAuditEvent.
function canonicalAuditEvent(entry) {
  return JSON.stringify({
    action: entry.action,
    createdAt: entry.createdAt,
    entityId: entry.entityId ?? null,
    entityType: entry.entityType ?? null,
    id: entry.id,
    metadata: entry.metadata ?? "",
    projectId: entry.projectId ?? null,
    summary: entry.summary,
    userId: entry.userId ?? null,
  });
}

function computeEntryHash(prevHash, canonical) {
  return createHash("sha256")
    .update(`${prevHash}|${canonical}`, "utf8")
    .digest("hex");
}

const file = process.argv[2];
if (!file) {
  fail("usage: node scripts/verify-record.mjs <file>");
}

let bundle;
try {
  bundle = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  fail(`unreadable bundle: ${error.message}`);
}

if (bundle?.manifest?.format !== BUNDLE_FORMAT) {
  fail("unknown format");
}
if (bundle.manifest.algorithm !== "sha256") {
  fail("unknown algorithm");
}

const stateHash = createHash("sha256")
  .update(bundle.state ?? "", "utf8")
  .digest("hex");
if (stateHash !== bundle.manifest.stateHash) {
  fail(
    `state hash mismatch (expected ${bundle.manifest.stateHash}, got ${stateHash})`,
  );
}

const entries = Array.isArray(bundle.audit) ? bundle.audit : [];
const genesis = `genesis:${bundle.manifest.projectId}`;
let expectedPrev = null;
for (const entry of entries) {
  if (entry.prevHash !== expectedPrev) {
    fail(`audit chain broken at entry ${entry.id} (unexpected prevHash)`);
  }
  const expectedHash = computeEntryHash(
    entry.prevHash ?? genesis,
    canonicalAuditEvent(entry),
  );
  if (entry.hash !== expectedHash) {
    fail(`audit chain broken at entry ${entry.id} (inconsistent hash)`);
  }
  expectedPrev = entry.hash;
}

console.log(`VALID — state intact, ${entries.length} chained audit entries`);
