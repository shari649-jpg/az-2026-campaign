// netlify/functions/fetch-community-notes.js
//
// Two modes:
//   GET ?source=cache  — reads from Netlify Blobs (instant, used on page load)
//   GET (no param)     — fetches live from X directly (manual refresh button)
//
// No Firebase needed. Uses Netlify Blobs — built into Netlify Pro, zero extra credentials.

const { getStore } = require("@netlify/blobs");

const CORS_ORIGIN = "https://az-coalition-2026-election.netlify.app";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Content-Type": "application/json",
};

// ── Classifiers ───────────────────────────────────────────────────────────
const REP_KEYWORDS = [
  "republican","gop","trump","maga","desantis","rubio","lake","masters",
  "hamadeh","finchem","conservative","right-wing","right wing","america first",
  "2nd amendment","second amendment","border wall","illegal alien","critical race",
  "deep state","election fraud","stolen election","patriot","woke","socialist",
  "defund police","antifa","hunter biden","liberal","leftist",
];
const DEM_KEYWORDS = [
  "democrat","democratic","biden","harris","obama","pelosi","schumer","gallego",
  "stanton","progressive","left-wing","left wing","abortion ban","roe","medicaid",
  "social security cut","obamacare","aca","minimum wage","lgbtq ban","book ban",
  "voter suppression","gerrymandering","insurrection","january 6","disinformation","dark money",
];
const NARRATIVE_PATTERNS = [
  { label: "Election Integrity Claims",  keywords: ["election","ballot","vote","fraud","rigged","stolen","mail-in","dominion"] },
  { label: "Immigration Misinformation", keywords: ["border","migrant","illegal","invasion","caravan","fentanyl","trafficking"] },
  { label: "Economic Falsehoods",        keywords: ["inflation","economy","recession","gas price","unemploy","tax","deficit"] },
  { label: "Health & Science Denial",    keywords: ["vaccine","covid","climate","fauci","mask","hydroxychloroquine","ivermectin"] },
  { label: "Crime & Safety Distortions", keywords: ["crime","murder","violent","defund","police","criminal"] },
  { label: "Identity & Social Issues",   keywords: ["transgender","gender","groomer","woke","crt","critical race","lgbtq","drag"] },
];

function classifyText(text) {
  const lower = text.toLowerCase();
  const r = REP_KEYWORDS.filter(k => lower.includes(k)).length;
  const d = DEM_KEYWORDS.filter(k => lower.includes(k)).length;
  if (!r && !d) return null;
  if (r > d) return "R";
  if (d > r) return "D";
  return "both";
}

function detectNarratives(text) {
  const lower = text.toLowerCase();
  return NARRATIVE_PATTERNS.filter(p => p.keywords.some(k => lower.includes(k))).map(p => p.label);
}

function weekLabel(millis) {
  const d = new Date(millis);
  const wk = new Date(d);
  wk.setDate(d.getDate() - d.getDay());
  return `${wk.getMonth() + 1}/${wk.getDate()}`;
}

function parseTSV(raw) {
  const lines = raw.split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t");
  const idx = {
    noteId:    headers.indexOf("noteId"),
    summary:   headers.indexOf("summary"),
    createdAt: headers.indexOf("createdAtMillis"),
  };
  const notes = [];
  const limit = Math.min(lines.length, 10001);
  for (let i = 1; i < limit; i++) {
    const cols    = lines[i].split("\t");
    const summary = (cols[idx.summary] || "").trim();
    if (!summary) continue;
    const side = classifyText(summary);
    if (!side) continue;
    const millis  = parseInt(cols[idx.createdAt]) || 0;
    const date    = millis ? new Date(millis).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
    const weekLbl = millis ? weekLabel(millis) : "Unknown";
    notes.push({
      noteId: cols[idx.noteId] || String(i),
      summary, side, date, weekLbl,
      narratives: detectNarratives(summary),
    });
  }
  return notes;
}

function buildStats(notes) {
  const wkMap = {};
  let totalR = 0, totalD = 0;
  const repNar = {}, demNar = {};
  notes.forEach(n => {
    if (!wkMap[n.weekLbl]) wkMap[n.weekLbl] = { label: n.weekLbl, r: 0, d: 0 };
    if (n.side === "R" || n.side === "both") { wkMap[n.weekLbl].r++; totalR++; }
    if (n.side === "D" || n.side === "both") { wkMap[n.weekLbl].d++; totalD++; }
    n.narratives.forEach(nar => {
      if (n.side === "R" || n.side === "both") repNar[nar] = (repNar[nar] || 0) + 1;
      if (n.side === "D" || n.side === "both") demNar[nar] = (demNar[nar] || 0) + 1;
    });
  });
  const weeklyData = Object.values(wkMap)
    .sort((a, b) => {
      const p = s => { const x = s.split("/"); return parseInt(x[0]) * 100 + parseInt(x[1]); };
      return p(a.label) - p(b.label);
    })
    .slice(-8);
  return { weeklyData, totalR, totalD, repNar, demNar };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  const useCache = event.queryStringParameters?.source === "cache";

  // ── Cache read: pull from Netlify Blobs ──────────────────────────────────
  if (useCache) {
    try {
      const store = getStore("community-notes");
      const cached = await store.get("latest", { type: "json" });
      if (cached && cached.notes?.length) {
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ...cached, source: "cache" }),
        };
      }
      // Cache empty — fall through to live fetch below
    } catch (err) {
      console.warn("Blob cache read failed:", err.message);
      // Fall through to live fetch
    }
  }

  // ── Live fetch: hit X directly ───────────────────────────────────────────
  const URLS = [
    "https://ton.twimg.com/birdwatch-public-data/latest/notes/notes-00000.tsv",
    "https://ton.twimg.com/birdwatch-public-data/latest/notes/notes-00001.tsv",
  ];

  let raw = null;
  let fetchError = null;

  for (const url of URLS) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AZCoalitionBot/1.0)",
          "Accept": "text/tab-separated-values, text/plain, */*",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) { raw = await res.text(); break; }
      fetchError = `HTTP ${res.status} from ${url}`;
    } catch (err) {
      fetchError = err.message;
    }
  }

  if (!raw) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: fetchError || "Failed to fetch Community Notes data from X.",
        hint: "X may have changed the URL. Check https://communitynotes.x.com/guide/en/under-the-hood/download-data",
      }),
    };
  }

  try {
    const notes = parseTSV(raw);
    if (!notes.length) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          notes: [], stats: { weeklyData: [], totalR: 0, totalD: 0, repNar: {}, demNar: {} },
          count: 0, warning: "No politically-classified notes found in dataset.",
        }),
      };
    }

    const stats     = buildStats(notes);
    const fetchedAt = new Date().toISOString();
    const payload   = { notes, stats, count: notes.length, fetchedAt };

    // Write to Netlify Blobs so next page load uses cache
    try {
      const store = getStore("community-notes");
      await store.set("latest", JSON.stringify(payload));
    } catch (blobErr) {
      console.warn("Blob write failed (non-fatal):", blobErr.message);
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ...payload, source: "live" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Parse error: ${err.message}` }),
    };
  }
};
