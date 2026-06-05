// netlify/functions/query-candidates.js
// Reads candidate data directly from Google Sheets.
// Sheet structure (one row per candidate):
// A: Name  B: Office  C: Party  D: District  E: Level  F: Incumbent Status
// G: Background  H: Record & Accomplishments  I: Strengths
// J: Vulnerabilities  K: Key Quotes  L: Notes

const { google } = require('googleapis');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

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
    range: 'A2:L', // skip header row, read all columns A through L
  });
  return response.data.values || [];
}

function parseRows(rows) {
  return rows
    .filter(row => row[0] && row[0].trim()) // skip empty rows
    .map(row => {
      const name             = (row[0]  || '').trim();
      const office           = (row[1]  || '').trim();
      const party            = (row[2]  || '').trim();
      const district         = (row[3]  || '').trim();
      const level            = (row[4]  || '').trim();
      const incumbentStatus  = (row[5]  || '').trim();
      const background       = (row[6]  || '').trim();
      const accomplishments  = (row[7]  || '').trim();
      const strengths        = (row[8]  || '').trim();
      const vulnerabilities  = (row[9]  || '').trim();
      const keyQuotes        = (row[10] || '').trim();
      const notes            = (row[11] || '').trim();

      // Build facts array from each column — only include non-empty ones
      const facts = [];
      if (background)      facts.push({ type: 'background',      category: '',                  text: background });
      if (accomplishments) facts.push({ type: 'accomplishment',  category: 'Record',            text: accomplishments });
      if (strengths)       facts.push({ type: 'strength',        category: '',                  text: strengths });
      if (vulnerabilities) facts.push({ type: 'vulnerability',   category: '',                  text: vulnerabilities });
      if (keyQuotes)       facts.push({ type: 'quote',           category: 'Key Quote',         text: keyQuotes });
      if (notes)           facts.push({ type: 'background',      category: 'Notes',             text: notes });

      return {
        candidate_name:  name,
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
  const q = (query || '').toLowerCase().trim();

  let results = candidates;

  if (q) {
    results = results.filter(c => {
      // Match on name, party, office, district, level, incumbent status
      const meta = [c.candidate_name, c.party, c.office, c.district, c.level, c.incumbent_status]
        .join(' ').toLowerCase();
      if (meta.includes(q)) return true;

      // Full text search across all facts
      return c.facts.some(f => f.text.toLowerCase().includes(q));
    });
  }

  // Apply fact type filter if specified
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

    const auth = getAuthClient();
    const rows = await fetchAllRows(auth);
    const allCandidates = parseRows(rows);

    if (mode === 'races') {
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
