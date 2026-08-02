// netlify/functions/query-candidates.mjs
// Reads candidate data directly from Google Sheets.
// Tab 1 — Candidates (one row per candidate):
// A: Name  B: Office  C: Party  D: District  E: Level  F: Incumbent Status
// G: Background  H: Record & Accomplishments  I: Strengths
// J: Vulnerabilities  K: Key Quotes  L: Notes  N: Policy Platform
// M: Photo Filename (matches a file in the candidate-headshots/ Firebase
//    Storage folder, e.g. "connolly-janeen.jpg" — added for Candidate Cards)
//
// Tab 2 — Race_Demographics (one row per race/district):
// A: Race Type  B: District ID  C: Counties  D: Location Note  E: Registration Data
// F: Voting History  G: Demographics  H: Top Issues  I: Message Guidance  J: Notes
//
// Tab 3 — Issues (one row per issue):
// A: Issue  B: Heat Rating  C: Active: Y/N  D: Brief Statement  E: Relevant Stats
// F: Races, Districts, Counties Affected  G: GOP Vulnerabilities
// H: Messaging Angle, AZ Angle  I: Notes
//
// NOTE ON CREDENTIAL LOADING: the Google service-account credential is read
// from a local google-service-account.json file rather than process.env.
// That file is written automatically at build time by scripts/inject-secrets.mjs
// — see that file for why (AWS Lambda's 4KB env-var cap per function).
//
// AUTH: requires a valid Firebase ID token (any signed-in user). Previously
// this endpoint had NO auth check at all — anyone who found the URL could
// pull the full candidate / opposition-research dataset without ever
// signing in. Fixed July 2026 security pass — same requireSignedIn pattern
// already used in rapid-response.mjs / generate-message.mjs.
//
// Modern Netlify Functions runtime (ESM)

import { google } from "googleapis";
import { readFileSync } from "node:fs";
import admin from "firebase-admin";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

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

async function requireSignedIn(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  return decoded.uid;
}

function getAuthClient() {
  let credentials;
  try {
    credentials = JSON.parse(readFileSync(new URL("./google-service-account.json", import.meta.url), "utf8"));
  } catch {
    throw new Error("google-service-account.json not found — run `npm run build` to regenerate via scripts/inject-secrets.mjs.");
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function fetchAllRows(auth) {
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "A2:N",
  });
  return response.data.values || [];
}

async function fetchDistrictRows(auth) {
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Race_Demographics!A2:J",
  });
  return response.data.values || [];
}

async function fetchIssueRows(auth) {
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Issues!A2:I",
  });
  return response.data.values || [];
}

function parseDistricts(rows) {
  return rows
    .filter(row => row[0] && row[0].trim())
    .map(row => ({
      race_type:        (row[0] || "").trim(),
      district_id:      (row[1] || "").trim(),
      counties:         (row[2] || "").trim(),
      location_note:    (row[3] || "").trim(),
      registration:     (row[4] || "").trim(),
      voting_history:   (row[5] || "").trim(),
      demographics:     (row[6] || "").trim(),
      top_issues:       (row[7] || "").trim(),
      message_guidance: (row[8] || "").trim(),
      notes:            (row[9] || "").trim(),
    }));
}

const HEAT_PEPPERS = { "1": "🌶️", "2": "🌶️🌶️", "3": "🌶️🌶️🌶️" };

function parseIssues(rows) {
  return rows
    .filter(row => row[0] && row[0].trim())
    .map(row => {
      const heatRaw = (row[1] || "").trim();
      const heatNum = parseInt(heatRaw, 10) || 0;
      return {
        issue:              (row[0] || "").trim(),
        heat_rating:        heatNum,
        heat_display:       HEAT_PEPPERS[String(heatNum)] || heatRaw,
        active:             (row[2] || "").trim().toUpperCase() === "Y",
        brief_statement:    (row[3] || "").trim(),
        relevant_stats:     (row[4] || "").trim(),
        affected:           (row[5] || "").trim(),
        gop_vulnerabilities:(row[6] || "").trim(),
        messaging_angle:    (row[7] || "").trim(),
        notes:              (row[8] || "").trim(),
      };
    });
}

function parseRows(rows) {
  return rows
    .filter(row => row[0] && row[0].trim())
    .map(row => {
      const name            = (row[0]  || "").trim();
      const office          = (row[1]  || "").trim();
      const party           = (row[2]  || "").trim();
      const district        = (row[3]  || "").trim();
      const level           = (row[4]  || "").trim();
      const incumbentStatus = (row[5]  || "").trim();
      const background      = (row[6]  || "").trim();
      const accomplishments = (row[7]  || "").trim();
      const strengths       = (row[8]  || "").trim();
      const vulnerabilities = (row[9]  || "").trim();
      const keyQuotes       = (row[10] || "").trim();
      const notes           = (row[11] || "").trim();
      const policyPlatform  = (row[13] || "").trim();
      const photoFilename   = (row[12] || "").trim();

      const facts = [];
      if (background)      facts.push({ type: "background",     category: "",   text: background });
      if (accomplishments) facts.push({ type: "accomplishment", category: "",   text: accomplishments });
      if (strengths)       facts.push({ type: "strength",       category: "",   text: strengths });
      if (vulnerabilities) facts.push({ type: "vulnerability",  category: "",   text: vulnerabilities });
      if (keyQuotes)       facts.push({ type: "quote",          category: "",   text: keyQuotes });
      if (notes)           facts.push({ type: "notes",          category: "",   text: notes });
      if (policyPlatform)  facts.push({ type: "policy",         category: "",   text: policyPlatform });

      return {
        candidate_name:   name,
        office,
        party,
        district,
        level,
        incumbent_status: incumbentStatus,
        policy_platform:  policyPlatform,
        photo_filename:   photoFilename,
        facts,
      };
    });
}

function searchCandidates(candidates, query, filterType) {
  const q = (query || "").toLowerCase().trim();
  let results = candidates;

  if (q) {
    results = results.filter(c => {
      const meta = [c.candidate_name, c.party, c.office, c.district, c.level, c.incumbent_status]
        .join(" ").toLowerCase();
      if (meta.includes(q)) return true;
      const factsToSearch = filterType
        ? c.facts.filter(f => f.type === filterType)
        : c.facts;
      return factsToSearch.some(f => f.text.toLowerCase().includes(q));
    });
  }

  if (filterType) {
    results = results
      .map(c => ({ ...c, facts: c.facts.filter(f => f.type === filterType) }))
      .filter(c => c.facts.length > 0);
  }

  return results;
}

function groupByRace(candidates) {
  const raceMap = {};
  candidates.forEach(c => {
    const key = `${(c.office || "").trim()}|${(c.district || "").trim()}`;
    if (!raceMap[key]) raceMap[key] = { office: c.office, district: c.district, candidates: [] };
    raceMap[key].candidates.push(c);
  });
  Object.values(raceMap).forEach(race => {
    race.candidates.sort((a, b) => {
      const order = { D: 0, R: 1 };
      return (order[a.party] ?? 2) - (order[b.party] ?? 2);
    });
  });
  return Object.values(raceMap).sort((a, b) => {
    const officeCompare = (a.office || "").localeCompare(b.office || "");
    if (officeCompare !== 0) return officeCompare;
    return (a.district || "").localeCompare(b.district || "", undefined, { numeric: true });
  });
}

export default async function (req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Auth (added — this endpoint previously had no check at all) ──────────
  let adminApp;
  try {
    adminApp = getAdminApp();
  } catch (err) {
    console.error("[query-candidates] admin init error:", err.message);
    return new Response(JSON.stringify({ success: false, error: "Server configuration error." }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;

    try {
      await requireSignedIn(adminApp, idToken);
    } catch {
      return new Response(JSON.stringify({ success: false, error: "You must be signed in to use this tool." }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }

    const { query, filterType, mode } = body;

    const auth = getAuthClient();

    if (mode === "districts") {
      const rows = await fetchDistrictRows(auth);
      const districts = parseDistricts(rows);
      return new Response(
        JSON.stringify({ success: true, districts, total: districts.length }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (mode === "issues") {
      const rows = await fetchIssueRows(auth);
      const issues = parseIssues(rows);
      return new Response(
        JSON.stringify({ success: true, issues, total: issues.length }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const rows = await fetchAllRows(auth);
    const allCandidates = parseRows(rows);

    if (mode === "races") {
      const races = groupByRace(allCandidates);
      return new Response(
        JSON.stringify({ success: true, races, total: allCandidates.length }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Default: search mode
    const results = searchCandidates(allCandidates, query, filterType || null);
    return new Response(
      JSON.stringify({ success: true, results, total: results.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("query-candidates error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
