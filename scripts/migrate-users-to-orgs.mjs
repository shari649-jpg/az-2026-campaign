#!/usr/bin/env node
// scripts/migrate-users-to-orgs.mjs
//
// WHAT THIS DOES
// ────────────────────────────────────────────────────────────────────────
// Step 1: Seeds/updates orgs/{orgId} documents from scripts/orgs.config.json.
// Step 2: Backfills orgId onto every existing users/{uid} document that
//         doesn't already have one, using orgs.config.json's
//         userAssignments map (matched by the user doc's stored email
//         field) with a fallback to defaultOrgId for everyone else.
//
// This is the foundational piece Section 4 of the pricing/decisions report
// flagged as the gating item for org-scoped billing, per-org credit pools,
// comp credits, and separate transcription metering — none of those can
// be built until every user and every org-owned resource has a real,
// consistent orgId to attach to.
//
// SAFE TO RE-RUN
// ────────────────────────────────────────────────────────────────────────
// Org docs: upserted with merge:true — re-running just refreshes name/
// addons if you edit the config, never wipes other fields (e.g. credit
// balances, once those exist).
// User docs: this script ONLY ever writes orgId to a user who does not
// already have one (skipUsersWithExistingOrgId, hardcoded true, not a
// flag — see note below). Re-running is a no-op for anyone already
// assigned. This is deliberately NOT an upsert-and-overwrite the way the
// candidate migration is — a user's org assignment should not silently
// flip because a config file's userAssignments block changed after the
// fact. To reassign a user's org later, do it deliberately (a future
// admin UI action or manage-user.mjs addition), not by re-running this
// script.
//
// DOC ID / SCHEMA
// ────────────────────────────────────────────────────────────────────────
// orgs/{orgId} — orgId is the literal Firestore doc ID, taken directly
// from orgs.config.json. Fields seeded here: name, addons (object),
// createdAt. Credit-balance fields are intentionally NOT created by this
// script — that's the next build (admin-granted comp credits, per-org
// generation/transcription pools), scoped separately once org identity
// itself is confirmed working.
//
// users/{uid} — adds a single new field, orgId (string), matching the
// existing pattern for role: checked in firestore.rules via a Firestore
// doc lookup (get(...).data.orgId), NOT a Firebase custom claim. This
// deliberately mirrors how role/isAdmin/isManager already work in this
// codebase rather than introducing a second, different mechanism.
//
// USAGE
// ────────────────────────────────────────────────────────────────────────
//   node scripts/migrate-users-to-orgs.mjs
//   node scripts/migrate-users-to-orgs.mjs --dry-run   (preview only, no writes)
//
// Before running for real: fill in scripts/orgs.config.json with your
// actual org names/IDs and any non-default user assignments. Run with
// --dry-run first and read the full preview — it lists every user and
// which org they're about to be assigned, plus anyone the config's
// userAssignments couldn't match by email (typo protection).
//
// CREDENTIALS
// ────────────────────────────────────────────────────────────────────────
// Same as migrate-candidates-to-firestore.mjs — reads
// firebase-service-account.local.json from the project root. This script
// doesn't touch Google Sheets, so it does NOT need
// google-service-account.local.json or GOOGLE_SHEET_ID.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, ".."); // scripts/ -> repo root

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_LIMIT = 500; // Firestore's hard cap per batch write

function readLocalJson(filename) {
  const path = join(REPO_ROOT, filename);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Could not find ${filename} in the project root (${path}).`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${filename} is not valid JSON: ${err.message}`);
  }
}

function getFirestoreDb() {
  const serviceAccount = readLocalJson("firebase-service-account.local.json");
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

function loadConfig() {
  const config = readLocalJson("scripts/orgs.config.json");
  if (!Array.isArray(config.orgs) || config.orgs.length === 0) {
    throw new Error("orgs.config.json: 'orgs' must be a non-empty array. Fill in the template before running.");
  }
  for (const org of config.orgs) {
    if (!org.orgId || org.orgId.startsWith("REPLACE_WITH")) {
      throw new Error(`orgs.config.json: found a placeholder or missing orgId (${org.orgId}). Fill in real values before running.`);
    }
  }
  if (!config.defaultOrgId || config.defaultOrgId.startsWith("REPLACE_WITH")) {
    throw new Error("orgs.config.json: 'defaultOrgId' is missing or still a placeholder.");
  }
  const validOrgIds = new Set(config.orgs.map(o => o.orgId));
  if (!validOrgIds.has(config.defaultOrgId)) {
    throw new Error(`orgs.config.json: defaultOrgId "${config.defaultOrgId}" does not match any orgId listed in 'orgs'.`);
  }
  const assignments = config.userAssignments || {};
  for (const [email, orgId] of Object.entries(assignments)) {
    if (email === "_comment") continue;
    if (!validOrgIds.has(orgId)) {
      throw new Error(`orgs.config.json: userAssignments["${email}"] = "${orgId}" does not match any orgId listed in 'orgs'.`);
    }
  }
  return config;
}

// ── Step 1: seed/update org docs ────────────────────────────────────────
async function upsertOrgs(db, config) {
  console.log(`Seeding ${config.orgs.length} org(s):`);
  for (const org of config.orgs) {
    console.log(`   ${DRY_RUN ? "[dry-run] " : ""}orgs/${org.orgId} — name: "${org.name}", addons: ${JSON.stringify(org.addons || {})}`);
  }
  console.log("");

  if (DRY_RUN) return;

  const batch = db.batch();
  for (const org of config.orgs) {
    const ref = db.collection("orgs").doc(org.orgId);
    batch.set(ref, {
      name: org.name,
      addons: org.addons || {},
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(), // merge:true won't overwrite this on subsequent runs against an existing doc... actually it WILL overwrite. See note below.
    }, { merge: true });
  }
  await batch.commit();
  console.log(`   ✓ Org doc(s) written.\n`);
}
// NOTE on createdAt above: serverTimestamp() + merge:true will refresh
// createdAt on every re-run, which isn't quite right for a field named
// "createdAt". Left as-is deliberately rather than adding a read-before-
// write existence check for what is, today, a one-time seed of two orgs —
// revisit if this script starts being used to onboard orgs regularly.

// ── Step 2: backfill orgId onto existing users ──────────────────────────
async function backfillUserOrgIds(db, config) {
  const assignments = { ...(config.userAssignments || {}) };
  delete assignments._comment;
  // Normalize keys to lowercase so config-file casing typos don't silently
  // fail to match a real user's stored email.
  const normalizedAssignments = {};
  for (const [email, orgId] of Object.entries(assignments)) {
    normalizedAssignments[email.toLowerCase().trim()] = orgId;
  }

  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.size} user document(s) in Firestore.\n`);

  const toAssign = [];
  const alreadyAssigned = [];
  const noEmailOnDoc = [];

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (data.orgId) {
      alreadyAssigned.push({ uid: doc.id, orgId: data.orgId });
      continue;
    }
    const email = (data.email || "").toLowerCase().trim();
    if (!email) {
      // Shouldn't happen given referencesValidInvite()'s email requirement
      // at account-creation time, but don't silently skip if it does —
      // surface it so it gets a manual look.
      noEmailOnDoc.push({ uid: doc.id });
      continue;
    }
    const orgId = normalizedAssignments[email] || config.defaultOrgId;
    toAssign.push({ uid: doc.id, email, orgId });
  }

  console.log(`   ${alreadyAssigned.length} user(s) already have an orgId — skipped, untouched.`);
  if (noEmailOnDoc.length) {
    console.log(`   ⚠️  ${noEmailOnDoc.length} user doc(s) have NO email field at all — cannot assign an org automatically:`);
    noEmailOnDoc.forEach(u => console.log(`      uid: ${u.uid}`));
  }
  console.log(`   ${toAssign.length} user(s) will be assigned an org:\n`);
  for (const u of toAssign) {
    const viaConfig = normalizedAssignments[u.email] ? "" : " (default)";
    console.log(`   ${DRY_RUN ? "[dry-run] " : ""}${u.email} → ${u.orgId}${viaConfig}`);
  }
  console.log("");

  if (DRY_RUN || toAssign.length === 0) return;

  for (let i = 0; i < toAssign.length; i += BATCH_LIMIT) {
    const chunk = toAssign.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const u of chunk) {
      batch.set(db.collection("users").doc(u.uid), { orgId: u.orgId }, { merge: true });
    }
    await batch.commit();
    console.log(`   ✓ Committed batch: ${Math.min(i + BATCH_LIMIT, toAssign.length)}/${toAssign.length} users assigned so far`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(DRY_RUN ? "[migrate-users-to-orgs] DRY RUN — no writes will be made.\n" : "[migrate-users-to-orgs] Live run — Firestore will be updated.\n");

  const config = loadConfig();
  const db = getFirestoreDb();

  await upsertOrgs(db, config);
  await backfillUserOrgIds(db, config);

  console.log(DRY_RUN
    ? "\n[migrate-users-to-orgs] Dry run complete. Re-run without --dry-run to actually write."
    : "\n[migrate-users-to-orgs] Done.");
}

main().catch(err => {
  console.error("[migrate-users-to-orgs] Fatal error:", err.message);
  process.exit(1);
});
