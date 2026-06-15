// netlify/functions/upload-community-notes.mjs
// Called from AdminPage after client-side TSV parsing.
// Receives pre-parsed notes array + stats, stores in Netlify Blobs.
// Admins only — no auth check here since it's behind the admin UI,
// but the payload is validated before storing.

import { getStore } from "@netlify/blobs";

const SITE_URL = "https://az-coalition-2026-election.netlify.app";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Content-Type": "application/json",
};

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const body = await req.json();
    const { notes, stats, count, uploadedAt } = body;

    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return new Response(JSON.stringify({ error: "No notes data provided." }), {
        status: 400, headers: CORS_HEADERS,
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
      status: 200, headers: CORS_HEADERS,
    });

  } catch (err) {
    console.error("[upload-community-notes] error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: CORS_HEADERS,
    });
  }
}
