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
// Two levels, two shapes, both passed through a `level` field:
//
//   Federal: { level:"federal", congress: number, billType: <Congress.gov
//     code>, billNumber: number, title: string }. billType is one of
//     Congress.gov's own official codes — HR, S, HJRES, SJRES, HCONRES,
//     SCONRES, HRES, SRES. Unchanged from the original federal-only build.
//
//   State:   { level:"state", state:"AZ", year: number, billType:
//     <LegiScan-native code>, billNumber: number, title: string }.
//     States have no Congress.gov equivalent (federal-only API) and no
//     "Congress number" — LegiScan indexes state sessions by literal
//     calendar year, and there's no other authoritative source to pull a
//     separate code system from, so billType here IS LegiScan's own
//     prefix directly: HB, SB, HR, SR, HJR, SJR, HCR, SCR. (These 8
//     letter-codes happen to overlap in spelling with the federal ones in
//     a couple of cases but mean different things — HR here means House
//     Resolution the same as it does for federal, this isn't the
//     HR-vs-HB trap that lives in bill-votes.mjs's federal->LegiScan
//     translation table; that trap only exists when converting FROM
//     Congress.gov's codes, and state mode never uses Congress.gov codes
//     at all.)
//
// `state` defaults to "AZ" (this org's actual candidate base) but is a
// real parameter, not hardcoded into the prompt logic — a future org
// tracking a different state would pass a different value. Worth knowing
// if that ever happens: LegiScan does NOT use HB/SB uniformly across all
// states (California's lower chamber bills are "AB", Assembly Bill, not
// "HB") — Arizona genuinely does use HB/SB (its chambers are House and
// Senate, same naming as federal), so this isn't a problem today, but a
// second state whose chamber naming differs would need its own bill-type
// vocabulary, not reuse of AZ's.
//
// VERIFICATION STEP — WHY THIS EXISTS (Aug 2026, real confirmed incident)
// ────────────────────────────────────────────────────────────────────────
// Perplexity can hallucinate a plausible-sounding title/summary for a
// REAL bill number that has nothing to do with the query. Confirmed case:
// searching "education vouchers" surfaced "HB 2401 — education;
// empowerment scholarship accounts" — HB 2401 is real, but it's actually
// "Fuel formulations; biennial review," completely unrelated. Asked
// directly, Perplexity explained its own mistake: Arizona's ESA program
// is governed by A.R.S. § 15-2401 — Perplexity had confused that STATUTE
// CITATION number with a BILL number that happens to share the digits.
//
// Rather than try to prompt this away entirely (a losing battle — no
// prompt wording fully prevents this class of mistake) or make the
// resolver overly conservative (which would suppress genuinely good
// results and just trade one failure mode for another), every bill this
// function is about to return — single or list mode — now gets checked
// against the REAL source (verifyBillExists() from
// legislative-lookup.mjs, the same LegiScan/Congress.gov lookup
// bill-votes.mjs itself uses) before being shown:
//   - If the bill doesn't actually exist for that congress/year+number,
//     it's DROPPED from the list rather than shown as a confident-looking
//     but fake option.
//   - If it does exist, its title is REPLACED with the real, authoritative
//     title — so even if Perplexity's description was wrong, the person
//     sees the true title immediately (in the case above, they'd see
//     "Fuel formulations; biennial review" right there in the list and
//     could skip it without ever clicking through) instead of being
//     misled by a fabricated summary that sounded right.
// This preserves recall (nothing is filtered by topical relevance, only
// by real existence) while fixing the actual reliability problem —
// exactly the balance to keep if this logic is ever touched again.
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
import { verifyBillExists } from "./legislative-lookup.mjs";

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

const VALID_FEDERAL_BILL_TYPES = new Set(["HR", "S", "HJRES", "SJRES", "HCONRES", "SCONRES", "HRES", "SRES"]);
const VALID_STATE_BILL_TYPES = new Set(["HB", "SB", "HR", "SR", "HJR", "SJR", "HCR", "SCR"]);

const FEDERAL_SYSTEM_PROMPT = `You identify official U.S. federal bills from informal names or issue descriptions, for a political research tool. You must respond with ONLY valid JSON — no markdown, no code fences, no preamble, no explanation outside the JSON.

Two possible response shapes:

1. If the input names ONE specific, identifiable piece of federal legislation (a formal or informal bill name, e.g. "CHIPS Act", "Inflation Reduction Act", "H.R. 4346"), respond with:
{"mode":"single","bill":{"level":"federal","congress":<number>,"billType":"<one of HR|S|HJRES|SJRES|HCONRES|SCONRES|HRES|SRES>","billNumber":<number>,"title":"<official short title>"}}

2. If the input describes a general ISSUE or TOPIC rather than one specific bill (e.g. "semiconductor manufacturing", "immigration reform", "prescription drug prices"), respond with a short list (3-6) of the most relevant, well-known federal bills addressing that issue:
{"mode":"list","bills":[{"level":"federal","congress":<number>,"billType":"<...>","billNumber":<number>,"title":"<official short title>","summary":"<one sentence, plain language>"}]}

If you cannot confidently identify any real federal bill, respond with:
{"mode":"none","reason":"<brief explanation>"}

billType MUST be exactly one of: HR, S, HJRES, SJRES, HCONRES, SCONRES, HRES, SRES — these are literal U.S. Congress bill-type codes, not abbreviations you invent. congress and billNumber MUST be actual integers you are confident about, not placeholders. Do not fabricate a bill number if you are not genuinely confident — use mode "none" instead; a wrong bill number is worse than admitting uncertainty.`;

function stateSystemPrompt(state) {
  return `You identify official ${state} state legislature bills from informal names or issue descriptions, for a political research tool. You must respond with ONLY valid JSON — no markdown, no code fences, no preamble, no explanation outside the JSON.

Two possible response shapes:

1. If the input names ONE specific, identifiable piece of ${state} state legislation, respond with:
{"mode":"single","bill":{"level":"state","state":"${state}","year":<number>,"billType":"<one of HB|SB|HR|SR|HJR|SJR|HCR|SCR>","billNumber":<number>,"title":"<official short title>"}}

2. If the input describes a general ISSUE or TOPIC rather than one specific bill, respond with a short list (3-6) of the most relevant, well-known ${state} state bills addressing that issue:
{"mode":"list","bills":[{"level":"state","state":"${state}","year":<number>,"billType":"<...>","billNumber":<number>,"title":"<official short title>","summary":"<one sentence, plain language>"}]}

If you cannot confidently identify any real ${state} state bill, respond with:
{"mode":"none","reason":"<brief explanation>"}

billType MUST be exactly one of: HB, SB, HR, SR, HJR, SJR, HCR, SCR — these are LegiScan's own bill-type codes (HB = House Bill, SB = Senate Bill, HR = House Resolution, SR = Senate Resolution, HJR/SJR = Joint Resolution, HCR/SCR = Concurrent Resolution). year is the calendar year the legislative session started (e.g. 2025), NOT a "Congress number" — states don't have those. year and billNumber MUST be actual integers you are confident about, not placeholders.

CRITICAL: do not confuse a BILL NUMBER with a STATUTE/CODE CITATION NUMBER. A program's governing law section (e.g. "A.R.S. § 15-2401") is NOT the same thing as a bill number (e.g. "HB 2401") even when the digits match — they refer to completely different things, and treating them as the same is a real, confirmed mistake to avoid. If you're recalling a bill number from a statute section it's associated with rather than from the bill itself, treat that as low confidence, not a real match. Do not fabricate a bill number if you are not genuinely confident — use mode "none" instead; a wrong bill number is worse than admitting uncertainty.`;
}

function validateBillShape(b) {
  if (!b) return false;
  if (b.level === "federal") {
    return VALID_FEDERAL_BILL_TYPES.has(b.billType) && Number.isInteger(b.congress) && Number.isInteger(b.billNumber);
  }
  if (b.level === "state") {
    return VALID_STATE_BILL_TYPES.has(b.billType) && Number.isInteger(b.year) && Number.isInteger(b.billNumber) && !!b.state;
  }
  return false; // missing/unrecognized level — treat as invalid rather than guess which schema applies
}

function parseResolverJSON(text) {
  // Strip markdown code fences defensively, same convention used
  // elsewhere in this app for AI JSON output (see the Anthropic-API-in-
  // artifacts error-handling guidance this project already follows).
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned); // let a real parse failure throw — caught by the outer try/catch below

  if (parsed.mode === "single") {
    if (!validateBillShape(parsed.bill)) {
      throw new Error("resolver returned an invalid single-bill shape");
    }
    return parsed;
  }
  if (parsed.mode === "list") {
    if (!Array.isArray(parsed.bills) || parsed.bills.length === 0) {
      throw new Error("resolver returned an invalid list shape");
    }
    for (const b of parsed.bills) {
      if (!validateBillShape(b)) {
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
    const level = body.level === "state" ? "state" : "federal"; // default federal — matches original behavior for any existing caller that doesn't pass this yet
    const state = (body.state || "AZ").toUpperCase(); // defaults to this org's actual candidate base; see file header on why this isn't hardcoded deeper than this

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
    const systemPrompt = level === "state" ? stateSystemPrompt(state) : FEDERAL_SYSTEM_PROMPT;
    let raw;
    try {
      raw = await callPerplexity({ system: systemPrompt, query, maxTokens: 800 });
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

    // ── Verification pass — see file header's "VERIFICATION STEP" note.
    // Every bill mode="single" or mode="list" is about to return gets
    // checked against the real source before being shown: dropped if it
    // doesn't actually exist, title replaced with the real one if it does.
    // This is what actually catches Perplexity's confident-but-wrong
    // guesses, not just the prompt wording above. ─────────────────────────
    if (resolved.mode === "single") {
      const check = await verifyBillExists(resolved.bill);
      if (!check.verified) {
        console.warn(`[resolve-bill] single-mode bill failed verification, treating as not found:`, JSON.stringify(resolved.bill));
        resolved = { mode: "none", reason: "Couldn't verify that bill actually exists — try naming it more specifically." };
      } else {
        resolved.bill.title = check.realTitle; // real title wins over Perplexity's own wording, even if the bill was real
        resolved.bill.summary = check.realSummary; // same for summary — see the real bug this fixed: a real title next to Perplexity's still-unverified (and in the confirmed incident, still-WRONG) original summary was worse than showing no summary at all
      }
    } else if (resolved.mode === "list") {
      const checks = await Promise.all(resolved.bills.map(b => verifyBillExists(b)));
      const verifiedBills = resolved.bills
        .map((b, i) => checks[i].verified ? { ...b, title: checks[i].realTitle, summary: checks[i].realSummary } : null)
        .filter(Boolean);
      const droppedCount = resolved.bills.length - verifiedBills.length;
      if (droppedCount > 0) {
        console.warn(`[resolve-bill] dropped ${droppedCount} of ${resolved.bills.length} list-mode suggestions that failed verification.`);
      }
      if (verifiedBills.length === 0) {
        resolved = { mode: "none", reason: "Found some possible matches, but none of them checked out against the real bill records. Try rephrasing the search." };
      } else {
        resolved = { mode: "list", bills: verifiedBills };
      }
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
