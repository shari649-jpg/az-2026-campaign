// netlify/functions/upload-community-notes.mjs
// Called from AdminPage after client-side TSV parsing.
// Receives pre-parsed notes array + stats, stores in Netlify Blobs.
//
// AUTH: admin-only. Previously this file's comment claimed "no auth check
// here since it's behind the admin UI" — that was NOT actually enforced:
// the client (AdminPage.jsx) sends an idToken in the payload, but this
// function never read or verified it, so anyone with the URL could POST
// fabricated notes/stats and overwrite what the BS Monitor displays to
// every user. Fixed July 2026 security pass — same requireAdmin pattern
// used in manage-user.mjs / send-invite.mjs.

import { getStore } from "@netlify/blobs";
import admin from "firebase-admin";
import { readFileSync } from "node:fs";

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

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  let serviceAccount;
  try {
    const raw = readFileSync(new URL("./firebase-service-account.json", import.meta.url), "utf8");
    serviceAccount = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      "firebase-service-account.json not found or invalid — run `npm run build` to regenerate it via scripts/inject-secrets.mjs, or confirm FIREBASE_SERVICE_ACCOUNT_JSON is set in Netlify (Builds scope)."
    );
  }
  const credential = admin.credential.cert(serviceAccount);
  return admin.initializeApp({ credential });
}

// Verify the caller's ID token and confirm they hold the administrator role
// in Firestore before allowing this collection to be overwritten. This is
// the only thing standing between this endpoint and "anyone can inject
// fake misinformation data into the BS Monitor."
async function requireAdmin(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  const snap = await admin.firestore(app).doc(`users/${decoded.uid}`).get();
  const role = snap.exists ? snap.data().role : null;
  if (role !== "administrator") throw new Error("forbidden");
  return decoded.uid;
}

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error("[upload-community-notes] admin init error:", err.message);
    return new Response(JSON.stringify({ error: "Server is not configured for this yet." }), {
      status: 500, headers: corsHeaders(req),
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const { notes, stats, count, uploadedAt, idToken: bodyToken } = body;
    const idToken = headerToken || bodyToken;

    // ── Auth ──────────────────────────────────────────────────────────────
    try {
      await requireAdmin(app, idToken);
    } catch (err) {
      const status = err.message === "unauthenticated" ? 401 : 403;
      return new Response(JSON.stringify({ error: "Not authorized to perform this action." }), {
        status, headers: corsHeaders(req),
      });
    }

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
