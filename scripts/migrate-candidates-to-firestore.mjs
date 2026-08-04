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
// Q Issue Tags       ← NEW August 2026, additive only — existing rows
// R Messaging Hooks     will read blank for these 8 until filled in.
// S Endorsements        Confirmed with the person: staff-entered manual
// T Fundraising         fields, no API/external data source behind any
// U Opponent             of them. Ballotpedia URL (X) is a manually-
// V Opponent Vulnerabilities  pasted link, NOT a connection to the
// W Campaign Website     Ballotpedia API. Fundraising (T) is a manual
// X Ballotpedia URL      staff-entered figure/summary, not FEC data.
//
// USAGE
// ────────────────────────────────────────────────────────────────────────
//   node scripts/migrate-candidates-to-firestore.mjs
//   node scripts/migrate-candidates-to-firestore.mjs --dry-run   (preview only, no writes)
//
// CREDENTIALS
// ────────────────────────────────────────────────────────────────────────
// Read from local JSON FILES, not from raw JSON pasted into .env. Service-
// account JSON is pretty-printed (multi-line) by default, and cramming
// multi-line text into a single .env line is fragile — a stray literal
// line break in the middle of the value breaks JSON.parse with a "Bad
// control character" error. Reading the files directly sidesteps that
// entirely; the JSON can stay exactly as downloaded, multi-line and all.
//
// Save your two credential files in the PROJECT ROOT (same folder as
// package.json) with these exact names:
//   google-service-account.local.json
//   firebase-service-account.local.json
// (the ".local" suffix distinguishes these from the build-time-generated
// files of similar names that already live inside netlify/functions/ —
// different purpose, don't mix them up.)
//
// GOOGLE_SHEET_ID still comes from .env — it's a plain string with no
// quoting/newline risk, so .env is fine for that one.

import { google } from "googleapis";
import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, ".."); // scripts/ -> repo root

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_LIMIT = 500; // Firestore's hard cap per batch write

function readLocalJson(filename) {
  const path = join(REPO_ROOT, filename);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Could not find ${filename} in the project root (${path}). Save your service-account JSON there with this exact filename.`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${filename} is not valid JSON: ${err.message}`);
  }
}

// ── Credential loading ──────────────────────────────────────────────────
function getGoogleAuth() {
  const credentials = readLocalJson("google-service-account.local.json");
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function getFirestoreDb() {
  const serviceAccount = readLocalJson("firebase-service-account.local.json");
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

function buildDocId(name, state, district, office) {
  const nameSlug = slugify(name);
  const stateSlug = slugify(state);
  // Statewide races (Governor, Attorney General, Secretary of State, U.S.
  // Senate, etc.) have no District value at all — that's expected, not a
  // data error. Fall back to Office as the disambiguating third segment
  // in that case, so these candidates get a real doc ID instead of being
  // skipped. Only fall back to "statewide" as a last resort if BOTH
  // District and Office are somehow blank (a genuine data-entry gap).
  const thirdSegment = slugify(district) || slugify(office) || "statewide";
  if (!nameSlug || !stateSlug || !thirdSegment) {
    return null;
  }
  return `${nameSlug}-${stateSlug}-${thirdSegment}`;
}

// ── Sheet fetch + parse ──────────────────────────────────────────────────
async function fetchCandidateRows(auth) {
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "A2:X", // extended from A2:P (August 2026) to include the 8 new columns: Issue Tags → Ballotpedia URL
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
  // NOTE: the sheet's actual column order is the REVERSE of what
  // query-candidates.mjs's header comment originally documented — M is
  // really Photo Filename, N is really Policy Platform. Confirmed against
  // the live sheet's header row (Aug 2026). Read in the order that
  // actually matches the sheet, not the order the old comment assumed.
  const photoFilename     = (row[12] || "").trim(); // M
  const policyPlatform    = (row[13] || "").trim(); // N
  const wins              = (row[14] || "").trim();
  const state             = (row[15] || "").trim().toUpperCase();
  // New August 2026 (additive) — existing rows will read as empty strings
  // for these 8 until someone fills them in on the live sheet; that's
  // expected, not an error, and this script's upsert/merge:true write
  // handles it the same as any other blank cell.
  const issueTags               = (row[16] || "").trim(); // Q
  const messagingHooks          = (row[17] || "").trim(); // R
  const endorsements            = (row[18] || "").trim(); // S
  const fundraising             = (row[19] || "").trim(); // T
  const opponent                = (row[20] || "").trim(); // U
  const opponentVulnerabilities = (row[21] || "").trim(); // V
  const campaignWebsite         = (row[22] || "").trim(); // W
  const ballotpediaUrl          = (row[23] || "").trim(); // X

  return {
    name, office, party, district, level,
    incumbentStatus, background, recordAccomplishments,
    strengths, vulnerabilities, keyQuotes, notes,
    policyPlatform, photoFilename, wins, state,
    issueTags, messagingHooks, endorsements, fundraising,
    opponent, opponentVulnerabilities, campaignWebsite, ballotpediaUrl,
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
      // No longer a skip condition — statewide races legitimately have no
      // District. buildDocId() below falls back to Office in that case.
      // Only genuinely missing BOTH District and Office gets skipped, and
      // that's caught by the docId === null check further down.
    }

    const docId = buildDocId(candidate.name, candidate.state, candidate.district, candidate.office);
    if (!docId) {
      skipped.push({ rowNum, name: candidate.name, reason: "could not build a valid doc ID — Name, State, and either District or Office are all required, and this row is missing more than one of them" });
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
