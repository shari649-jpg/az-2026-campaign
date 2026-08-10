// netlify/functions/resolve-bill.mjs
//
// WHAT THIS DOES (rearchitected Aug 2026 — search-first, LegiScan-only)
// ────────────────────────────────────────────────────────────────────────
// Front door of the bill-lookup feature. Takes free text — either a
// specific bill name ("CHIPS Act") or a general issue ("semiconductor
// manufacturing") — and returns a ranked, tiered list of REAL candidate
// bills for the frontend to show as a picklist. The frontend always shows
// a list (even a list of one) and lets the person confirm — no auto-
// selection, by direct decision, since even a single strong match can be
// the wrong bill and this tool makes claims about how people voted.
//
// WHY THIS REPLACES THE OLD "PERPLEXITY IDENTIFIES A BILL" DESIGN
// ────────────────────────────────────────────────────────────────────────
// The original version of this file asked Perplexity to recall a specific
// bill number from its own training memory, then verified that guess
// against a real source before showing it. That verification step caught
// bills that didn't exist, but NOT a real, existing, but topically
// irrelevant bill — confirmed incident: "education vouchers" surfaced a
// real highway sound-barrier appropriations bill, because Perplexity
// confused a statute citation number with a bill number.
//
// The fix isn't a better verification step — it's not asking an LLM to
// recall bill identifiers from memory at all. This version searches
// LegiScan's own real, relevance-ranked full-text index FIRST, with the
// person's raw query. Perplexity is only ever called as a fallback, to
// reformulate the query into better search terms when the raw query
// returns nothing usable — and even then it only ever returns query TEXT,
// never a bill identifier. Every bill this function can possibly return
// came from LegiScan's real index in the first place, so there's nothing
// left to hallucinate into the response. (Direct efficiency decision, Aug
// 2026: most searches now cost zero Perplexity calls at all, since a
// decent raw-query search usually finds real hits without needing the
// reformulation fallback — see the credit-gating note below.)
//
// CONGRESS.GOV IS NOT USED HERE (OR ANYWHERE IN THIS FEATURE)
// ────────────────────────────────────────────────────────────────────────
// Direct decision, Aug 2026: LegiScan tracks Congress with the same
// schema it uses for states (confirmed — real federal bills appear under
// LegiScan's own "US" state code), so federal and state search/detail are
// now fully symmetric, both LegiScan-only. This also removes the need to
// translate LegiScan's bill-number prefixes into Congress.gov's billType
// codes, which was real, confirmed-tricky logic (LegiScan's own "HR"
// means House RESOLUTION, not the House BILL Congress.gov's "H.R." means)
// — not needed anymore since nothing downstream ever needs Congress.gov's
// schema at all now. See legislative-lookup.mjs's header for the fuller
// reasoning, including what's given up (LegiScan's own subject tags
// instead of the official CRS Policy Area tag — informational only,
// nothing in this feature used CRS tags for search or matching).
//
// RELEVANCE TIERING (direct decision, Aug 2026)
// ────────────────────────────────────────────────────────────────────────
// LegiScan's own relevance score (0-100, real full-text match strength)
// drives tiering directly — no LLM re-ranking needed on top of it:
//   >= 80  -> "match"    (shown first)
//   50-79  -> "possible" (shown after, flagged as lower-confidence)
//   < 50   -> dropped as noise
// Combined list capped at 10 total, matches filling first, sorted by
// last_action_date descending within each tier (most recently active
// first — a more precise "most recent" than sorting by bare year, and
// available directly on every search result with no extra fetch).
//
// ZERO-VOTE BILLS ARE FILTERED OUT (direct request, Aug 2026)
// ────────────────────────────────────────────────────────────────────────
// A vote-lookup tool has nothing useful to show for a bill that's never
// had a single recorded vote — real, confirmed example: SB1768 showed up
// in results but only ever reached "Senate read second time," no roll
// call yet. getSearch doesn't expose vote count, so this requires one
// real getBill call per candidate to check votes.length. Since LegiScan
// is free, this is a real-latency cost, not a real-money one — but it IS
// extra round-trip time on every search, and it means bill-votes.mjs
// re-fetches the same getBill record again once the person actually picks
// a bill (nothing is cached across these stateless functions). Bounded to
// the top CANDIDATE_CHECK_LIMIT per tier (not the full raw result set)
// to keep latency reasonable; if that bound removes enough zero-vote
// bills that fewer than 10 real results remain, fewer than 10 are simply
// returned rather than reaching further into a long tail of low-relevance
// results to backfill.
//
// RESPONSE CONTRACT (for bill-votes.mjs / BillLookup.jsx to consume)
// ────────────────────────────────────────────────────────────────────────
// { success:true, bills: [ { level, state, billId, billNumber, title,
//   lastActionDate, lastAction, relevance, confidence } , ... ] }
// bills may be an empty array — the frontend shows a "nothing found"
// state rather than a separate mode:"none" flag. billId is LegiScan's own
// bill_id — the only identifier bill-votes.mjs needs now; it calls
// getBill(billId) directly rather than re-resolving a session/number.
//
// AUTH / RATE LIMIT / COST
// ────────────────────────────────────────────────────────────────────────
// Same requireSignedIn pattern as every other internal tool. Every
// request passes the same daily checkAndIncrementRateLimit abuse guard
// LegiScan-only tools use elsewhere (LegiScan is free, so this is an abuse
// guard, not a cost control). The generation-credit balance gate — real
// money, since Perplexity is metered — is only checked and only debited
// when the reformulation fallback actually runs, NOT on every request.
// Gating a free LegiScan search behind a paid-feature credit check would
// be exactly the kind of unnecessary complexity/cost this rearchitecture
// is meant to avoid.
//
// Modern Netlify Functions runtime (ESM).

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";
import { debitGenerationCredits, checkGenerationBalance, generationBlockedPayload, generationWarningPayload } from "./creditHelper.mjs";
import { callPerplexity, extractPerplexityText } from "./perplexity-search.mjs";
import { legiscanSearch, legiscanFetch } from "./legislative-lookup.mjs";

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

async function requireSignedIn(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  return decoded.uid;
}

const MATCH_THRESHOLD = 80;
const POSSIBLE_THRESHOLD = 50;
const RESULT_CAP = 10;
const CANDIDATE_CHECK_LIMIT = 15; // per tier — see file header on the zero-vote filter's latency tradeoff

async function hasRecordedVotes(billId) {
  try {
    const result = await legiscanFetch("getBill", { id: billId });
    return (result?.bill?.votes || []).length > 0;
  } catch (err) {
    console.error(`[resolve-bill] vote-check failed for bill_id=${billId}, keeping it rather than dropping on an API hiccup:`, err.message);
    return true; // fail open — a lookup failure shouldn't silently disappear a possibly-good result
  }
}

// Drops bills with zero recorded votes — direct request, since a
// vote-lookup tool has nothing to show for a bill that's never had a
// roll call. Checks only the top CANDIDATE_CHECK_LIMIT of each tier
// (not the full result set) to bound latency; see file header.
async function filterToBillsWithVotes(tierItems) {
  const pool = tierItems.slice(0, CANDIDATE_CHECK_LIMIT);
  const checks = await Promise.all(pool.map(r => hasRecordedVotes(r.bill_id)));
  return pool.filter((_, i) => checks[i]);
}

// Reformulation-only prompt — critically, this NEVER asks for a bill
// identifier, only better search text. See file header for why that
// distinction is the actual fix for the hallucination class of bug.
function reformulateSystemPrompt(level, state) {
  const jurisdiction = level === "state" ? `the ${state} state legislature` : "the U.S. Congress";
  return `A person's search against a real legislative full-text search engine (covering ${jurisdiction}) returned no results. Suggest ONE alternative search query more likely to match real bill text or titles — for example, translating a colloquial or topic-based description into the kind of official program name, policy term, or statutory language that would actually appear in a bill. Respond with ONLY the reformulated query text — no quotes, no markdown, no explanation, nothing else.`;
}

function tierAndSort(rawResults) {
  const withNumericRelevance = rawResults
    .map(r => ({ ...r, relevance: Number(r.relevance) }))
    .filter(r => Number.isFinite(r.relevance));
  const matches = withNumericRelevance.filter(r => r.relevance >= MATCH_THRESHOLD);
  const possible = withNumericRelevance.filter(r => r.relevance >= POSSIBLE_THRESHOLD && r.relevance < MATCH_THRESHOLD);
  const byRecency = (a, b) => (b.last_action_date || "").localeCompare(a.last_action_date || "");
  matches.sort(byRecency);
  possible.sort(byRecency);
  return { matches, possible };
}

function toResponseShape(r, level, confidence) {
  return {
    level,
    state: r.state || null,
    billId: r.bill_id,
    billNumber: r.bill_number || null,
    title: r.title || null,
    lastActionDate: r.last_action_date || null,
    lastAction: r.last_action || null,
    relevance: r.relevance,
    confidence, // "match" | "possible"
  };
}

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: { ...corsHeaders(req), "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" },
    });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[resolve-bill] admin init:", err.message);
    return new Response(JSON.stringify({ success: false, error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;
    const query = (body.query || "").trim();
    const level = body.level === "state" ? "state" : "federal";
    const state = (body.state || "AZ").toUpperCase(); // real param, not hardcoded deeper than this — see file header
    const searchState = level === "federal" ? "US" : state; // confirmed real LegiScan jurisdiction code for Congress

    if (!query) {
      return new Response(JSON.stringify({ success: false, error: "A bill name or issue description is required." }), { status: 400, headers: corsHeaders(req) });
    }

    // ── Auth ────────────────────────────────────────────────────────────
    let uid;
    try {
      uid = await requireSignedIn(app, idToken);
    } catch {
      return new Response(JSON.stringify({ success: false, error: "You must be signed in to use this tool." }), { status: 401, headers: corsHeaders(req) });
    }

    // ── Rate limit — abuse guard, applies regardless of whether Perplexity
    // ends up being called (LegiScan is free, but still not open season) ──
    const usage = await checkAndIncrementRateLimit(app, uid);
    if (usage.blocked) {
      return new Response(JSON.stringify(usage.blockedPayload), { status: 429, headers: corsHeaders(req) });
    }

    // ── Real LegiScan search, raw query, no Perplexity involved yet ──────
    let rawResults;
    try {
      rawResults = await legiscanSearch(searchState, query);
    } catch (err) {
      console.error("[resolve-bill] LegiScan search failed:", err.message);
      return new Response(JSON.stringify({ success: false, error: "Search is temporarily unavailable. Try again shortly." }), { status: 502, headers: corsHeaders(req) });
    }

    let { matches, possible } = tierAndSort(rawResults);
    let creditWarning, usageWarning;

    // ── Fallback: raw query found nothing usable — ask Perplexity to
    // reformulate the query text (never a bill identifier), retry once.
    // This is the ONLY path that costs a real Perplexity call/credit. ────
    if (matches.length === 0 && possible.length === 0) {
      const balanceCheck = await checkGenerationBalance(app, usage.orgId, "resolve-bill");
      if (balanceCheck.blocked) {
        return new Response(JSON.stringify(generationBlockedPayload(balanceCheck.balance)), { status: 402, headers: corsHeaders(req) });
      }
      if (balanceCheck.warning) creditWarning = generationWarningPayload(balanceCheck.balance);

      let raw;
      try {
        raw = await callPerplexity({ system: reformulateSystemPrompt(level, state), query, maxTokens: 200 });
      } catch (err) {
        console.error("[resolve-bill] Perplexity reformulation call failed:", err.message);
        // Fail into "no results" rather than a hard error — the raw search
        // already genuinely ran and found nothing; a reformulation
        // service hiccup shouldn't turn into a 502 for the whole request.
        return new Response(JSON.stringify({ success: true, bills: [], reason: "No matching bills found for that search." }), { status: 200, headers: corsHeaders(req) });
      }

      if (raw.usage) {
        console.log(`[resolve-bill] token_usage: uid=${uid} prompt_tokens=${raw.usage.prompt_tokens} completion_tokens=${raw.usage.completion_tokens}`);
        await debitGenerationCredits(app, {
          orgId: usage.orgId,
          uid,
          functionName: "resolve-bill",
          inputTokens: raw.usage.prompt_tokens,
          outputTokens: raw.usage.completion_tokens,
        });
      }

      const reformulated = extractPerplexityText(raw).trim();
      if (reformulated) {
        try {
          rawResults = await legiscanSearch(searchState, reformulated);
          ({ matches, possible } = tierAndSort(rawResults));
        } catch (err) {
          console.error("[resolve-bill] LegiScan retry search failed:", err.message);
        }
      }

    }
    if (usage.warning) usageWarning = { used: usage.used, limit: usage.limit, remaining: usage.remaining };

    // ── Drop bills with zero recorded votes — see file header. Applied
    // once here, after tiering is final (whether from the raw query or
    // the reformulation retry), not duplicated across both search paths. ─
    [matches, possible] = await Promise.all([
      filterToBillsWithVotes(matches),
      filterToBillsWithVotes(possible),
    ]);

    const combined = [
      ...matches.slice(0, RESULT_CAP).map(r => toResponseShape(r, level, "match")),
    ];
    if (combined.length < RESULT_CAP) {
      combined.push(...possible.slice(0, RESULT_CAP - combined.length).map(r => toResponseShape(r, level, "possible")));
    }

    const responseBody = { success: true, bills: combined };
    if (combined.length === 0) responseBody.reason = "No matching bills found for that search. Try different wording, or the bill's official name if you know it.";
    if (creditWarning) responseBody.creditWarning = creditWarning;
    if (usageWarning) responseBody.usageWarning = usageWarning;

    return new Response(JSON.stringify(responseBody), { status: 200, headers: corsHeaders(req) });

  } catch (err) {
    console.error("[resolve-bill] error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
