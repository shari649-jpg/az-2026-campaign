// netlify/functions/query-candidates.mjs
// Reads candidate data directly from Google Sheets.
// Tab 1 — Candidates (one row per candidate):
// A: Name  B: Office  C: Party  D: District  E: Level  F: Incumbent Status
// G: Background  H: Record & Accomplishments  I: Strengths
// J: Vulnerabilities  K: Key Quotes  L: Notes
//
// Tab 2 — Race_Demographics (one row per race/district):
// A: Race Type  B: District ID  C: Location Note  D: Registration Data
// E: Voting History  F: Demographics  G: Top Issues  H: Message Guidance  I: Notes
//
// Modern Netlify Functions runtime (ESM)

import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function getAuthClient() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var not set");
  const credentials = JSON.parse(credentialsJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function fetchAllRows(auth) {
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "A2:L",
  });
  return response.data.values || [];
}

async function fetchDistrictRows(auth) {
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Race_Demographics!A2:I",
  });
  return response.data.values || [];
}

function parseDistricts(rows) {
  return rows
    .filter(row => row[0] && row[0].trim())
    .map(row => ({
      race_type:        (row[0] || "").trim(),
      district_id:      (row[1] || "").trim(),
      location_note:    (row[2] || "").trim(),
      registration:     (row[3] || "").trim(),
      voting_history:   (row[4] || "").trim(),
      demographics:     (row[5] || "").trim(),
      top_issues:       (row[6] || "").trim(),
      message_guidance: (row[7] || "").trim(),
      notes:            (row[8] || "").trim(),
    }));
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

      const facts = [];
      if (background)      facts.push({ type: "background",     category: "",           text: background });
      if (accomplishments) facts.push({ type: "accomplishment", category: "Record",     text: accomplishments });
      if (strengths)       facts.push({ type: "strength",       category: "",           text: strengths });
      if (vulnerabilities) facts.push({ type: "vulnerability",  category: "",           text: vulnerabilities });
      if (keyQuotes)       facts.push({ type: "quote",          category: "Key Quote",  text: keyQuotes });
      if (notes)           facts.push({ type: "background",     category: "Notes",      text: notes });

      return {
        candidate_name:   name,
        office,
        party,
        district,
        level,
        incumbent_status: incumbentStatus,
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

  try {
    const body = await req.json();
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
