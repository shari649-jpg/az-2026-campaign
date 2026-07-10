// netlify/functions/check-waitlist-email.mjs
// Public endpoint: given an email address, reports only whether that email
// already exists in the waitlist collection. Used by WaitlistPage.jsx's
// duplicate-check before allowing a new signup.
//
// This replaces a direct client-side Firestore `list` query
// (where("email","==",...) + limit(1)) that ran against a security rule
// permitting any `limit<=1` list — which is enumerable: an attacker can
// walk the entire waitlist one document at a time via repeated cursored
// queries, extracting every applicant's name/email/organization. This
// function uses the Admin SDK (bypasses Firestore rules entirely) and
// returns nothing but a boolean, so there's no data left to enumerate.
// No auth required — matches the previous behavior, since this check runs
// for a brand-new visitor filling out the public waitlist form who has no
// account yet. Fixed July 2026 security pass, alongside firestore.rules
// locking the waitlist collection's get/list down to admin-only.

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
    serviceAccount = JSON.parse(readFileSync(new URL("./firebase-service-account.json", import.meta.url), "utf8"));
  } catch {
    throw new Error("firebase-service-account.json not found — run `npm run build` to regenerate via scripts/inject-secrets.mjs.");
  }
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error("[check-waitlist-email] admin init error:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), {
      status: 500, headers: corsHeaders(req),
    });
  }

  try {
    const { email } = await req.json();
    const emailLower = (email || "").toLowerCase().trim();
    if (!emailLower) {
      return new Response(JSON.stringify({ error: "Missing email." }), {
        status: 400, headers: corsHeaders(req),
      });
    }

    const snap = await admin.firestore(app)
      .collection("waitlist")
      .where("email", "==", emailLower)
      .limit(1)
      .get();

    return new Response(JSON.stringify({ exists: !snap.empty }), {
      status: 200, headers: corsHeaders(req),
    });
  } catch (err) {
    console.error("[check-waitlist-email] error:", err.message);
    return new Response(JSON.stringify({ error: "Could not check waitlist status." }), {
      status: 500, headers: corsHeaders(req),
    });
  }
}
