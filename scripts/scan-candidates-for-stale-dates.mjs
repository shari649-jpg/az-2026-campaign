#!/usr/bin/env node
// scripts/scan-candidates-for-stale-dates.mjs
//
// WHAT THIS DOES
// ────────────────────────────────────────────────────────────────────────
// Reads every candidate doc directly from Firestore (not the Sheet — this
// checks what's actually live and feeding the AI tools right now) and
// scans every free-text field for language that might be stale after an
// election event has passed: explicit dates, "upcoming primary" framing,
// "ahead of the [date]" language, and so on.
//
// This is a READ-ONLY report — it never modifies Firestore. It exists so
// a human can review a short flagged list instead of reading 300+
// candidates by hand after every primary date (Aug 11, Aug 18, Sept 8,
// and beyond). Re-run this after each election event.
//
// WHY THIS MATTERS
// ────────────────────────────────────────────────────────────────────────
// generate-message.mjs's shared FACTUAL_ACCURACY_GUARDRAIL deliberately
// instructs the model to trust and build directly on whatever text is in
// a candidate's Background/Notes/Messaging Hooks fields — that's a real,
// intentional design choice (Handoff #15), not a bug. The tradeoff: if
// that source text still says "ahead of the Aug 11 primary" after Aug 11
// has passed, the model will faithfully repeat that stale framing in
// generated messages. This script is the check that catches it before a
// real post goes out with dead election-date language in it.
//
// USAGE
// ────────────────────────────────────────────────────────────────────────
//   node scripts/scan-candidates-for-stale-dates.mjs
//   node scripts/scan-candidates-for-stale-dates.mjs --state=AZ   (optional filter)
//
// Prints a report to the console. Also writes a JSON file
// (stale-scan-results.json, repo root) with full match detail, in case
// there are more hits than comfortably fit in a terminal scroll.
//
// CREDENTIALS
// ────────────────────────────────────────────────────────────────────────
// Same as migrate-candidates-to-firestore.mjs — reads
// firebase-service-account.local.json from the project root. This script
// only needs Firestore read access, no Google Sheets credential at all.

import admin from "firebase-admin";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const STATE_FILTER = (process.argv.find(a => a.startsWith("--state=")) || "").split("=")[1] || null;

function readLocalJson(filename) {
  const path = join(REPO_ROOT, filename);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Could not find ${filename} in the project root (${path}).`);
  }
  return JSON.parse(raw);
}

function getFirestoreDb() {
  const serviceAccount = readLocalJson("firebase-service-account.local.json");
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

// ── Fields worth scanning ─────────────────────────────────────────────────
// Every free-text field that could plausibly get pushed into an AI prompt.
// Deliberately excludes fields that are never prose (name, party, district,
// photoFilename, campaignWebsite, ballotpediaUrl).
const TEXT_FIELDS = [
  "background", "recordAccomplishments", "strengths", "vulnerabilities",
  "keyQuotes", "notes", "policyPlatform", "issueTags", "messagingHooks",
  "endorsements", "fundraising", "opponent", "opponentVulnerabilities",
];

// ── Staleness signals ──────────────────────────────────────────────────────
// Deliberately cast a WIDE net — false positives just mean a human glances
// at a line and moves on; a missed real one means dead date language could
// ship in a real post. Three categories, checked independently:

// 1. Explicit calendar dates — "Aug 11", "August 11", "8/11", "11th of August"
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE_PATTERNS = [
  new RegExp(`\\b(${MONTHS})\\.?\\s+\\d{1,2}(st|nd|rd|th)?\\b`, "i"),
  new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+of\\s+(${MONTHS})\\b`, "i"),
  /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/,
];

// 2. Relative election-timing language — ages badly regardless of which
// specific date it originally referred to.
const RELATIVE_PHRASES = [
  /ahead of the/i, /upcoming primary/i, /upcoming election/i,
  /this year'?s primary/i, /before the primary/i, /days? until/i,
  /election day is/i, /primary election is/i, /just weeks away/i,
  /in the coming (weeks|days|months)/i,
];

// 3. Bare "primary" mention — broadest net, most likely to include
// harmless matches (e.g. "her primary focus is healthcare"), but cheap for
// a human to skim past and safer than missing a real one.
const BARE_PRIMARY = /\bprimary\b/i;

function scanText(text) {
  if (!text || typeof text !== "string") return [];
  const hits = [];
  for (const pattern of DATE_PATTERNS) {
    const m = text.match(pattern);
    if (m) hits.push({ category: "explicit_date", match: m[0] });
  }
  for (const pattern of RELATIVE_PHRASES) {
    const m = text.match(pattern);
    if (m) hits.push({ category: "relative_timing", match: m[0] });
  }
  if (BARE_PRIMARY.test(text)) {
    hits.push({ category: "bare_primary_mention", match: "primary" });
  }
  return hits;
}

// Pull ~60 chars of context around a match so the report is skimmable
// without opening Firestore for every hit.
function snippet(text, match) {
  const idx = text.toLowerCase().indexOf(match.toLowerCase());
  if (idx === -1) return text.slice(0, 100);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + match.length + 40);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

async function main() {
  console.log("[scan] Reading candidates from Firestore…\n");
  const db = getFirestoreDb();
  let query = db.collection("candidates");
  if (STATE_FILTER) query = query.where("state", "==", STATE_FILTER.toUpperCase());
  const snap = await query.get();

  console.log(`[scan] ${snap.size} candidate(s) loaded${STATE_FILTER ? ` (state=${STATE_FILTER.toUpperCase()})` : ""}.\n`);

  const flagged = [];

  snap.forEach(doc => {
    const data = doc.data();
    const candidateHits = [];
    for (const field of TEXT_FIELDS) {
      const text = data[field];
      const hits = scanText(text);
      for (const hit of hits) {
        candidateHits.push({ field, ...hit, snippet: snippet(text, hit.match) });
      }
    }
    if (candidateHits.length > 0) {
      flagged.push({
        docId: doc.id,
        name: data.name || "(no name)",
        office: data.office || "",
        state: data.state || "",
        hits: candidateHits,
      });
    }
  });

  // ── Report ────────────────────────────────────────────────────────────
  if (flagged.length === 0) {
    console.log("✅ No staleness signals found. Nothing to review.");
    return;
  }

  console.log(`⚠️  ${flagged.length} candidate(s) flagged for review:\n`);
  flagged.forEach(c => {
    console.log(`── ${c.name} (${c.office}${c.state ? ", " + c.state : ""}) — candidates/${c.docId}`);
    c.hits.forEach(h => {
      console.log(`   [${h.category}] ${h.field}: "${h.snippet}"`);
    });
    console.log("");
  });

  const outPath = join(REPO_ROOT, "stale-scan-results.json");
  writeFileSync(outPath, JSON.stringify(flagged, null, 2));
  console.log(`Full detail written to ${outPath} — safe to open in any text editor or import into a spreadsheet.`);
  console.log(`\n[scan] Done. ${flagged.length}/${snap.size} candidates flagged for a human look.`);
}

main().catch(err => {
  console.error("[scan] Fatal error:", err.message);
  process.exit(1);
});
