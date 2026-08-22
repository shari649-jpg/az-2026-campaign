// netlify/functions/start-message-generation.mjs
// Message Machine's generateAll — Background Functions rearchitecture
// (August 2026, TODO #7). Real, already-hit-in-production problem this
// fixes: generateAll fires up to 3 concurrent generate-message.mjs calls
// (PLATFORM_GROUPS), and the 26-second Netlify synchronous-function
// timeout has been hit for real on large research-block inputs even at
// that batch size — see Handoff #36. Standard Netlify Functions cannot be
// configured past that ceiling; Background Functions can run up to 15
// minutes, but ONLY as a fire-and-forget invocation that always returns an
// empty 202 immediately, regardless of what the handler does — there is no
// way to hand the actual generated text back on the same request. So this
// is split into two functions, same shape as start-transcription.mjs /
// check-transcription.mjs's existing async-job pattern in this codebase:
//
//   1. THIS function — fast, synchronous, well under 26s. Does everything
//      that needs to give the user immediate feedback (auth, quota/credit
//      pre-check), creates a generationJobs/{jobId} doc, and hands off to
//      generate-message-background.mjs. Returns { jobId } to the client.
//   2. generate-message-background.mjs — does the actual Claude call(s)
//      for every platform group, with real per-group rate-limit/credit
//      enforcement (the pre-check here is a fast-fail courtesy for the
//      common "already blocked" case, not the only enforcement point —
//      see that file for the real, authoritative checks), and writes the
//      result (or per-group errors) into the job doc when done. The
//      client listens to that doc directly via a Firestore snapshot
//      listener — no separate "check" function needed, since Netlify is
//      the one writing the result, not a third-party API the way
//      check-transcription.mjs has to poll AssemblyAI.
//
// Scope: Message Machine's generateAll specifically, not every Claude-
// calling function in this app — this is where the real production
// timeout was actually measured. Other generators (Storms, Rebuttal,
// Sandbox) share the same theoretical risk but haven't hit it in
// production; revisit if/when one does.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

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

// Mirrors rateLimitHelper.mjs's LIMITS table exactly — kept in sync by
// hand, same as AdminPage.jsx's own DAILY_LIMITS mirror. Deliberately a
// READ, not the real check-and-increment transaction that file exports —
// this is a fast-fail courtesy for the common "you're already at your
// limit" case, not the authoritative enforcement. The real, atomic
// check-and-increment (same function, same guarantees against concurrent-
// request races) runs once per platform group inside
// generate-message-background.mjs, exactly where it ran before this
// rearchitecture — nothing about the real quota enforcement changed, only
// where in the pipeline the fast-fail feedback happens.
const LIMITS = { administrator: 200, manager: 100, user: 50 };
function todayUTC() { return new Date().toISOString().slice(0, 10); }

async function peekQuotaAndBalance(app, uid, groupCount) {
  const db = admin.firestore(app);
  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.exists ? userSnap.data() : {};
  const today = todayUTC();

  const role = user.role || "user";
  const baseLimit = LIMITS[role] ?? LIMITS.user;
  const standing = Number.isFinite(Number(user.dailyLimitStanding)) && Number(user.dailyLimitStanding) > 0 ? Number(user.dailyLimitStanding) : 0;
  const hasFreshOverride = user.dailyLimitOverrideDate === today;
  const override = hasFreshOverride ? (user.dailyLimitOverride || 0) : 0;
  const limit = baseLimit + standing + override;
  const used = user.dailyCallsDate === today ? (user.dailyCalls || 0) : 0;
  const remaining = limit - used;

  if (remaining <= 0) {
    return { blocked: true, status: 429, payload: {
      error: "rate_limit_exceeded", used, limit, remaining: 0,
      message: `You've reached your daily limit of ${limit} AI calls. Your limit resets at midnight UTC. Contact an administrator if you need more access today.`,
    } };
  }

  const orgId = user.orgId || null;
  if (orgId) {
    const orgSnap = await db.doc(`orgs/${orgId}`).get();
    const balance = orgSnap.exists ? (orgSnap.data()?.credits?.generationBalance ?? 0) : 0;
    if (balance <= 0) {
      return { blocked: true, status: 402, payload: {
        error: "generation_credits_exhausted", balance,
        message: "Your organization's AI-generation credits are used up. An Administrator can add more from the Admin panel's Orgs tab (\"Grant comp credits\") — no Stripe account is needed for this. Self-serve credit purchase isn't built yet; contact your Administrator directly.",
      } };
    }
  }

  return { blocked: false, orgId };
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
    console.error("[start-message-generation] admin init:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;

    let uid;
    try {
      uid = await requireSignedIn(app, idToken);
    } catch {
      return new Response(JSON.stringify({ error: "You must be signed in to use this tool." }), { status: 401, headers: corsHeaders(req) });
    }

    // groups: [{ platformIds: ["facebook","instagram"], staticSystem: "...",
    // dynamicPrompt: "...", maxTokens: 1000 }, ...] — the static/dynamic
    // split from buildPromptParts() (Aug 2026, prompt caching), not a
    // single flat prompt string anymore. This function doesn't build or
    // alter prompt content, only validates shape and batches submission.
    // origin (Aug 22 2026, optional) — e.g. "rapid-response", set by
    // message-machine.jsx when the current session started from a Rapid
    // Response push. Persisted onto the job doc below (not just this
    // request) because generateAll's actual debit happens later, inside
    // generate-message-background.mjs — a separate invocation that only
    // has the job doc to read from, not this request body.
    const { groups, origin } = body;
    if (!Array.isArray(groups) || groups.length === 0) {
      return new Response(JSON.stringify({ error: "Missing groups." }), { status: 400, headers: corsHeaders(req) });
    }
    for (const g of groups) {
      if (!g || typeof g.staticSystem !== "string" || !g.staticSystem.trim()
        || typeof g.dynamicPrompt !== "string" || !g.dynamicPrompt.trim()
        || !Array.isArray(g.platformIds) || g.platformIds.length === 0) {
        return new Response(JSON.stringify({ error: "Malformed group in request." }), { status: 400, headers: corsHeaders(req) });
      }
    }

    let precheck;
    try {
      precheck = await peekQuotaAndBalance(app, uid, groups.length);
    } catch (err) {
      console.error("[start-message-generation] precheck failed:", err.message);
      return new Response(JSON.stringify({ error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
    }
    if (precheck.blocked) {
      return new Response(JSON.stringify(precheck.payload), { status: precheck.status, headers: corsHeaders(req) });
    }

    const jobId = randomUUID();
    const db = admin.firestore(app);
    await db.doc(`generationJobs/${jobId}`).set({
      uid,
      orgId: precheck.orgId,
      status: "pending",
      groups: groups.map(g => ({ platformIds: g.platformIds, staticSystem: g.staticSystem, dynamicPrompt: g.dynamicPrompt, maxTokens: g.maxTokens || 1000 })),
      origin: typeof origin === "string" ? origin : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Fire-and-forget hand-off to the Background Function. Netlify accepts
    // a Background Function invocation and returns 202 immediately,
    // without waiting for the handler to actually run — so this await
    // resolves fast regardless of how long the real generation ends up
    // taking. Deliberately not sending the prompt content again in this
    // request body: the background function reads the same job doc this
    // function just wrote, so there's exactly one place groups/prompts
    // live, not two copies that could drift.
    const siteUrl = process.env.URL || "https://arizonacoalition.net";
    try {
      await fetch(`${siteUrl}/.netlify/functions/generate-message-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
    } catch (err) {
      // The job doc already exists as "pending" — if the hand-off itself
      // failed to even queue, mark it failed now rather than leaving the
      // client polling a job that will never update.
      console.error("[start-message-generation] background hand-off failed:", err.message);
      await db.doc(`generationJobs/${jobId}`).set({ status: "error", error: "Failed to start generation. Please try again." }, { merge: true });
      return new Response(JSON.stringify({ error: "Failed to start generation. Please try again." }), { status: 500, headers: corsHeaders(req) });
    }

    return new Response(JSON.stringify({ jobId }), { status: 200, headers: corsHeaders(req) });
  } catch (err) {
    console.error("[start-message-generation] FAILED:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
