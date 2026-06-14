// netlify/functions/scheduled-community-notes.js
//
// Runs automatically every day at 6:00 AM UTC via Netlify scheduled functions.
// Fetches X Community Notes TSV, parses + classifies notes, stores result in
// Firestore so the Monitor page always has fresh data without any user action.
//
// SETUP REQUIRED:
// 1. npm install firebase-admin  (in your netlify/functions folder or root)
// 2. Add these Netlify environment variables:
//    FIREBASE_PROJECT_ID       — from Firebase console → Project Settings
//    FIREBASE_CLIENT_EMAIL     — from your service account JSON
//    FIREBASE_PRIVATE_KEY      — from your service account JSON (with \n preserved)
//
// Schedule syntax: runs daily at 6:00 AM UTC
// Set in netlify.toml (see bottom of this file for the toml snippet to add)

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore }                  = require("firebase-admin/firestore");

// ── Firebase init (safe to call multiple times in warm Lambda) ────────────
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

// ── Classifiers (same logic as fetch-community-notes.js) ─────────────────
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
    const cols  = lines[i].split("\t");
    const summary = (cols[idx.summary] || "").trim();
    if (!summary) continue;
    const side = classifyText(summary);
    if (!side) continue;
    const millis  = parseInt(cols[idx.createdAt]) || 0;
    const date    = millis ? new Date(millis).toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "";
    const weekLbl = millis ? weekLabel(millis) : "Unknown";
    notes.push({ noteId: cols[idx.noteId] || String(i), summary, side, date, weekLbl, narratives: detectNarratives(summary) });
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

// ── Main handler ──────────────────────────────────────────────────────────
exports.handler = async () => {
  console.log("[scheduled-community-notes] Starting daily fetch:", new Date().toISOString());

  // 1. Fetch from X
  const URLS = [
    "https://ton.twimg.com/birdwatch-public-data/latest/notes/notes-00000.tsv",
    "https://ton.twimg.com/birdwatch-public-data/latest/notes/notes-00001.tsv",
  ];

  let raw = null;
  for (const url of URLS) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AZCoalitionBot/1.0)", "Accept": "text/tab-separated-values, */*" },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) { raw = await res.text(); break; }
      console.warn(`[scheduled-community-notes] ${url} → ${res.status}`);
    } catch (err) {
      console.warn(`[scheduled-community-notes] fetch error: ${err.message}`);
    }
  }

  if (!raw) {
    console.error("[scheduled-community-notes] All URLs failed — aborting.");
    return { statusCode: 502, body: "All X URLs failed" };
  }

  // 2. Parse + classify
  const notes = parseTSV(raw);
  if (!notes.length) {
    console.error("[scheduled-community-notes] No political notes found in dataset.");
    return { statusCode: 200, body: "No political notes found" };
  }
  const stats = buildStats(notes);

  // 3. Write to Firestore
  // Stored as a single document — the page reads it on load, always fresh
  try {
    const db = getDb();
    await db.collection("community_notes_cache").doc("latest").set({
      notes,
      stats,
      count:     notes.length,
      fetchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    console.log(`[scheduled-community-notes] Wrote ${notes.length} notes to Firestore.`);
  } catch (err) {
    console.error("[scheduled-community-notes] Firestore write failed:", err.message);
    return { statusCode: 500, body: `Firestore error: ${err.message}` };
  }

  return { statusCode: 200, body: `OK — ${notes.length} notes cached.` };
};

/*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADD THIS TO YOUR netlify.toml to enable the daily schedule:

[functions."scheduled-community-notes"]
  schedule = "0 6 * * *"
  timeout = 26

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ADD THESE ENV VARS in Netlify dashboard → Site settings → Environment variables:

  FIREBASE_PROJECT_ID     = (your Firebase project ID)
  FIREBASE_CLIENT_EMAIL   = (from service account JSON)
  FIREBASE_PRIVATE_KEY    = (from service account JSON — paste the full key including BEGIN/END lines)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*/
