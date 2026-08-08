// netlify/functions/public-voter-lookup.mjs
//
// WHAT THIS DOES
// ────────────────────────────────────────────────────────────────────────
// Public, unauthenticated endpoint (deliberately NOT gated behind
// requireSignedIn — this is meant to be used by any visitor to the public
// voter-lookup page, no account needed). Takes a plain typed address,
// resolves it to a congressional district and state legislative district
// via Google's Civic Information API (divisionsByAddress — the free,
// Census-TIGER-backed endpoint; see the pricing/decisions report's API
// scoping notes), then returns the matching candidates from Firestore —
// but ONLY an explicit allowlist of 7 fields, never the full candidate
// record. Opposition-research fields (Strengths, Vulnerabilities, Key
// Quotes, Notes, Policy Platform, Opponent, Opponent Vulnerabilities,
// Fundraising, etc.) are never touched by this function at all.
//
// WHY AN ALLOWLIST, NOT A BLOCKLIST
// ────────────────────────────────────────────────────────────────────────
// buildPublicCandidate() below picks 7 named fields off the raw Firestore
// doc and returns ONLY those — it never spreads or forwards the full
// doc.data(). This means a new sensitive field added to the schema later
// (as already happened this week with Opponent/Opponent Vulnerabilities)
// is automatically excluded here by default, without anyone needing to
// remember to add it to an exclusion list under deadline pressure.
//
// MATCHING LOGIC — READ BEFORE FIRST REAL USE
// ────────────────────────────────────────────────────────────────────────
// Office/Level are free-text fields typed into the source Google Sheet,
// not a fixed enum — there is no confirmed exact string list to match
// against. matchesFederalHouse/matchesStateSenate/matchesStateHouse below
// use permissive substring matching (case-insensitive) on Level and
// Office, plus numeric extraction from District (e.g. "CD07" -> 7,
// "LD15" -> 15) rather than exact string equality, specifically because
// getting this wrong silently returns zero or wrong candidates with no
// obvious error. TEST THIS against real addresses/districts once live —
// if a real candidate doesn't show up, the fix is almost certainly
// widening one of these substring checks to match how that specific row
// was actually typed into the Sheet, not a deeper bug.
//
// SETUP REQUIRED BEFORE THIS WORKS
// ────────────────────────────────────────────────────────────────────────
// 1. Enable the "Civic Information API" on the same Google Cloud project
//    used for Sheets access (or a new one) — console.cloud.google.com ->
//    APIs & Services -> Enable APIs -> search "Civic Information API".
// 2. Create an API key restricted to that API (Credentials -> Create
//    Credentials -> API Key -> Restrict key -> Civic Information API
//    only). This is a different key/setup than the Maps/Places key the
//    state's own district-locator tool uses — no Places/Maps billing
//    needed here at all.
// 3. Add it as a Netlify env var: GOOGLE_CIVIC_API_KEY.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";

const ALLOWED_ORIGINS = [
  "https://arizonacoalition.net",
  "https://az-coalition-2026-election.netlify.app",
];
function corsHeaders(req) {
  const origin = req.headers.get("origin");
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin };
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(new URL("./firebase-service-account.json", import.meta.url), "utf8"));
  } catch {
    throw new Error("firebase-service-account.json not found — run `npm run build` to regenerate via scripts/inject-secrets.mjs.");
  }
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// ── Google Civic: address -> CD/LD ──────────────────────────────────────
// Extracts the numeric district from OCD-IDs like:
//   ocd-division/country:us/state:az/cd:6           -> { type: "cd", num: 6 }
//   ocd-division/country:us/state:az/sldu:15         -> { type: "sldu", num: 15 }  (state senate — upper chamber)
//   ocd-division/country:us/state:az/sldl:15         -> { type: "sldl", num: 15 }  (state house — lower chamber)
function parseDivisions(divisions) {
  const result = { cd: null, sldu: null, sldl: null };
  for (const ocdId of Object.keys(divisions || {})) {
    const cdMatch = ocdId.match(/\/cd:(\d+)/);
    const slduMatch = ocdId.match(/\/sldu:(\d+)/);
    const sldlMatch = ocdId.match(/\/sldl:(\d+)/);
    if (cdMatch) result.cd = parseInt(cdMatch[1], 10);
    if (slduMatch) result.sldu = parseInt(slduMatch[1], 10);
    if (sldlMatch) result.sldl = parseInt(sldlMatch[1], 10);
  }
  return result;
}

async function lookupDistricts(address) {
  const apiKey = process.env.GOOGLE_CIVIC_API_KEY;
  if (!apiKey) throw new Error("Voter lookup isn't configured yet — an Administrator needs to add GOOGLE_CIVIC_API_KEY in Netlify's environment variables.");

  const url = `https://www.googleapis.com/civicinfo/v2/divisionsByAddress?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    // Google returns 400 for addresses it can't parse at all — treat as a
    // user-facing "couldn't find that address" rather than a server error.
    throw new Error(data.error?.message || "Couldn't resolve that address. Double-check it's a complete street address.");
  }
  let { cd, sldu, sldl } = parseDivisions(data.divisions);

  // Arizona-specific reconciliation: every one of AZ's 30 legislative
  // districts elects 1 senator AND 2 representatives from the SAME
  // numbered district (unlike most states, which draw separate House and
  // Senate maps) — sldu and sldl are guaranteed to be the same number in
  // this state whenever both are actually returned. Google's underlying
  // data occasionally has a coverage gap and only returns one of the two
  // for a given address; when that happens, the one value it DID return
  // is still valid for both chambers, so use it for whichever one came
  // back null rather than reporting a false "no district found."
  if (sldu !== null && sldl === null) sldl = sldu;
  if (sldl !== null && sldu === null) sldu = sldl;

  if (cd === null && sldu === null && sldl === null) {
    throw new Error("That address didn't resolve to a recognized Arizona congressional or legislative district.");
  }
  return { cd, sldu, sldl };
}

// ── District-string helpers ──────────────────────────────────────────────
// Pulls the number out of a district field like "CD07" or "LD15".
// Leading zeros are already a non-issue — parseInt("08") === parseInt("8")
// === 8, so "8" vs "08" style variance in how someone typed it into the
// Sheet was never actually a risk.
//
// What IS a real risk: if a district field ever contains more than one
// number (e.g. a stray "Precinct 12, LD08" instead of a clean "LD08"),
// grabbing the first digit run found anywhere would silently grab the
// wrong one (12, not 8). Guard against that by preferring a number that
// appears directly after LD/CD text specifically, and only falling back
// to "first number anywhere in the string" if that pattern isn't present
// at all.
function extractDistrictNumber(districtStr) {
  const str = districtStr || "";
  const prefixed = str.match(/\b(?:ld|cd)[\s-]*?(\d+)/i);
  if (prefixed) return parseInt(prefixed[1], 10);
  const anyNumber = str.match(/(\d+)/);
  return anyNumber ? parseInt(anyNumber[1], 10) : null;
}

function matchesFederalHouse(candidate, cd) {
  if (cd === null) return false;
  const level = (candidate.level || "").toLowerCase();
  const office = (candidate.office || "").toLowerCase();
  if (!level.includes("federal")) return false;
  if (office.includes("senate")) return false; // exclude U.S. Senate races — those are statewide, not CD-specific
  return extractDistrictNumber(candidate.district) === cd;
}

function matchesStateSenate(candidate, sldu) {
  if (sldu === null) return false;
  const level = (candidate.level || "").toLowerCase();
  const office = (candidate.office || "").toLowerCase();
  if (!level.includes("legislative") && !level.includes("statewide")) return false;
  if (!office.includes("senate")) return false;
  return extractDistrictNumber(candidate.district) === sldu;
}

function matchesStateHouse(candidate, sldl) {
  if (sldl === null) return false;
  const level = (candidate.level || "").toLowerCase();
  const office = (candidate.office || "").toLowerCase();
  if (!level.includes("legislative") && !level.includes("statewide")) return false;
  if (office.includes("senate")) return false; // everything legislative that ISN'T senate is treated as house
  return extractDistrictNumber(candidate.district) === sldl;
}

// ── Public field allowlist ────────────────────────────────────────────────
// The ONLY place fields are selected for public output. Add a field here
// deliberately when it's confirmed safe for public display — never
// broaden this by spreading the raw doc.
function buildPublicCandidate(doc) {
  const d = doc.data();
  return {
    name: d.name || "",
    office: d.office || "",
    party: d.party || "",
    district: d.district || "",
    incumbentStatus: d.incumbentStatus || "",
    recordAccomplishments: d.recordAccomplishments || "",
    photoFilename: d.photoFilename || "",
  };
}

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: { ...corsHeaders(req), "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" },
    });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const body = await req.json();
    const address = (body.address || "").trim();
    if (!address) {
      return new Response(JSON.stringify({ error: "Enter an address to look up." }), { status: 400, headers: corsHeaders(req) });
    }

    let districts;
    try {
      districts = await lookupDistricts(address);
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders(req) });
    }

    const app = getAdminApp();
    const db = admin.firestore(app);
    const snap = await db.collection("candidates").where("state", "==", "AZ").get();

    const results = { congress: [], stateSenate: [], stateHouse: [] };
    snap.forEach(doc => {
      const data = doc.data();
      // Skip candidates marked inactive via the Admin panel's active/
      // inactive toggle (Handoff #33) — mirrors the same active !== false
      // check query-candidates.mjs already applies to the signed-in
      // Research tool. Uses !== false (not a truthy check) so candidates
      // from before this field existed, where active is undefined, still
      // default to showing — only an explicit false hides one.
      if (data.active === false) return;
      if (matchesFederalHouse(data, districts.cd)) results.congress.push(buildPublicCandidate(doc));
      if (matchesStateSenate(data, districts.sldu)) results.stateSenate.push(buildPublicCandidate(doc));
      if (matchesStateHouse(data, districts.sldl)) results.stateHouse.push(buildPublicCandidate(doc));
    });

    return new Response(JSON.stringify({
      success: true,
      districts: { congressional: districts.cd, stateSenate: districts.sldu, stateHouse: districts.sldl },
      results,
    }), { status: 200, headers: corsHeaders(req) });

  } catch (err) {
    console.error("[public-voter-lookup] FAILED:", err.message);
    return new Response(JSON.stringify({ error: "Something went wrong looking up that address. Please try again." }), { status: 500, headers: corsHeaders(req) });
  }
}
