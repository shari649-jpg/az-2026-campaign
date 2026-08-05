// netlify/functions/grant-credits.mjs
// Admin-only: adds credits directly to an org's balance (generation or
// transcription pool) with NO Stripe interaction at all — this is the
// comp-credits path (A.8 in the pricing/decisions report), for beta orgs
// or any other case where credits need to exist without a purchase.
//
// Every grant does two things atomically, in one Firestore transaction:
//   1. Increments orgs/{orgId}.credits.{generationBalance|transcriptionBalance}
//   2. Writes a new doc to orgs/{orgId}/creditGrants/{autoId} — an
//      immutable audit-trail entry (amount, creditType, reason, who
//      granted it, when). This is what keeps a beta org's comped usage
//      distinguishable from a real purchase in any future billing report.
//
// Auth: Administrator only (not Manager) — matches firestore.rules'
// orgs/{orgId} write gate (allow create, update, delete: if isAdmin()).
// This function uses the Admin SDK, which bypasses those rules entirely,
// but enforces the identical boundary itself via requireAdmin() below —
// the rules and this function are two independent enforcement points
// checking the same thing, which is deliberate, not redundant: rules
// protect any future direct client write to orgs/{orgId}; this function
// protects this specific privileged action.
//
// grantedBy is taken from the verified ID token server-side, never from
// the request body — a client cannot claim credit for someone else's
// grant, and the audit trail can't be spoofed by whatever the client
// happened to send.

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

async function requireAdmin(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  const snap = await admin.firestore(app).doc(`users/${decoded.uid}`).get();
  const role = snap.exists ? (snap.data().role || "user") : "user";
  if (role !== "administrator") throw new Error("forbidden");
  return { uid: decoded.uid, email: decoded.email || snap.data()?.email || null };
}

const VALID_CREDIT_TYPES = new Set(["generation", "transcription"]);
const BALANCE_SUBFIELD = {
  generation: "generationBalance",
  transcription: "transcriptionBalance",
};
const MAX_GRANT_AMOUNT = 1_000_000; // sanity ceiling — catches a stray extra zero, not a real limit

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
    console.error("[grant-credits] admin init:", err.message);
    return new Response(JSON.stringify({ error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;

    let admin_;
    try {
      admin_ = await requireAdmin(app, idToken);
    } catch (err) {
      const status = err.message === "forbidden" ? 403 : 401;
      const msg = err.message === "forbidden"
        ? "Granting credits is limited to Administrators."
        : "You must be signed in to use this tool.";
      return new Response(JSON.stringify({ error: msg }), { status, headers: corsHeaders(req) });
    }

    const { orgId, creditType, amount, reason } = body;

    if (!orgId || typeof orgId !== "string") {
      return new Response(JSON.stringify({ error: "Missing orgId." }), { status: 400, headers: corsHeaders(req) });
    }
    if (!VALID_CREDIT_TYPES.has(creditType)) {
      return new Response(JSON.stringify({ error: `creditType must be one of: ${[...VALID_CREDIT_TYPES].join(", ")}.` }), { status: 400, headers: corsHeaders(req) });
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0 || !Number.isInteger(amountNum)) {
      return new Response(JSON.stringify({ error: "amount must be a positive whole number." }), { status: 400, headers: corsHeaders(req) });
    }
    if (amountNum > MAX_GRANT_AMOUNT) {
      return new Response(JSON.stringify({ error: `amount is larger than expected (over ${MAX_GRANT_AMOUNT.toLocaleString()}) — double-check before granting this much at once.` }), { status: 400, headers: corsHeaders(req) });
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return new Response(JSON.stringify({ error: "reason is required — it's what shows up in the audit trail." }), { status: 400, headers: corsHeaders(req) });
    }

    const db = admin.firestore(app);
    const orgRef = db.doc(`orgs/${orgId}`);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      return new Response(JSON.stringify({ error: `No org found with ID "${orgId}".` }), { status: 404, headers: corsHeaders(req) });
    }

    const balanceSubfield = BALANCE_SUBFIELD[creditType];
    const grantRef = orgRef.collection("creditGrants").doc();

    // Atomic: the balance increment and the audit-trail entry either both
    // happen or neither does — no partial state where credits moved but
    // there's no record of why, or vice versa.
    //
    // BUG FIX (Aug 5): this previously wrote a dotted STRING as a plain
    // object key — e.g. { "credits.transcriptionBalance": increment(n) }
    // — which Firestore stores as a literal field named
    // "credits.transcriptionBalance" (dot included in the name), NOT a
    // nested credits map. Every read site expects org.credits.{field} as
    // a real nested object, so that data was invisible everywhere it was
    // read, even though it was "there" in the Console under the wrong
    // kind of field. Writing an actual nested object below lets
    // Firestore's merge:true do a proper deep merge — only the specific
    // leaf field changes, the other balance under credits is untouched.
    await db.runTransaction(async (tx) => {
      tx.set(orgRef, { credits: { [balanceSubfield]: admin.firestore.FieldValue.increment(amountNum) } }, { merge: true });
      tx.set(grantRef, {
        amount: amountNum,
        creditType,
        reason: reason.trim(),
        grantedBy: admin_.uid,
        grantedByEmail: admin_.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    const updatedSnap = await orgRef.get();
    const credits = updatedSnap.data()?.credits || { generationBalance: 0, transcriptionBalance: 0 };

    return new Response(JSON.stringify({ ok: true, credits }), { status: 200, headers: corsHeaders(req) });
  } catch (err) {
    console.error("[grant-credits] FAILED:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
