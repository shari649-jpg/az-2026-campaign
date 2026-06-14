// netlify/functions/fetch-community-notes.js
//
// Two modes:
//   GET  ?source=cache  — reads today's pre-fetched data from Firestore (fast, used on page load)
//   GET  (no param)     — fetches live from X directly (used by manual refresh button + scheduled fn)
//
// X publishes daily TSV files at:
// https://ton.twimg.com/birdwatch-public-data/latest/notes/notes-00000.tsv

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore }                  = require("firebase-admin/firestore");

function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

const CORS_ORIGIN = "https://az-coalition-2026-election.netlify.app";

const REP_KEYWORDS = [
  "republican","gop","trump","maga","desantis","rubio","lake","masters",
  "hamadeh","finchem","conservative","right-wing","right wing","america first",
  "2nd amendment","second amendment","border wall","illegal alien","critical race",
  "deep state","election fraud","stolen election","patriot","woke","socialist",
  "defund police","antifa","hunter biden","liberal","leftist",
];

const DEM_KEYWORDS = [
  "democrat","democratic","biden","harris","obama","pelosi","schumer","gallego",
  "stanton","progressive","left-wing","left wing","climate change lie",
  "abortion ban","roe","medicaid","social security cut","obamacare","aca",
  "minimum wage","lgbtq ban","book ban","voter suppression","gerrymandering",
  "insurrection","january 6","disinformation","dark money",
];

const NARRATIVE_PATTERNS = [
  { label: "Election Integrity Claims",  keywords: ["election","ballot","vote","fraud","rigged","stolen","mail-in","dominion"] },
  { label: "Immigration Misinformation", keywords: ["border","migrant","illegal","invasion","caravan","fentanyl","trafficking"] },
  { label: "Economic Falsehoods",        keywords: ["inflation","economy","recession","gas price","unemploy","tax","deficit"] },
  { label: "Health & Science Denial",    keywords: ["vaccine","covid","climate","fauci","mask","hydroxychloroquine","ivermectin"] },
  { label: "Crime & Safety Distortions", keywords: ["crime","murder","violent","defund","police","fentanyl","criminal"] },
  { label: "Identity & Social Issues",   keywords: ["transgender","gender","groomer","woke","crt","critical race","lgbtq","drag"] },
];

function classifyText(text) {
  const lower = text.toLowerCase();
  const rScore = REP_KEYWORDS.filter(k => lower.includes(k)).length;
  const dScore = DEM_KEYWORDS.filter(k => lower.includes(k)).length;
  if (rScore === 0 && dScore === 0) return null;
  if (rScore > dScore) return "R";
  if (dScore > rScore) return "D";
  return "both";
}

function detectNarratives(text) {
  const lower = text.toLowerCase();
  return NARRATIVE_PATTERNS
    .filter(p => p.keywords.some(k => lower.includes(k)))
    .map(p => p.label);
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
    tweetId:   headers.indexOf("tweetId"),
  };

  const notes = [];
  // Sample up to 10,000 rows for performance
  const limit = Math.min(lines.length, 10001);

  for (let i = 1; i < limit; i++) {
    const cols = lines[i].split("\t");
    const summary = (cols[idx.summary] || "").trim();
    if (!summary) continue;

    const side = classifyText(summary);
    if (!side) continue;

    const millis = parseInt(cols[idx.createdAt]) || 0;
    const date = millis
      ? new Date(millis).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";
    const weekLbl = millis ? weekLabel(millis) : "Unknown";
    const narratives = detectNarratives(summary);

    notes.push({
      noteId:     cols[idx.noteId] || String(i),
      summary,
      side,
      date,
      weekLbl,
      narratives,
    });
  }

  return notes;
}

function buildStats(notes) {
  const wkMap = {};
  let totalR = 0, totalD = 0;
  const repNar = {}, demNar = {};

  notes.forEach(n => {
    const wk = n.weekLbl;
    if (!wkMap[wk]) wkMap[wk] = { label: wk, r: 0, d: 0 };

    if (n.side === "R" || n.side === "both") { wkMap[wk].r++; totalR++; }
    if (n.side === "D" || n.side === "both") { wkMap[wk].d++; totalD++; }

    n.narratives.forEach(nar => {
      if (n.side === "R" || n.side === "both") repNar[nar] = (repNar[nar] || 0) + 1;
      if (n.side === "D" || n.side === "both") demNar[nar] = (demNar[nar] || 0) + 1;
    });
  });

  // Sort weeks chronologically, keep last 8
  const weeklyData = Object.values(wkMap)
    .sort((a, b) => {
      const parse = s => { const p = s.split("/"); return parseInt(p[0]) * 100 + parseInt(p[1]); };
      return parse(a.label) - parse(b.label);
    })
    .slice(-8);

  return { weeklyData, totalR, totalD, repNar, demNar };
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // ── Cache read mode: return Firestore data without hitting X ─────────────
  const useCache = (event.queryStringParameters?.source === "cache");
  if (useCache) {
    try {
      const db = getDb();
      const doc = await db.collection("community_notes_cache").doc("latest").get();
      if (doc.exists) {
        const data = doc.data();
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            notes:     data.notes,
            stats:     data.stats,
            count:     data.count,
            fetchedAt: data.fetchedAt,
            source:    "cache",
          }),
        };
      }
      // Cache is empty (first run before scheduled fn has run) — fall through to live fetch
    } catch (err) {
      // Firestore error — fall through to live fetch
      console.warn("Firestore cache read failed:", err.message);
    }
  }

  // ── Live fetch mode: hit X directly ──────────────────────────────────────
  // Try each TSV shard (X sometimes splits into multiple files)
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
          // Mimic a standard browser request
          "User-Agent": "Mozilla/5.0 (compatible; AZCoalitionBot/1.0)",
          "Accept": "text/tab-separated-values, text/plain, */*",
        },
        signal: AbortSignal.timeout(20000),
      });

      if (res.ok) {
        raw = await res.text();
        break;
      } else {
        fetchError = `HTTP ${res.status} from ${url}`;
      }
    } catch (err) {
      fetchError = err.message;
    }
  }

  if (!raw) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: fetchError || "Failed to fetch Community Notes data from X.",
        hint: "X may have changed the URL or access policy. Check https://communitynotes.x.com/guide/en/under-the-hood/download-data for the current download URL.",
      }),
    };
  }

  try {
    const notes = parseTSV(raw);

    if (!notes.length) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          notes: [],
          stats: { weeklyData: [], totalR: 0, totalD: 0, repNar: {}, demNar: {} },
          count: 0,
          warning: "No politically-classified notes found in this dataset sample.",
        }),
      };
    }

    const stats = buildStats(notes);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        notes,
        stats,
        count: notes.length,
        fetchedAt: new Date().toISOString(),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: `Parse error: ${err.message}` }),
    };
  }
};
