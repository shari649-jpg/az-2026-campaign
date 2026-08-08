// netlify/functions/generate-rebuttal.mjs
// Rebuttal Generator — modern Netlify Functions runtime (ESM)
//
// Auth:       requires a valid Firebase ID token (any signed-in user)
// Rate limit: 50/day (user), 100/day (manager), 200/day (administrator)
//             Note: each full rebuttal generation makes 2 calls to this function.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";
import { debitGenerationCredits, checkGenerationBalance, generationBlockedPayload, generationWarningPayload } from "./creditHelper.mjs";
import { FACTUAL_ACCURACY_GUARDRAIL } from "../../src/lib/guardrails.js";

// COST FIX (this session) — see generate-message.mjs for the full
// reasoning: max_tokens was entirely client-controlled with no upper
// bound. Capped well above this app's own default (600) rather than
// tightened toward it, preserving the deliberate "generous ceiling avoids
// truncation" design while closing the unbounded-client-value gap.
const MAX_TOKENS_CEILING = 8000;

// Model centralization (Aug 2026 TODO items 4/5) — previously hardcoded
// "claude-sonnet-4-5" directly in the fetch body below, so this function
// couldn't be switched without a code change even though generate-message.mjs
// already supported it via env var. Now reads the same GENERATION_MODEL var,
// pinned to the dated string (not the bare alias) so it can't silently drift.
const GENERATION_MODEL = process.env.GENERATION_MODEL || "claude-sonnet-4-5-20250929";

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
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: { ...corsHeaders(req), "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" },
    });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[generate-rebuttal] admin init:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
  }

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

    // ── Rate limit ──────────────────────────────────────────────────────────
    const usage = await checkAndIncrementRateLimit(app, uid);
    if (usage.blocked) {
      return new Response(JSON.stringify(usage.blockedPayload), { status: 429, headers: corsHeaders(req) });
    }

    // ── Generation-credit gate ────────────────────────────────────────────
    // Pre-call check, decided this session — see creditHelper.mjs's header.
    // Each of this function's two calls per rebuttal checks independently —
    // if the first call spends the org right down to the block threshold,
    // the second call is meant to catch that, not skip the check because
    // "we already checked once this request."
    const balanceCheck = await checkGenerationBalance(app, usage.orgId, "generate-rebuttal");
    if (balanceCheck.blocked) {
      return new Response(JSON.stringify(generationBlockedPayload(balanceCheck.balance)), { status: 402, headers: corsHeaders(req) });
    }

    // ── Claude call ─────────────────────────────────────────────────────────
    const { messages, system, max_tokens } = body;

    // Server-side guardrail enforcement (Handoff #21, Group F). Never trust
    // the client to have included the factual-accuracy rule — it previously
    // only existed client-side (rebuttal-campaign-generator.jsx), so a
    // modified client or a direct call to this endpoint could skip it
    // entirely. If the client's system prompt already contains it, don't
    // duplicate; otherwise append it so it's always enforced regardless of
    // caller. Note this function is called twice per full rebuttal
    // generation — both calls get the guardrail enforced identically.
    const clientSystem = typeof system === "string" ? system : "";
    const effectiveSystem = clientSystem.includes("FACTUAL ACCURACY:")
      ? clientSystem
      : [clientSystem, FACTUAL_ACCURACY_GUARDRAIL].filter(Boolean).join("\n\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: GENERATION_MODEL, max_tokens: Math.min(max_tokens || 600, MAX_TOKENS_CEILING), messages, system: effectiveSystem }),
    });

    const data = await response.json();

    // Real per-call token usage, logged for credit-rate truing (Aug 2026
    // TODO item 6). Note this function is called twice per full rebuttal
    // generation (see file header) — each call logs its own usage.
    if (data.usage) {
      console.log(`[generate-rebuttal] token_usage: uid=${uid} input_tokens=${data.usage.input_tokens} output_tokens=${data.usage.output_tokens} model=${GENERATION_MODEL}`);
      // Generation-credit debiting (Aug 2026 TODO item 7). Note this
      // function is called twice per full rebuttal generation (see file
      // header) — each call debits its own real usage independently.
      await debitGenerationCredits(app, {
        orgId: usage.orgId,
        uid,
        functionName: "generate-rebuttal",
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      });
    }

    if (balanceCheck.warning) {
      data.creditWarning = generationWarningPayload(balanceCheck.balance);
    }

    if (usage.warning) {
      data.usageWarning = { used: usage.used, limit: usage.limit, remaining: usage.remaining };
    }

    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders(req) });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
