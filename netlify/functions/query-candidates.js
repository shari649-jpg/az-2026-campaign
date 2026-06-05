// netlify/functions/query-candidates.js
// Reads candidate data directly from Google Sheets — no Claude API call needed.
// Replaces the previous version that used Claude to parse a Google Doc.

const { google } = require('googleapis');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Expected sheet columns (0-indexed):
// 0: candidate_name
// 1: party          (D / R / I)
// 2: office
// 3: district
// 4: fact_type      (accomplishment / vulnerability / strength / quote / background)
// 5: fact_category  (optional sub-label)
// 6: fact_text

function getAuthClient() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');
  const credentials = JSON.parse(credentialsJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

async function fetchAllRows(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'A2:G', // skip header row
  });
  return response.data.values || [];
}

function parseRows(rows) {
  // Group rows into candidate objects keyed by name+party+office+district
  const candidateMap = {};

  rows.forEach(row => {
    const [name, party, office, district, factType, factCategory, factText] = row;
    if (!name) return; // skip empty rows

    const key = `${(name || '').trim()}|${(party || '').trim()}|${(office || '').trim()}|${(district || '').trim()}`;

    if (!candidateMap[key]) {
      candidateMap[key] = {
        candidate_name: (name || '').trim(),
        party:          (party || '').trim(),
        office:         (office || '').trim(),
        district:       (district || '').trim(),
        facts:          [],
      };
    }

    if (factText && factText.trim()) {
      candidateMap[key].facts.push({
        type:     (factType || 'background').trim().toLowerCase(),
        category: (factCategory || '').trim(),
        text:     (factText || '').trim(),
      });
    }
  });

  return Object.values(candidateMap);
}

function searchCandidates(candidates, query, filterType) {
  const q = (query || '').toLowerCase().trim();
  if (!q) return candidates;

  return candidates.filter(c => {
    // Match on name, party, office, district
    const meta = [c.candidate_name, c.party, c.office, c.district]
      .join(' ').toLowerCase();
    if (meta.includes(q)) return true;

    // Match on fact text/category — optionally constrained by filterType
    const factsToSearch = filterType
      ? c.facts.filter(f => f.type === filterType)
      : c.facts;

    return factsToSearch.some(f =>
      f.text.toLowerCase().includes(q) ||
      (f.category && f.category.toLowerCase().includes(q))
    );
  }).map(c => {
    // If filterType is set, return only matching facts
    if (!filterType) return c;
    return { ...c, facts: c.facts.filter(f => f.type === filterType) };
  });
}

function groupByRace(candidates) {
  // Returns candidates sorted and grouped by office+district
  const raceMap = {};
  candidates.forEach(c => {
    const key = `${(c.office || '').trim()}|${(c.district || '').trim()}`;
    if (!raceMap[key]) raceMap[key] = { office: c.office, district: c.district, candidates: [] };
    raceMap[key].candidates.push(c);
  });
  // Sort: D first, R second, others last within each race
  Object.values(raceMap).forEach(race => {
    race.candidates.sort((a, b) => {
      const order = { D: 0, R: 1 };
      return (order[a.party] ?? 2) - (order[b.party] ?? 2);
    });
  });
  return Object.values(raceMap).sort((a, b) => {
    // Sort races by office then district
    const officeCompare = (a.office || '').localeCompare(b.office || '');
    if (officeCompare !== 0) return officeCompare;
    return (a.district || '').localeCompare(b.district || '', undefined, { numeric: true });
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { query, filterType, mode } = body;
    // mode: 'search' (default) or 'races' (returns all candidates grouped by race)

    const auth = getAuthClient();
    const rows = await fetchAllRows(auth);
    const allCandidates = parseRows(rows);

    if (mode === 'races') {
      // Return ALL candidates grouped by race — used by RaceComparison tab
      const races = groupByRace(allCandidates);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, races, total: allCandidates.length }),
      };
    }

    // Default: search mode
    const results = searchCandidates(allCandidates, query, filterType || null);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, results, total: results.length }),
    };

  } catch (err) {
    console.error('query-candidates error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
