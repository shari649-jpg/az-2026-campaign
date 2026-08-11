// netlify/functions/check-waitlist-invite.mjs
// Authenticated endpoint: given the signed-in caller's OWN verified email
// (taken from their decoded Firebase ID token, never trusted from the
// request body), looks up whether it matches an "invited" waitlist entry.
// If so, returns the fields LoginPage.jsx needs to create the new
// users/{uid} doc (fullName, primarySocial, organization) plus the
// waitlist doc's id, so the client can mark that entry "registered".
//
// This replaces a direct client-side Firestore `list` query
// (where("email","==",...) + where("status","==","invited") + limit(1))
// that ran against a security rule permitting any `limit<=1` list — which
// is enumerable via repeated cursored queries. This function uses the
// Admin SDK (bypasses Firestore rules entirely) and only ever looks up
// the caller's own verified email, so there's nothing here for another
// account to enumerate. Fixed July 2026 security pass, alongside
// firestore.rules locking the waitlist collection's get/list down to
// admin-only.
//
// Called right after signInWithPopup succeeds in LoginPage.jsx — the
// caller has a valid Firebase Auth session at that point even though they
// don't have a Firestore users/{uid} doc yet, so requireSignedIn (not
// requireAdmin) is the correct check here.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";

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

// Returns the decoded token (includes .uid and .email), not just the uid —
// this endpoint needs the caller's verified email address.
async function requireSignedIn(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  return decoded;
}

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error("[check-waitlist-invite] admin init error:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), {
      status: 500, headers: corsHeaders(req),
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json().catch(() => ({}));
    const idToken = headerToken || body.idToken;

    let decoded;
    try {
      decoded = await requireSignedIn(app, idToken);
    } catch {
      return new Response(JSON.stringify({ error: "You must be signed in to use this tool." }), {
        status: 401, headers: corsHeaders(req),
      });
    }

    const emailLower = (decoded.email || "").toLowerCase().trim();
    if (!emailLower) {
      return new Response(JSON.stringify({ invited: false }), {
        status: 200, headers: corsHeaders(req),
      });
    }

    const snap = await admin.firestore(app)
      .collection("waitlist")
      .where("email", "==", emailLower)
      .where("status", "==", "invited")
      .limit(1)
      .get();

    if (snap.empty) {
      return new Response(JSON.stringify({ invited: false }), {
        status: 200, headers: corsHeaders(req),
      });
    }

    const waitlistDoc = snap.docs[0];
    const data = waitlistDoc.data();

    return new Response(JSON.stringify({
      invited: true,
      waitlistId: waitlistDoc.id,
      fullName: data.fullName || "",
      primarySocial: data.primarySocial || { platform: "", handle: "" },
      organization: data.organization || "",
      // Aug 2026 individual-tier addition — written by send-invite.mjs
      // alongside the Blobs invite token, so the Google Sign-In path
      // (which never sees that token) can still resolve the same
      // accountType/org assignment. provision-account.mjs is the one
      // that actually acts on this — never acted on directly here.
      accountType: data.accountType === "org" ? "org" : "individual",
      resolvedOrgId: data.accountType === "org" ? (data.resolvedOrgId || null) : null,
    }), {
      status: 200, headers: corsHeaders(req),
    });
  } catch (err) {
    console.error("[check-waitlist-invite] error:", err.message);
    return new Response(JSON.stringify({ error: "Could not check waitlist invite." }), {
      status: 500, headers: corsHeaders(req),
    });
  }
}
