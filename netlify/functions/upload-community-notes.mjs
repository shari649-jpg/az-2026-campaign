// netlify/functions/upload-community-notes.mjs
// Called from AdminPage after client-side TSV parsing.
// Receives pre-parsed notes array + stats, stores in Netlify Blobs.
// Admins only — no auth check here since it's behind the admin UI,
// but the payload is validated before storing.

import { getStore } from "@netlify/blobs";

// CORS: transition period, both the new custom domain and the legacy
// Netlify subdomain are accepted as request origins. Browsers only honor a
// single exact-match origin in this header, so we reflect back whichever
// allowed origin actually made the request.
// TODO: drop ALLOWED_ORIGINS[1] (legacy netlify.app) once the old domain
// is fully retired and nothing still links to it.
const ALLOWED_ORIGINS = [
  "https://arizonacoalition.net",
  "https://az-coalition-2026-election.netlify.app",
];
function corsHeaders(req) {
  const origin = req.headers.get("origin");
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": allowOrigin, "Content-Type": "application/json" };
}

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const body = await req.json();
    const { notes, stats, count, uploadedAt } = body;

    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return new Response(JSON.stringify({ error: "No notes data provided." }), {
        status: 400, headers: corsHeaders(req),
      });
    }

    const payload = {
      notes,
      stats,
      count,
      fetchedAt: uploadedAt || new Date().toISOString(),
      source: "manual-upload",
    };

    const store = getStore("community-notes");
    await store.set("latest", JSON.stringify(payload));

    console.log(`[upload-community-notes] Stored ${count} notes in Netlify Blobs.`);

    return new Response(JSON.stringify({ success: true, count }), {
      status: 200, headers: corsHeaders(req),
    });

  } catch (err) {
    console.error("[upload-community-notes] error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders(req),
    });
  }
}
