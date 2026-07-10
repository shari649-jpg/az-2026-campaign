// netlify/functions/fetch-community-notes.mjs
//
// Two modes:
//   GET ?source=cache  — reads from Netlify Blobs (instant, used on page load)
//   GET (no param)     — fetches live from X directly (manual refresh button)
//
// AUTH: requires a valid Firebase ID token (any signed-in user). Previously
// this endpoint had no auth check. Risk here is lower than the other four
// endpoints fixed alongside this one — it only serves public X Community
// Notes data — but it's still gated for consistency with "every tool
// requires login" and to avoid this becoming a free, unmetered proxy for
// hitting X's data feed. Fixed July 2026 security pass.
//
// Uses Netlify Blobs — built into Netlify Pro, zero extra credentials.
// Modern Netlify Functions runtime (ESM)

import { getStore } from "@netlify/blobs";
import admin from "firebase-admin";
import { readFileSync } from "node:fs";

// Transition period: both the new custom domain and the legacy Netlify
// subdomain are accepted. Browsers only honor a single exact-match origin
// in this header (no comma lists, no wildcarding with credentials), so we
// reflect back whichever allowed origin actually made the request.
// TODO: drop ALLOWED_ORIGINS[1] (legacy netlify.app) once the old domain
// is fully retired and nothing still links to it.
const ALLOWED_ORIGINS = [
  "https://arizonacoalition.net",
  "https://az-coalition-2026-election.netlify.app",
];
function corsHeaders(req) {
  const origin = req.headers.get("origin");
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allowOrigin, "Content-Type": "application/json" };
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

async function requireSignedIn(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  return decoded.uid;
}

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

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: corsHeaders(req) });
  }

  // ── Auth (added — this endpoint previously had no check at all) ──────────
  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error("[fetch-community-notes] admin init error:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), {
      status: 500, headers: corsHeaders(req),
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    await requireSignedIn(app, headerToken);
  } catch {
    return new Response(JSON.stringify({ error: "You must be signed in to use this tool." }), {
      status: 401, headers: corsHeaders(req),
    });
  }

  const url = new URL(req.url);
  const useCache = url.searchParams.get("source") === "cache";

  // ── Cache read: pull from Netlify Blobs ──────────────────────────────────
  if (useCache) {
    try {
      const store = getStore("community-notes");
      const cached = await store.get("latest", { type: "json" });
      if (cached && cached.notes?.length) {
        return new Response(
          JSON.stringify({ ...cached, source: "cache" }),
          { status: 200, headers: corsHeaders(req) }
        );
      }
      // Cache empty — fall through to live fetch below
    } catch (err) {
      console.warn("Blob cache read failed:", err.message);
      // Fall through to live fetch
    }
  }

  // ── Live fetch: hit X directly ───────────────────────────────────────────
  // Build date-stamped URL — X moved away from /latest/ path
  const buildUrls = () => {
    const now = new Date();
    const dates = [];
    // Try today and yesterday in case today's data isn't posted yet
    for (let i = 0; i <= 2; i++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      dates.push(`https://ton.twimg.com/birdwatch-public-data/${y}/${m}/${day}/notes/notes-00000.tsv`);
    }
    return dates;
  };
  const URLS = buildUrls();

  let raw = null;
  let fetchError = null;
  const fetchLog = [];

  for (const tsvUrl of URLS) {
    try {
      const res = await fetch(tsvUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/tab-separated-values, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(20000),
      });
      fetchLog.push(`${tsvUrl} → ${res.status}`);
      console.log(`[fetch-community-notes] ${tsvUrl} → ${res.status}`);
      if (res.ok) { raw = await res.text(); break; }
      fetchError = `HTTP ${res.status} from ${tsvUrl}`;
    } catch (err) {
      fetchLog.push(`${tsvUrl} → ERROR: ${err.message}`);
      console.log(`[fetch-community-notes] ${tsvUrl} → ERROR: ${err.message}`);
      fetchError = err.message;
    }
  }

  if (!raw) {
    return new Response(
      JSON.stringify({
        error: fetchError || "Failed to fetch Community Notes data from X.",
        hint: "X may have changed the URL. Check https://communitynotes.x.com/guide/en/under-the-hood/download-data",
      }),
      { status: 502, headers: corsHeaders(req) }
    );
  }

  try {
    const notes = parseTSV(raw);
    if (!notes.length) {
      return new Response(
        JSON.stringify({
          notes: [], stats: { weeklyData: [], totalR: 0, totalD: 0, repNar: {}, demNar: {} },
          count: 0, warning: "No politically-classified notes found in dataset.",
        }),
        { status: 200, headers: corsHeaders(req) }
      );
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

    return new Response(
      JSON.stringify({ ...payload, source: "live" }),
      { status: 200, headers: corsHeaders(req) }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Parse error: ${err.message}` }),
      { status: 500, headers: corsHeaders(req) }
    );
  }
}
