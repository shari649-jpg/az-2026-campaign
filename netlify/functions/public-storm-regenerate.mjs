// netlify/functions/public-storm-regenerate.mjs
//
// Public, unauthenticated "Regenerate" for a single storm post's platform
// text (Handoff #19/#22 spec). Sibling to public-storm.mjs, same posture:
// no login, uses the Admin SDK deliberately to bypass Firestore rules.
//
// ALWAYS EPHEMERAL — this never writes back to the post doc. The stored
// text a member curated is the only thing anyone else ever sees by
// default; this just hands back a one-off alternate phrasing for the
// requester's own screen.
//
// The entire prompt is built server-side from real stored data. The
// client sends only { token, postId, platformKey } — never prompt text,
// never a system field, never anything that could smuggle in an
// unguarded request. Storm access is independently re-verified
// (public + active + unexpired) at request time, exactly like
// public-storm.mjs, rather than trusting the token alone.
//
// Three independent rate-limit breakers, matching the Handoff #19 spec:
//   - 20 / day per requesting IP
//   - 200 / day per storm
//   - 1,000 / day sitewide
// Tripping ANY of them blocks with 429 (client disables the button, does
// not hide it, until UTC midnight). A manual kill-switch
// (config/publicRegenerate.enabled) lets Manager/Admin turn the whole
// feature off from AdminPage.jsx with no deploy. Either a breaker trip or
// (implicitly) heavy use triggers a one-per-day alert email so staff
// notice abuse without watching logs.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { FACTUAL_ACCURACY_GUARDRAIL } from "../../src/lib/guardrails.js";

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

// Same Arizona-timezone handling as public-storm.mjs / scheduled-archive-storms.mjs.
const ARIZONA_UTC_OFFSET = "-07:00";
function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const hasExplicitOffset = /[zZ]|[+-]\d\d:\d\d$/.test(expiresAt);
  const asArizonaTime = hasExplicitOffset ? expiresAt : `${expiresAt}${ARIZONA_UTC_OFFSET}`;
  const t = new Date(asArizonaTime).getTime();
  return !isNaN(t) && t <= Date.now();
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function getClientIp(req) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

// Minimal platform metadata duplicated here on purpose — stormLibrary.js
// is a browser-side module (imports the client Firestore SDK via
// ../firebase) and can't be imported from a Netlify Function. Keep these
// two lists in sync with stormLibrary.js's PLATFORMS/CHAR_LIMITS if either
// ever changes.
const PLATFORM_LABELS = {
  facebook: "Facebook", instagram: "Instagram", twitter: "X / Twitter",
  threads: "Threads", tiktok: "TikTok", bluesky: "Bluesky",
};
const CHAR_LIMITS = {
  facebook: 63206, instagram: 2200, twitter: 280, threads: 500, tiktok: 2200, bluesky: 300,
};

const RATE_LIMITS = { ip: 20, storm: 200, sitewide: 1000 };
const ALERT_EMAIL = "shari@arizonacoalition.net";
const FROM_EMAIL = "noreply@arizonacoalition.net";
const FROM_NAME  = "Arizona Coalition Comms Hub";

async function sendBreakerAlert(db, breaker, detail) {
  // One alert per breaker type per day — a tripped breaker stays tripped
  // for the rest of the day, so without this a single busy storm would
  // otherwise send hundreds of identical emails.
  const alertRef = db.doc(`publicRegenLimits/alert_${todayUTC()}_${breaker}`);
  const snap = await alertRef.get();
  if (snap.exists) return;
  await alertRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp(), breaker, detail });

  if (!process.env.RESEND_API_KEY) return; // don't hard-fail the request over a missing email config
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: ALERT_EMAIL,
        subject: `🚦 Public Regenerate rate limit tripped (${breaker})`,
        html: `<p>The public "Regenerate" feature on the storm public pages hit its <strong>${breaker}</strong> daily limit.</p><p>${detail}</p><p>This resets at UTC midnight. If this looks like abuse rather than normal traffic, use the kill switch in Admin → Public Regenerate.</p>`,
      }),
    });
  } catch (e) {
    console.error("[public-storm-regenerate] alert email failed:", e.message);
  }
}

// Checks all three breakers and increments all three counters together if
// none are tripped. Returns { blocked: false } or { blocked: true, breaker }.
async function checkAndIncrementLimits(db, ip, stormId) {
  const today = todayUTC();
  const ipRef       = db.doc(`publicRegenLimits/ip_${today}_${ip}`);
  const stormRef     = db.doc(`publicRegenLimits/storm_${today}_${stormId}`);
  const sitewideRef = db.doc(`publicRegenLimits/sitewide_${today}`);

  const [ipSnap, stormSnap, sitewideSnap] = await Promise.all([ipRef.get(), stormRef.get(), sitewideRef.get()]);
  const ipCount       = ipSnap.exists ? (ipSnap.data().count || 0) : 0;
  const stormCount     = stormSnap.exists ? (stormSnap.data().count || 0) : 0;
  const sitewideCount = sitewideSnap.exists ? (sitewideSnap.data().count || 0) : 0;

  if (ipCount >= RATE_LIMITS.ip) {
    await sendBreakerAlert(db, "ip", `IP ${ip} reached ${RATE_LIMITS.ip}/day.`);
    return { blocked: true, breaker: "ip" };
  }
  if (stormCount >= RATE_LIMITS.storm) {
    await sendBreakerAlert(db, "storm", `Storm ${stormId} reached ${RATE_LIMITS.storm}/day.`);
    return { blocked: true, breaker: "storm" };
  }
  if (sitewideCount >= RATE_LIMITS.sitewide) {
    await sendBreakerAlert(db, "sitewide", `Sitewide total reached ${RATE_LIMITS.sitewide}/day.`);
    return { blocked: true, breaker: "sitewide" };
  }

  await Promise.all([
    ipRef.set({ count: admin.firestore.FieldValue.increment(1) }, { merge: true }),
    stormRef.set({ count: admin.firestore.FieldValue.increment(1) }, { merge: true }),
    sitewideRef.set({ count: admin.firestore.FieldValue.increment(1) }, { merge: true }),
  ]);
  return { blocked: false };
}

function buildRegenPrompt(storm, platformKey, currentText) {
  const label = PLATFORM_LABELS[platformKey] || platformKey;
  const limit = CHAR_LIMITS[platformKey] || 500;
  const contextLines = [
    `Storm title: ${storm.title || "Not specified"}`,
    storm.subjectType ? `Subject: ${storm.subjectType}${storm.subjectName ? ` — ${storm.subjectName}` : ""}` : null,
    storm.summary ? `Summary: ${storm.summary}` : null,
    storm.description ? `Details: ${storm.description}` : null,
    storm.hashtag ? `Campaign hashtag: #${storm.hashtag}` : null,
  ].filter(Boolean).join("\n");

  return `You are an expert political messaging strategist rewriting an existing storm post for a public viewer who wants to see an alternate phrasing before posting it themselves.

${FACTUAL_ACCURACY_GUARDRAIL}

${contextLines}

CURRENT ${label} MESSAGE (${currentText.length} characters, max ${limit}):
${currentText}

INSTRUCTION: Rephrase this message. Keep the same length, meaning, and platform style, but use different wording, sentence structure, and framing. Do not add new facts, names, or figures beyond what's already here.

YOU MUST RESPOND ONLY WITH VALID JSON. No markdown. No backticks. No explanation. No refusal text. Only a JSON object.
Format: {"text": "rewritten post text"}`;
}

const generic = (extra) => ({ ok: false, ...extra });

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: { ...corsHeaders(req), "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" },
    });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[public-storm-regenerate] admin init:", err.message);
    return new Response(JSON.stringify(generic({ error: "unavailable" })), { status: 200, headers: corsHeaders(req) });
  }

  try {
    const body = await req.json();
    const token = String(body.token || "");
    const postId = String(body.postId || "");
    const platformKey = String(body.platformKey || "");
    if (!token || !postId || !platformKey || !CHAR_LIMITS[platformKey]) {
      return new Response(JSON.stringify(generic({ error: "bad_request" })), { status: 200, headers: corsHeaders(req) });
    }

    const db = admin.firestore(app);

    // Kill switch — Manager/Admin controlled from AdminPage.jsx, no deploy needed.
    const configSnap = await db.doc("config/publicRegenerate").get();
    const killSwitchOff = configSnap.exists && configSnap.data().enabled === false;
    if (killSwitchOff) {
      return new Response(JSON.stringify(generic({ error: "disabled" })), { status: 200, headers: corsHeaders(req) });
    }

    // Re-verify storm access exactly like public-storm.mjs — never trust
    // the token alone without re-checking live state.
    const stormSnap = await db.collection("storms").where("publicToken", "==", token).limit(1).get();
    if (stormSnap.empty) {
      return new Response(JSON.stringify(generic({ error: "unavailable" })), { status: 200, headers: corsHeaders(req) });
    }
    const stormDoc = stormSnap.docs[0];
    const storm = stormDoc.data();
    const isValid = storm.isPublic === true && storm.status === "active" && !isExpired(storm.expiresAt);
    if (!isValid) {
      return new Response(JSON.stringify(generic({ error: "unavailable" })), { status: 200, headers: corsHeaders(req) });
    }

    const postSnap = await db.collection("storms").doc(stormDoc.id).collection("posts").doc(postId).get();
    if (!postSnap.exists) {
      return new Response(JSON.stringify(generic({ error: "unavailable" })), { status: 200, headers: corsHeaders(req) });
    }
    const post = postSnap.data();
    const currentText = (post.texts || {})[platformKey];
    if (!currentText || !currentText.trim()) {
      return new Response(JSON.stringify(generic({ error: "unavailable" })), { status: 200, headers: corsHeaders(req) });
    }

    const ip = getClientIp(req);
    const limitResult = await checkAndIncrementLimits(db, ip, stormDoc.id);
    if (limitResult.blocked) {
      return new Response(JSON.stringify(generic({ error: "rate_limit_exceeded", breaker: limitResult.breaker })), { status: 429, headers: corsHeaders(req) });
    }

    const prompt = buildRegenPrompt(storm, platformKey, currentText);
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await anthropicRes.json();
    if (data.error) {
      console.error("[public-storm-regenerate] Anthropic error:", data.error);
      return new Response(JSON.stringify(generic({ error: "generation_failed" })), { status: 200, headers: corsHeaders(req) });
    }

    const text = (data.content || []).map(b => b.text || "").join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    if (!cleaned.startsWith("{")) {
      return new Response(JSON.stringify(generic({ error: "generation_failed" })), { status: 200, headers: corsHeaders(req) });
    }
    const parsed = JSON.parse(cleaned);

    return new Response(JSON.stringify({ ok: true, text: parsed.text || "" }), { status: 200, headers: corsHeaders(req) });
  } catch (err) {
    console.error("[public-storm-regenerate] error:", err.message);
    return new Response(JSON.stringify(generic({ error: "unavailable" })), { status: 200, headers: corsHeaders(req) });
  }
}
