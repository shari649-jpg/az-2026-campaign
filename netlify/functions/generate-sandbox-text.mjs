// netlify/functions/generate-sandbox-text.mjs
// Prompt Sandbox — freeform-prompt generation for Managers/Administrators
// (Handoff #26 follow-up). Mirrors generate-storm-text.mjs's structure
// exactly (same auth/rate-limit/CORS pattern as every AI-calling function
// in this app), with one addition: server-side injection of the
// org-identity preamble and topic-scope guardrail from messageRules.js,
// on top of the existing factual-accuracy guardrail from guardrails.js.
//
// Why three guardrails get checked/injected here instead of trusting the
// client: the whole point of this tool is that a manager can type
// anything into the freeform box. StormPostEditor.jsx builds its own
// prompt client-side and this function just double-checks it wasn't
// stripped — but the Sandbox's client-built prompt IS the freeform text,
// so nothing guarantees identity/scope wording survives whatever the
// manager pastes. These three get appended unconditionally rather than
// only-if-missing for that reason (the "if already present" dedup check
// storms use assumes the client tried to include it first — here we can't
// assume the client attempted it at all).
//
// Auth:       requires a valid Firebase ID token, Manager or Administrator only
// Rate limit: shares the same daily counter/limits as every other tool
//             (checkAndIncrementRateLimit) — this is not a separate quota

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { checkAndIncrementRateLimit } from "./rateLimitHelper.mjs";
import { debitGenerationCredits, checkGenerationBalance, generationBlockedPayload, generationWarningPayload } from "./creditHelper.mjs";
import { FACTUAL_ACCURACY_GUARDRAIL } from "../../src/lib/guardrails.js";
import { ORG_IDENTITY_PREAMBLE, TOPIC_SCOPE_GUARDRAIL, AI_TELL_PHRASING_BAN } from "../../src/lib/messageRules.js";

// COST FIX (this session) — see generate-message.mjs for the full
// reasoning: max_tokens was entirely client-controlled with no upper
// bound. Capped well above this app's own default (4000, the highest of
// any tool) rather than tightened toward it, preserving the deliberate
// "generous ceiling avoids truncation" design while closing the
// unbounded-client-value gap.
const MAX_TOKENS_CEILING = 8000;

// Model centralization (Aug 2026 TODO items 4/5) — previously hardcoded
// "claude-sonnet-4-5" directly in the fetch body below. Now reads
// GENERATION_MODEL, pinned to the dated string (not the bare alias) so it
// can't silently drift.
const GENERATION_MODEL = process.env.GENERATION_MODEL || "claude-sonnet-4-5-20250929";

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

async function requireManagerOrAdmin(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  const snap = await admin.firestore(app).doc(`users/${decoded.uid}`).get();
  const role = snap.exists ? (snap.data().role || "user") : "user";
  if (role !== "manager" && role !== "administrator") {
    throw new Error("forbidden");
  }
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
    console.error("[generate-sandbox-text] admin init:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;

    // ── Auth — Manager/Administrator only ──────────────────────────────────
    let uid;
    try {
      uid = await requireManagerOrAdmin(app, idToken);
    } catch (err) {
      const status = err.message === "forbidden" ? 403 : 401;
      const msg = err.message === "forbidden"
        ? "The Prompt Sandbox is limited to Managers and Administrators."
        : "You must be signed in to use this tool.";
      return new Response(JSON.stringify({ error: msg }), { status, headers: corsHeaders(req) });
    }

    // ── Rate limit ──────────────────────────────────────────────────────────
    const usage = await checkAndIncrementRateLimit(app, uid);
    if (usage.blocked) {
      return new Response(JSON.stringify(usage.blockedPayload), { status: 429, headers: corsHeaders(req) });
    }

    // ── Generation-credit gate ────────────────────────────────────────────
    // Pre-call check, decided this session — see creditHelper.mjs's header.
    const balanceCheck = await checkGenerationBalance(app, usage.orgId, "generate-sandbox-text");
    if (balanceCheck.blocked) {
      return new Response(JSON.stringify(generationBlockedPayload(balanceCheck.balance)), { status: 402, headers: corsHeaders(req) });
    }

    // ── Claude call ─────────────────────────────────────────────────────────
    const { max_tokens, messages } = body;

    // Unconditional injection — see file header for why this doesn't use
    // the "already present" dedup pattern the other generate functions use.
    const effectiveSystem = [ORG_IDENTITY_PREAMBLE, TOPIC_SCOPE_GUARDRAIL, FACTUAL_ACCURACY_GUARDRAIL, AI_TELL_PHRASING_BAN].join("\n\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: GENERATION_MODEL,
        max_tokens: Math.min(max_tokens || 4000, MAX_TOKENS_CEILING),
        system: effectiveSystem,
        messages,
      }),
    });

    const data = await response.json();

    // Real per-call token usage, logged for credit-rate truing (Aug 2026
    // TODO item 6). Sandbox includes the optional transcript/title bundling
    // work from Handoff #27 — its token counts run higher than other tools
    // by design, worth watching separately once real usage data exists.
    if (data.usage) {
      console.log(`[generate-sandbox-text] token_usage: uid=${uid} input_tokens=${data.usage.input_tokens} output_tokens=${data.usage.output_tokens} model=${GENERATION_MODEL}`);
      // Generation-credit debiting (Aug 2026 TODO item 7).
      await debitGenerationCredits(app, {
        orgId: usage.orgId,
        uid,
        functionName: "generate-sandbox-text",
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
