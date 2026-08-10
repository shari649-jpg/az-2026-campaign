// netlify/functions/provision-account.mjs
//
// WHAT THIS DOES (Aug 2026, individual-tier build)
// ────────────────────────────────────────────────────────────────────────
// Called by RegisterPage.jsx immediately after the base users/{uid} doc is
// created client-side. firestore.rules explicitly forbids a new user from
// self-assigning orgId at that step (see that rule's comment: "can't
// self-assign an org either") — this function is what actually does it,
// via the Admin SDK, which bypasses that client-side restriction because
// this action is gated on a REAL invite token, not on anything the client
// claims about itself.
//
// Re-reads the invite from Netlify Blobs itself rather than trusting
// accountType/orgId from the request body — the same "never trust the
// client for anything that determines access or billing" rule this app
// already follows everywhere else (grant-credits.mjs, manage-user.mjs).
//
// Also absorbs two things RegisterPage.jsx used to do as separate calls:
// marking the invite token used (previously a separate validate-token
// action=consume call) and marking the waitlist entry "registered"
// (previously a direct client updateDoc — still allowed by
// firestore.rules, but redundant now that this function already needs to
// touch the same invite data in the same request). One server round trip
// instead of three.
//
// ORG PATH vs. INDIVIDUAL PATH ("org of one")
// ────────────────────────────────────────────────────────────────────────
// Org: sets users/{uid}.orgId to whatever the Admin resolved at invite-
// send time (AdminPage.jsx's waitlist org-picker) — a real, already-
// confirmed org, never inferred here.
//
// Individual: every existing credit/rate-limit function in this app
// (creditHelper.mjs, rateLimitHelper.mjs, all 7 generation functions) is
// built entirely around orgId. Rather than thread a parallel no-org code
// path through all of that already-hardened logic, an individual gets a
// real orgs/{uid} doc of their own — "org of one" — so every existing
// function works completely unmodified. kind: "individual" is what lets
// org pickers elsewhere in the app (research visibility, invite org-
// selection, candidate focus) filter these out — see AdminPage.jsx's
// coalitionOrgs (orgs.filter(o => o.kind !== "individual")).
//
// Starts at a real $0 balance on purpose — requiresPurchase is what
// actually gates the app until a real Stripe purchase lands, not the
// zero balance itself (a zero balance alone would only block AI-tool
// usage, not the whole app — see AuthGuard.jsx for the harder block).
//
// Modern Netlify Functions runtime (ESM).

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { getStore } from "@netlify/blobs";

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
    console.error("[provision-account] admin init:", err.message);
    return new Response(JSON.stringify({ success: false, error: "Server configuration error." }), { status: 500, headers: corsHeaders(req) });
  }

  try {
    const { idToken, token } = await req.json();
    if (!idToken || !token) {
      return new Response(JSON.stringify({ success: false, error: "Missing idToken or invite token." }), { status: 400, headers: corsHeaders(req) });
    }

    // Confirms the caller is a real, just-authenticated user and gives us
    // a trusted uid to write to — the uid is NEVER taken from the request
    // body, only from the verified token.
    let uid, callerEmail;
    try {
      const decoded = await admin.auth(app).verifyIdToken(idToken);
      uid = decoded.uid;
      callerEmail = decoded.email;
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Not authenticated." }), { status: 401, headers: corsHeaders(req) });
    }

    // Re-read the invite from Blobs directly — the authoritative source.
    const store = getStore("invites");
    let raw;
    try {
      raw = await store.get(token);
    } catch {
      raw = null;
    }
    if (!raw) {
      return new Response(JSON.stringify({ success: false, error: "Invalid invite token." }), { status: 400, headers: corsHeaders(req) });
    }
    const invite = JSON.parse(raw);

    if (invite.used) {
      return new Response(JSON.stringify({ success: false, error: "This invite has already been used." }), { status: 400, headers: corsHeaders(req) });
    }
    if (new Date(invite.expiresAt) < new Date()) {
      return new Response(JSON.stringify({ success: false, error: "This invite has expired." }), { status: 400, headers: corsHeaders(req) });
    }
    // Doesn't block on mismatch — email casing/whitespace edge cases
    // aren't worth hard-failing registration over, and the invite token
    // itself (not the email match) is what's actually authoritative here.
    // Logged so a real problem is still visible.
    if (callerEmail && invite.email && callerEmail.toLowerCase() !== invite.email.toLowerCase()) {
      console.warn(`[provision-account] email mismatch: authenticated as ${callerEmail}, invite issued to ${invite.email}`);
    }

    const db = admin.firestore(app);
    const accountType = invite.accountType === "org" ? "org" : "individual";

    if (accountType === "org") {
      if (!invite.orgId) {
        return new Response(JSON.stringify({ success: false, error: "This invite is missing its org assignment. Contact an Administrator." }), { status: 400, headers: corsHeaders(req) });
      }
      // Confirm the org still exists before assigning it — could
      // theoretically have been removed between invite-send and
      // registration. Cheap to check, fails closed rather than silently
      // assigning a dangling orgId.
      const orgSnap = await db.doc(`orgs/${invite.orgId}`).get();
      if (!orgSnap.exists) {
        return new Response(JSON.stringify({ success: false, error: "The organization for this invite no longer exists. Contact an Administrator." }), { status: 400, headers: corsHeaders(req) });
      }
      await db.doc(`users/${uid}`).update({ orgId: invite.orgId });
    } else {
      await db.doc(`orgs/${uid}`).set({
        kind: "individual",
        name: invite.fullName || callerEmail || uid,
        addons: {},
        credits: { generationBalance: 0, transcriptionBalance: 0 },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.doc(`users/${uid}`).update({
        orgId: uid,
        requiresPurchase: true,
      });
    }

    // Mark the invite used and the waitlist entry registered — see file
    // header on why these are folded in here rather than left as
    // RegisterPage.jsx's separate calls.
    await store.set(token, JSON.stringify({ ...invite, used: true }));
    if (invite.waitlistId) {
      try {
        await db.doc(`waitlist/${invite.waitlistId}`).update({
          status: "registered",
          registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        // Non-fatal — the account itself is already fully provisioned;
        // a waitlist bookkeeping miss shouldn't fail registration.
        console.error(`[provision-account] waitlist status update failed for ${invite.waitlistId}:`, err.message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      accountType,
      requiresPurchase: accountType === "individual",
    }), { status: 200, headers: corsHeaders(req) });

  } catch (err) {
    console.error("[provision-account] error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders(req) });
  }
}
