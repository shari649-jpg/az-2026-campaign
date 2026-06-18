// netlify/functions/generate-rebuttal.mjs
// Rebuttal Generator — two-call AI generation — modern Netlify Functions runtime (ESM)
//
// Auth: requires a valid Firebase ID token from a signed-in coalition member.

import admin from "firebase-admin";

const CORS_ORIGIN = "https://az-coalition-2026-election.netlify.app";
const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN,
};

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON env var not set");
  const credential = admin.credential.cert(JSON.parse(json));
  return admin.initializeApp({ credential });
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
      headers: {
        ...CORS_HEADERS,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error("[generate-rebuttal] admin init error:", err.message);
    return new Response(JSON.stringify({ error: "Server is not configured for auth yet." }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;

    try {
      await requireSignedIn(app, idToken);
    } catch (err) {
      const status = err.message === "unauthenticated" ? 401 : 403;
      return new Response(JSON.stringify({ error: "You must be signed in to use this tool." }), {
        status,
        headers: CORS_HEADERS,
      });
    }

    const { messages, system, max_tokens } = body;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: max_tokens || 600,
        messages,
        ...(system && { system }),
      }),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}
