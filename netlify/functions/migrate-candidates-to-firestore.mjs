#!/usr/bin/env node
// scripts/migrate-candidates-to-firestore.mjs
//
// WHAT THIS DOES
// ────────────────────────────────────────────────────────────────────────
// Reads every row from the Candidates tab (Sheet1) and upserts each one
// into Firestore's `candidates` collection. Safe to re-run at any time —
// this is an UPSERT, not an overwrite:
//   - New candidates (new doc ID) → created
//   - Existing candidates (same doc ID) → fields refreshed, merged
//   - Everything else in the collection → untouched
// Nothing is ever deleted or wiped by running this script.
//
// DOC ID / UPSERT KEY
// ────────────────────────────────────────────────────────────────────────
// Doc ID = slugify(name) + "-" + state.toLowerCase() + "-" + slugify(district)
//   e.g. "jane-smith-az-ld13"
// This is deterministic: the same candidate, run through this script any
// number of times, always resolves to the same document. That's what makes
// the upsert safe. State is REQUIRED in the key now that candidates are
// being added from multiple states — a bare district like "LD13" is not
// guaranteed unique across states.
//
// SHEET COLUMNS EXPECTED (Candidates tab, row 2 onward)
// ────────────────────────────────────────────────────────────────────────
// A Name  B Office  C Party  D District  E Level  F Incumbent Status
// G Background  H Record & Accomplishments  I Strengths  J Vulnerabilities
// K Key Quotes  L Notes  M Policy Platform  N Photo Filename
// O Wins            ← NEW, add this column to the sheet
// P State            ← NEW, add this column to the sheet (2-letter code, e.g. AZ)
//
// USAGE
// ────────────────────────────────────────────────────────────────────────
//   node scripts/migrate-candidates-to-firestore.mjs
//   node scripts/migrate-candidates-to-firestore.mjs --dry-run   (preview only, no writes)
//
// CREDENTIALS
// ────────────────────────────────────────────────────────────────────────
// This is a standalone Node script (not a Netlify Function), so it isn't
// subject to Lambda's 4KB env-var cap — it reads GOOGLE_SERVICE_ACCOUNT_JSON
// and FIREBASE_SERVICE_ACCOUNT_JSON directly from process.env. Run it
// locally with those set (e.g. via `netlify env:get` piped into your shell,
// or a local .env loaded with `node --env-file=.env`), or in CI.

import { google } from "googleapis";
import admin from "firebase-admin";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_LIMIT = 500; // Firestore's hard cap per batch write

// ── Credential loading ──────────────────────────────────────────────────
function getGoogleAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set.");
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function getFirestoreDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set.");
  const serviceAccount = JSON.parse(raw);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

// ── Slug helper ──────────────────────────────────────────────────────────
// Lowercase, trim, collapse whitespace, strip anything that isn't
// alphanumeric or a hyphen, join words with single hyphens. Case- and
// whitespace-insensitive on purpose: "Jane Smith" and "jane  smith" must
// resolve to the same slug or you get silent duplicate documents.
function slugify(str) {
  return (str || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function buildDocId(name, state, district) {
  const nameSlug = slugify(name);
  const stateSlug = slugify(state);
  const districtSlug = slugify(district);
  if (!nameSlug || !stateSlug || !districtSlug) {
    return null; // caller must skip and report this row
  }
  return `${nameSlug}-${stateSlug}-${districtSlug}`;
}

// ── Sheet fetch + parse ──────────────────────────────────────────────────
async function fetchCandidateRows(auth) {
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "A2:P", // extended from A2:N to include Wins (O) and State (P)
  });
  return response.data.values || [];
}

function parseRow(row) {
  const name            = (row[0]  || "").trim();
  const office           = (row[1]  || "").trim();
  const party            = (row[2]  || "").trim();
  const district         = (row[3]  || "").trim();
  const level             = (row[4]  || "").trim();
  const incumbentStatus   = (row[5]  || "").trim();
  const background        = (row[6]  || "").trim();
  const recordAccomplishments = (row[7] || "").trim();
  const strengths         = (row[8]  || "").trim();
  const vulnerabilities   = (row[9]  || "").trim();
  const keyQuotes         = (row[10] || "").trim();
  const notes             = (row[11] || "").trim();
  const policyPlatform    = (row[12] || "").trim();
  const photoFilename     = (row[13] || "").trim();
  const wins              = (row[14] || "").trim();
  const state             = (row[15] || "").trim().toUpperCase();

  return {
    name, office, party, district, level,
    incumbentStatus, background, recordAccomplishments,
    strengths, vulnerabilities, keyQuotes, notes,
    policyPlatform, photoFilename, wins, state,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID is not set.");

  console.log(DRY_RUN ? "[migrate] DRY RUN — no writes will be made.\n" : "[migrate] Live run — Firestore will be updated.\n");

  const auth = getGoogleAuth();
  const rows = await fetchCandidateRows(auth);

  const toWrite = [];
  const skipped = [];

  for (const [i, row] of rows.entries()) {
    const rowNum = i + 2; // sheet row number, accounting for header
    if (!row[0] || !row[0].trim()) continue; // blank row, skip silently

    const candidate = parseRow(row);

    if (!candidate.state) {
      skipped.push({ rowNum, name: candidate.name, reason: "missing State (column P)" });
      continue;
    }
    if (!candidate.district) {
      skipped.push({ rowNum, name: candidate.name, reason: "missing District (column D)" });
      continue;
    }

    const docId = buildDocId(candidate.name, candidate.state, candidate.district);
    if (!docId) {
      skipped.push({ rowNum, name: candidate.name, reason: "could not build a valid doc ID from name/state/district" });
      continue;
    }

    toWrite.push({ docId, data: candidate, rowNum });
  }

  // ── Report skipped rows up front — these need a manual look regardless
  // of dry-run or live, since they were NOT written anywhere. ──────────────
  if (skipped.length) {
    console.log(`⚠️  ${skipped.length} row(s) skipped (not written):`);
    skipped.forEach(s => console.log(`   Row ${s.rowNum} (${s.name || "blank name"}): ${s.reason}`));
    console.log("");
  }

  console.log(`Found ${toWrite.length} valid candidate row(s) to upsert.\n`);

  if (DRY_RUN) {
    toWrite.forEach(({ docId, rowNum }) => console.log(`   [dry-run] Row ${rowNum} → candidates/${docId}`));
    console.log(`\n[migrate] Dry run complete. Re-run without --dry-run to actually write.`);
    return;
  }

  const db = getFirestoreDb();

  // Batch in chunks of 500 (Firestore's per-batch write limit)
  let written = 0;
  for (let i = 0; i < toWrite.length; i += BATCH_LIMIT) {
    const chunk = toWrite.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const { docId, data } of chunk) {
      const ref = db.collection("candidates").doc(docId);
      batch.set(ref, {
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }); // merge:true is what makes this an upsert, not an overwrite
    }
    await batch.commit();
    written += chunk.length;
    console.log(`   ✓ Committed batch: ${written}/${toWrite.length} written so far`);
  }

  console.log(`\n[migrate] Done. ${written} candidate(s) upserted into Firestore. 0 documents deleted or overwritten wholesale.`);
}

main().catch(err => {
  console.error("[migrate] Fatal error:", err.message);
  process.exit(1);
});
