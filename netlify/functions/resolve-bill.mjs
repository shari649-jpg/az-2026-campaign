// netlify/functions/resolve-bill.mjs
//
// WHAT THIS DOES
// ────────────────────────────────────────────────────────────────────────
// Front door of the bill-lookup feature (Aug 2026 scoping — see the
// Congress.gov integration design discussion). Takes free text — either a
// specific bill name ("CHIPS Act") or a general issue ("semiconductor
// manufacturing") — and uses Perplexity to resolve it to one of two
// response shapes:
//
//   mode: "single" — Perplexity was confident about ONE specific bill.
//     Skip straight to results; the frontend should immediately call
//     bill-votes.mjs (not yet built as of this file) with the returned
//     identifier.
//   mode: "list"    — Perplexity found several bills relevant to an issue.
//     The frontend shows these as a picklist; the user's selection then
//     also feeds into bill-votes.mjs the same way.
//
// This function does NOT talk to Congress.gov and does NOT return vote
// data — it only identifies WHICH bill(s) are relevant. bill-votes.mjs
// (separate function, next piece of this build) is what actually pulls
// the authoritative record and vote breakdown once a bill is picked. This
// split matters because Congress.gov's official API has NO keyword/text
// search at all (confirmed against its real docs) — Perplexity is doing a
// job Congress.gov's API structurally cannot do, and Congress.gov is doing
// a job Perplexity shouldn't be trusted for (authoritative structured
// legislative data). Don't collapse these into one function later without
// re-reading this note.
//
// RESPONSE CONTRACT (for bill-votes.mjs to consume)
// ────────────────────────────────────────────────────────────────────────
// A resolved bill identifier always has this shape:
//   { congress: number, billType: string, billNumber: number, title: string }
// billType is one of Congress.gov's own official codes — HR, S, HJRES,
// SJRES, HCONRES, SCONRES, HRES, SRES (confirmed exhaustive list from the
// Congress.gov bill endpoint docs) — enforced via the prompt below, not
// just hoped for, since bill-votes.mjs will build a literal API path
// segment out of this value.
//
// AUTH / RATE LIMIT / COST
// ────────────────────────────────────────────────────────────────────────
// Same requireSignedIn pattern as every other internal tool (this is not
// a public page like public-voter-lookup.mjs). Every call is a real,
// billed Perplexity call — gated by the SAME checkAndIncrementRateLimit
// daily cap AND the SAME org generationBalance credit pool every other
// generation function uses (folded in deliberately, Aug 2026 decision —
// see perplexity-search.mjs's header for why). A blocked/zero-balance org
// gets the exact same 429/402 shapes the other five generation tools
// already return, so the frontend's existing credit-warning banner
// handling (Handoff #34) works here without new UI plumbing.
//
// Modern Netlify Functions runtime (ESM).

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";
import { debitGenerationCredits, checkGenerationBalance, generationBlockedPayload, generationWarningPayload } from "./creditHelper.mjs";
import { callPerplexity, extractPerplexityText } from "./perplexity-search.mjs";

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

const VALID_BILL_TYPES = new Set(["HR", "S", "HJRES", "SJRES", "HCONRES", "SCONRES", "HRES", "SRES"]);

const SYSTEM_PROMPT = `You identify official U.S. federal bills from informal names or issue descriptions, for a political research tool. You must respond with ONLY valid JSON — no markdown, no code fences, no preamble, no explanation outside the JSON.

Two possible response shapes:

1. If the input names ONE specific, identifiable piece of federal legislation (a formal or informal bill name, e.g. "CHIPS Act", "Inflation Reduction Act", "H.R. 4346"), respond with:
{"mode":"single","bill":{"congress":<number>,"billType":"<one of HR|S|HJRES|SJRES|HCONRES|SCONRES|HRES|SRES>","billNumber":<number>,"title":"<official short title>"}}

2. If the input describes a general ISSUE or TOPIC rather than one specific bill (e.g. "semiconductor manufacturing", "immigration reform", "prescription drug prices"), respond with a short list (3-6) of the most relevant, well-known federal bills addressing that issue:
{"mode":"list","bills":[{"congress":<number>,"billType":"<...>","billNumber":<number>,"title":"<official short title>","summary":"<one sentence, plain language>"}]}

IMPORTANT for list mode: this tool can currently only show House vote results, not Senate. When multiple real bills address the issue, prefer House-originated bills (billType HR, HJRES, HCONRES, HRES) over Senate-originated ones (S, SJRES, SCONRES, SRES) in your list. Only include a Senate bill if it's genuinely the most relevant/well-known bill on the issue with no comparable House-side bill — don't pad the list with Senate bills purely for variety.

If you cannot confidently identify any real federal bill, respond with:
{"mode":"none","reason":"<brief explanation>"}

billType MUST be exactly one of: HR, S, HJRES, SJRES, HCONRES, SCONRES, HRES, SRES — these are literal U.S. Congress bill-type codes, not abbreviations you invent. congress and billNumber MUST be actual integers you are confident about, not placeholders. Do not fabricate a bill number if you are not genuinely confident — use mode "none" instead; a wrong bill number is worse than admitting uncertainty.`;

function parseResolverJSON(text) {
  // Strip markdown code fences defensively, same convention used
  // elsewhere in this app for AI JSON output (see the Anthropic-API-in-
  // artifacts error-handling guidance this project already follows).
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned); // let a real parse failure throw — caught by the outer try/catch below

  if (parsed.mode === "single") {
    const b = parsed.bill;
    if (!b || !VALID_BILL_TYPES.has(b.billType) || !Number.isInteger(b.congress) || !Number.isInteger(b.billNumber)) {
      throw new Error("resolver returned an invalid single-bill shape");
    }
    return parsed;
  }
  if (parsed.mode === "list") {
    if (!Array.isArray(parsed.bills) || parsed.bills.length === 0) {
      throw new Error("resolver returned an invalid list shape");
    }
    for (const b of parsed.bills) {
      if (!VALID_BILL_TYPES.has(b.billType) || !Number.isInteger(b.congress) || !Number.isInteger(b.billNumber)) {
        throw new Error("resolver returned an invalid bill entry inside a list");
      }
    }
    return parsed;
  }
  if (parsed.mode === "none") return parsed;

  throw new Error(`resolver returned an unrecognized mode: ${parsed.mode}`);
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

    // ── Rate limit — same daily per-user cap every generation tool uses ──
    const usage = await checkAndIncrementRateLimit(app, uid);
    if (usage.blocked) {
      return new Response(JSON.stringify(usage.blockedPayload), { status: 429, headers: corsHeaders(req) });
    }

    // ── Generation-credit gate — folded in deliberately, see file header ─
    const balanceCheck = await checkGenerationBalance(app, usage.orgId, "resolve-bill");
    if (balanceCheck.blocked) {
      return new Response(JSON.stringify(generationBlockedPayload(balanceCheck.balance)), { status: 402, headers: corsHeaders(req) });
    }

    // ── Perplexity call ────────────────────────────────────────────────
    let raw;
    try {
      raw = await callPerplexity({ system: SYSTEM_PROMPT, query, maxTokens: 800 });
    } catch (err) {
      console.error("[resolve-bill] Perplexity call failed:", err.message);
      return new Response(JSON.stringify({ success: false, error: "Search is temporarily unavailable. Try again shortly." }), { status: 502, headers: corsHeaders(req) });
    }

    const text = extractPerplexityText(raw);
    let resolved;
    try {
      resolved = parseResolverJSON(text);
    } catch (err) {
      console.error("[resolve-bill] failed to parse resolver output:", err.message, "raw text:", text);
      return new Response(JSON.stringify({ success: false, error: "Couldn't confidently identify a bill from that. Try naming it more specifically, e.g. an official or commonly-used bill title." }), { status: 422, headers: corsHeaders(req) });
    }

    // ── Credit debit — mind the Perplexity/Anthropic field-name mismatch,
    // see perplexity-search.mjs's header for why this matters ───────────
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

    const responseBody = { success: true, ...resolved };
    if (balanceCheck.warning) responseBody.creditWarning = generationWarningPayload(balanceCheck.balance);
    if (usage.warning) responseBody.usageWarning = { used: usage.used, limit: usage.limit, remaining: usage.remaining };

    return new Response(JSON.stringify(responseBody), { status: 200, headers: corsHeaders(req) });

  } catch (err) {
    console.error("[resolve-bill] error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
