// netlify/functions/generate-message.mjs
// Message Machine post generation — modern Netlify Functions runtime (ESM)
//
// Auth:       requires a valid Firebase ID token (any signed-in user)
// Rate limit: 50/day (user), 100/day (manager), 200/day (administrator)
//             Warning returned in response at 75% usage.
// Model:      Defaults to Sonnet 4.5 (set via GENERATION_MODEL env var —
//             Netlify dashboard → Project configuration → Environment
//             variables). Briefly defaulted to Haiku 4.5 for cost/speed —
//             reverted after real production use surfaced a factual/political
//             framing error (attributing inflation blame incorrectly),
//             which an initial side-by-side comparison hadn't caught. If
//             Haiku is reconsidered later, it needs a broader accuracy
//             review, not just a style comparison, before defaulting to it
//             again. To test it, set GENERATION_MODEL to
//             "claude-haiku-4-5-20251001" in Netlify and trigger a redeploy —
//             no code change needed either way.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";
import { FACTUAL_ACCURACY_GUARDRAIL } from "../../src/lib/guardrails.js";
import { AI_TELL_PHRASING_BAN } from "../../src/lib/messageRules.js";

const GENERATION_MODEL = process.env.GENERATION_MODEL || "claude-sonnet-4-5";
// COST FIX (this session): max_tokens was previously entirely client-
// controlled with no upper bound — only a default if omitted. Billing is
// by tokens actually generated, not by max_tokens reserved, so this isn't
// a guaranteed-cost exploit, but it does remove any ceiling on how
// expensive a single call can be made to run, independent of the 50/100/
// 200-per-day call-count limit. This app's own generous default here is
// 1000; capping well above that (not tightening toward it) preserves the
// existing "generous ceiling avoids truncation bugs" design while still
// closing the fact that a client could otherwise request an arbitrarily
// large one.
const MAX_TOKENS_CEILING = 8000;

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

export default async function (req) {
  const t0 = Date.now();
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: { ...corsHeaders(req), "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" },
    });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[generate-message] admin init:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
  }
  const tAdminInit = Date.now();
  console.log(`[generate-message] timing: admin_init=${tAdminInit - t0}ms`);

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;

    // ── Auth ────────────────────────────────────────────────────────────────
    let uid;
    try {
      uid = await requireSignedIn(app, idToken);
    } catch {
      return new Response(JSON.stringify({ error: "You must be signed in to use this tool." }), { status: 401, headers: corsHeaders(req) });
    }
    const tAuth = Date.now();
    console.log(`[generate-message] timing: auth=${tAuth - tAdminInit}ms uid=${uid}`);

    // ── Rate limit ──────────────────────────────────────────────────────────
    const usage = await checkAndIncrementRateLimit(app, uid);
    if (usage.blocked) {
      return new Response(JSON.stringify(usage.blockedPayload), { status: 429, headers: corsHeaders(req) });
    }
    const tRateLimit = Date.now();
    console.log(`[generate-message] timing: rate_limit=${tRateLimit - tAuth}ms`);

    // ── Claude call ─────────────────────────────────────────────────────────
    const { max_tokens, messages, system } = body;

    // Server-side guardrail enforcement (Handoff #21, Group F). Never trust
    // the client to have included the factual-accuracy rule — it previously
    // only existed client-side (message-machine.jsx), so a modified client
    // or a direct call to this endpoint could skip it entirely. If the
    // client's system prompt already contains it, don't duplicate; otherwise
    // append it so it's always enforced regardless of caller.
    //
    // AI_TELL_PHRASING_BAN enforced the same way as of this session — real
    // output was still landing on an obvious "this is not X, it is Y"
    // construction, so this needs the same client-can't-skip-it guarantee
    // the factual-accuracy rule already has.
    const clientSystem = typeof system === "string" ? system : "";
    const missingPieces = [
      !clientSystem.includes("FACTUAL ACCURACY:") ? FACTUAL_ACCURACY_GUARDRAIL : null,
      !clientSystem.includes("AVOID AI-SOUNDING PHRASING:") ? AI_TELL_PHRASING_BAN : null,
    ].filter(Boolean);
    const effectiveSystem = [clientSystem, ...missingPieces].filter(Boolean).join("\n\n");

    // Rough input size, logged before the call so it's visible in Netlify logs
    // even if the function gets killed by the 26s timeout mid-call.
    const inputChars = effectiveSystem.length + JSON.stringify(messages || []).length;
    console.log(`[generate-message] timing: calling Claude, model=${GENERATION_MODEL} input_chars=${inputChars} max_tokens=${max_tokens || 1000}`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: GENERATION_MODEL, max_tokens: Math.min(max_tokens || 1000, MAX_TOKENS_CEILING), messages, system: effectiveSystem }),
    });
    const tClaudeCall = Date.now();
    console.log(`[generate-message] timing: claude_call=${tClaudeCall - tRateLimit}ms status=${response.status}`);

    const data = await response.json();
    const tParse = Date.now();
    console.log(`[generate-message] timing: json_parse=${tParse - tClaudeCall}ms TOTAL=${tParse - t0}ms`);

    // Attach usage warning if approaching limit
    if (usage.warning) {
      data.usageWarning = { used: usage.used, limit: usage.limit, remaining: usage.remaining };
    }

    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders(req) });
  } catch (err) {
    console.error(`[generate-message] timing: FAILED at ${Date.now() - t0}ms —`, err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
