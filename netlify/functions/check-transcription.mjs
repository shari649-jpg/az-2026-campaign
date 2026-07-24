// netlify/functions/check-transcription.mjs
// Prompt Sandbox — polls AssemblyAI for the status/result of a job
// submitted by start-transcription.mjs. The client calls this repeatedly
// (every few seconds) until status is "completed" or "error" — this
// polling-from-the-client pattern, rather than a single long-held
// request, is what keeps every individual function call short and inside
// Netlify's 26-second synchronous limit regardless of how long the
// underlying video is.
//
// Auth:       Manager/Administrator only, same gate as the rest of the
//             Prompt Sandbox.
// Rate limit: Not metered — see start-transcription.mjs's header comment.
//             A poll request is cheap on AssemblyAI's side (status check,
//             not a re-transcription), so repeated polling isn't a cost
//             concern the way repeated transcription submissions would be.

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
    console.error("[check-transcription] admin init:", err.message);
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

    const { transcriptId } = body;
    if (!transcriptId || typeof transcriptId !== "string") {
      return new Response(JSON.stringify({ error: "Missing transcriptId." }), { status: 400, headers: corsHeaders(req) });
    }

    if (!process.env.ASSEMBLYAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Transcription isn't configured yet — an Administrator needs to add ASSEMBLYAI_API_KEY in Netlify's environment variables." }), { status: 500, headers: corsHeaders(req) });
    }

    const response = await fetch(`https://api.assemblyai.com/v2/transcript/${encodeURIComponent(transcriptId)}`, {
      headers: { "authorization": process.env.ASSEMBLYAI_API_KEY },
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[check-transcription] AssemblyAI error:", data);
      return new Response(JSON.stringify({ error: data.error || "Transcription service error." }), { status: 502, headers: corsHeaders(req) });
    }

    // AssemblyAI status values: queued | processing | completed | error
    return new Response(JSON.stringify({
      status: data.status,
      text: data.status === "completed" ? data.text : null,
      error: data.status === "error" ? (data.error || "Transcription failed.") : null,
    }), { status: 200, headers: corsHeaders(req) });
  } catch (err) {
    console.error("[check-transcription] FAILED:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
