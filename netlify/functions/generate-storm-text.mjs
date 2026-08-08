// netlify/functions/generate-storm-text.mjs
// Storm Chasers Hub — per-platform post text generation/rephrase.
// Modern Netlify Functions runtime (ESM). Mirrors generate-message.mjs's
// pattern exactly (Handoff #15, decision #7) — plain pass-through to Claude,
// same as every other tool's generate function. Prompt construction
// (platform framing, tone, etc.) happens client-side in StormPostEditor.jsx,
// but the factual-accuracy guardrail is now enforced server-side as well
// (Handoff #21, Group F) — see the note below the auth/rate-limit block.
//
// Auth:       requires a valid Firebase ID token (any signed-in user)
// Rate limit: 50/day (user), 100/day (manager), 200/day (administrator)
//             Warning returned in response at 75% usage.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";
import { debitGenerationCredits, checkGenerationBalance, generationBlockedPayload, generationWarningPayload } from "./creditHelper.mjs";
import { FACTUAL_ACCURACY_GUARDRAIL } from "../../src/lib/guardrails.js";
import { AI_TELL_PHRASING_BAN } from "../../src/lib/messageRules.js";

// COST FIX (this session) — see generate-message.mjs for the full
// reasoning: max_tokens was entirely client-controlled with no upper
// bound. Capped well above this app's own default (700) rather than
// tightened toward it, preserving the deliberate "generous ceiling avoids
// truncation" design while closing the unbounded-client-value gap.
const MAX_TOKENS_CEILING = 8000;

// Model centralization (Aug 2026 TODO items 4/5) — previously hardcoded
// "claude-sonnet-4-5" directly in the fetch body below. Now reads
// GENERATION_MODEL, pinned to the dated string (not the bare alias) so it
// can't silently drift.
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
    console.error("[generate-storm-text] admin init:", err.message);
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
    const balanceCheck = await checkGenerationBalance(app, usage.orgId, "generate-storm-text");
    if (balanceCheck.blocked) {
      return new Response(JSON.stringify(generationBlockedPayload(balanceCheck.balance)), { status: 402, headers: corsHeaders(req) });
    }

    // ── Claude call ─────────────────────────────────────────────────────────
    const { max_tokens, messages, system } = body;

    // Server-side guardrail enforcement (Handoff #21, Group F). Never trust
    // the client to have included the factual-accuracy rule.
    //
    // Storms is a different shape than Message Machine/Rebuttal: those two
    // send the guardrail via `system`, but StormPostEditor.jsx bakes
    // FACTUAL_ACCURACY_GUARDRAIL directly into the prompt text inside
    // `messages` instead (see buildGeneratePrompt/buildRephrasePrompt) and
    // never sends a `system` field at all. The original patch only checked
    // `system` for the guardrail header, so every Storm call looked
    // "unguarded" and got a second copy injected via a system field Storms
    // was never architected to send — the guardrail ended up duplicated,
    // and Storms started sending a system param it didn't have before.
    // Fixed: check the actual message content too, and only add a system
    // field when the guardrail isn't already present anywhere in the request.
    //
    // AI_TELL_PHRASING_BAN (added this session) follows the exact same
    // already-present check, for the same reason — StormPostEditor.jsx now
    // bakes it into buildGeneratePrompt/buildRephrasePrompt directly, so
    // this only needs to add it via `system` for a caller that skipped it
    // (a modified client, or a direct call to this endpoint).
    const clientSystem = typeof system === "string" ? system : "";
    const messagesText = Array.isArray(messages)
      ? messages.map(m => (typeof m.content === "string" ? m.content : "")).join("\n")
      : "";
    const missingPieces = [
      (!clientSystem.includes("FACTUAL ACCURACY:") && !messagesText.includes("FACTUAL ACCURACY:")) ? FACTUAL_ACCURACY_GUARDRAIL : null,
      (!clientSystem.includes("AVOID AI-SOUNDING PHRASING:") && !messagesText.includes("AVOID AI-SOUNDING PHRASING:")) ? AI_TELL_PHRASING_BAN : null,
    ].filter(Boolean);
    const effectiveSystem = missingPieces.length
      ? [clientSystem, ...missingPieces].filter(Boolean).join("\n\n")
      : clientSystem;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: GENERATION_MODEL, max_tokens: Math.min(max_tokens || 700, MAX_TOKENS_CEILING), messages, ...(effectiveSystem && { system: effectiveSystem }) }),
    });

    const data = await response.json();

    // Real per-call token usage, logged for credit-rate truing (Aug 2026
    // TODO item 6).
    if (data.usage) {
      console.log(`[generate-storm-text] token_usage: uid=${uid} input_tokens=${data.usage.input_tokens} output_tokens=${data.usage.output_tokens} model=${GENERATION_MODEL}`);
      // Generation-credit debiting (Aug 2026 TODO item 7).
      await debitGenerationCredits(app, {
        orgId: usage.orgId,
        uid,
        functionName: "generate-storm-text",
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      });
    }

    if (balanceCheck.warning) {
      data.creditWarning = generationWarningPayload(balanceCheck.balance);
    }

    // Attach usage warning if approaching limit
    if (usage.warning) {
      data.usageWarning = { used: usage.used, limit: usage.limit, remaining: usage.remaining };
    }

    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders(req) });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
