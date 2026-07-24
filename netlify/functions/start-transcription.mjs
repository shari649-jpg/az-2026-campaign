// netlify/functions/start-transcription.mjs
// Prompt Sandbox — video/audio-to-transcript feature. Submits a Firebase
// Storage download URL to AssemblyAI's async transcription API and
// returns the resulting job ID. Deliberately does NOT proxy the file
// itself through this function — the client uploads directly to Firebase
// Storage first (see sandboxLibrary.js's uploadTranscriptSource), and
// AssemblyAI fetches the audio from that URL server-side on their end.
// This keeps the function body tiny and fast regardless of file size,
// and sidesteps Netlify's 26-second synchronous timeout (already a known,
// unresolved limitation elsewhere in this app — see Handoff #26) since
// this call only has to submit a job, not wait for transcription to
// finish. Poll check-transcription.mjs for the actual result.
//
// Auth:       Manager/Administrator only, same gate as the rest of the
//             Prompt Sandbox (generate-sandbox-text.mjs).
// Rate limit: NOT wired into checkAndIncrementRateLimit — that counter
//             tracks Claude API calls specifically (a token-cost meter),
//             and this hits a separate service with its own per-minute
//             cost model. Left unmetered for now; a manager repeatedly
//             uploading large files has no daily cap yet. Flagged as a
//             known gap, not an oversight — worth a real decision (a
//             separate counter? a per-file duration cap?) before this
//             sees heavy use, not silently bolted onto the Claude counter
//             where it would misrepresent what's actually being spent.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";

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
    console.error("[start-transcription] admin init:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;

    try {
      await requireManagerOrAdmin(app, idToken);
    } catch (err) {
      const status = err.message === "forbidden" ? 403 : 401;
      const msg = err.message === "forbidden"
        ? "Video/audio transcription is limited to Managers and Administrators."
        : "You must be signed in to use this tool.";
      return new Response(JSON.stringify({ error: msg }), { status, headers: corsHeaders(req) });
    }

    const { audioUrl } = body;
    if (!audioUrl || typeof audioUrl !== "string") {
      return new Response(JSON.stringify({ error: "Missing audioUrl." }), { status: 400, headers: corsHeaders(req) });
    }

    if (!process.env.ASSEMBLYAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Transcription isn't configured yet — an Administrator needs to add ASSEMBLYAI_API_KEY in Netlify's environment variables." }), { status: 500, headers: corsHeaders(req) });
    }

    const response = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        "authorization": process.env.ASSEMBLYAI_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ audio_url: audioUrl }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[start-transcription] AssemblyAI error:", data);
      return new Response(JSON.stringify({ error: data.error || "Transcription service rejected the request." }), { status: 502, headers: corsHeaders(req) });
    }

    return new Response(JSON.stringify({ id: data.id }), { status: 200, headers: corsHeaders(req) });
  } catch (err) {
    console.error("[start-transcription] FAILED:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
