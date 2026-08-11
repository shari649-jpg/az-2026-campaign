// netlify/functions/provision-account.mjs
//
// WHAT THIS DOES (Aug 2026, individual-tier build)
// ────────────────────────────────────────────────────────────────────────
// Called right after a brand-new users/{uid} doc is created, from EITHER
// signup path this app has:
//   - Email/password (RegisterPage.jsx) — passes the real invite `token`
//     from the emailed link, resolved via Netlify Blobs.
//   - Google Sign-In (LoginPage.jsx) — never sees that token at all (no
//     link is clicked in that flow), so it passes `waitlistId` instead,
//     resolved by reading the waitlist Firestore doc directly. Trust here
//     rests on the same check already required to reach this point
//     (status "invited" AND the doc's email matching the caller's own
//     verified email) — re-verified independently here, not assumed
//     correct just because the client already checked it once.
// Both resolve to the same { accountType, orgId } shape and share all the
// same downstream provisioning logic below.
//
// firestore.rules explicitly forbids a new user from self-assigning
// orgId at doc-creation time (see that rule's comment: "can't self-assign
// an org either") — this function is what actually does it, via the
// Admin SDK, which bypasses that client-side restriction because this
// action is gated on real server-verified data, not anything the client
// claims about itself.
//
// Also absorbs what each signup path used to do as separate calls:
// marking the invite used (email/password path — previously a separate
// validate-token action=consume call) and marking the waitlist entry
// registered (both paths — previously a direct client updateDoc). One
// server round trip instead of two or three.
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
    const { idToken, token, waitlistId: waitlistIdParam } = await req.json();
    if (!idToken || (!token && !waitlistIdParam)) {
      return new Response(JSON.stringify({ success: false, error: "Missing idToken and either an invite token or waitlistId." }), { status: 400, headers: corsHeaders(req) });
    }

    // Confirms the caller is a real, just-authenticated user and gives us
    // a trusted uid/email to work with — NEVER taken from the request
    // body, only from the verified token.
    let uid, callerEmail;
    try {
      const decoded = await admin.auth(app).verifyIdToken(idToken);
      uid = decoded.uid;
      callerEmail = decoded.email;
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Not authenticated." }), { status: 401, headers: corsHeaders(req) });
    }

    const db = admin.firestore(app);
    const store = getStore("invites");

    // Two ways this function gets called, resolving to the same shape
    // ({ accountType, orgId, waitlistId }) either way:
    //
    //   1. Email/password registration (RegisterPage.jsx) — has a real
    //      invite `token` from the emailed link, resolved via Blobs.
    //   2. Google Sign-In (LoginPage.jsx) — never sees that token at all
    //      (there's no link/token in that flow, just a Google popup), so
    //      it passes `waitlistId` instead, resolved by reading the
    //      waitlist Firestore doc directly. Trust here rests on the same
    //      check LoginPage.jsx's earlier check-waitlist-invite.mjs call
    //      already required — status "invited" AND the doc's email
    //      matching the caller's own verified email — re-verified here
    //      independently rather than assuming the client already did it
    //      correctly.
    //
    // Both are equally authoritative for their own flow; neither is
    // trusted based on anything the client claims about accountType/orgId
    // itself, only on what's actually stored server-side.
    let accountType, orgId, resolvedWaitlistId, blobsInvite = null;

    if (token) {
      let raw;
      try {
        raw = await store.get(token);
      } catch {
        raw = null;
      }
      if (!raw) {
        return new Response(JSON.stringify({ success: false, error: "Invalid invite token." }), { status: 400, headers: corsHeaders(req) });
      }
      blobsInvite = JSON.parse(raw);

      if (blobsInvite.used) {
        return new Response(JSON.stringify({ success: false, error: "This invite has already been used." }), { status: 400, headers: corsHeaders(req) });
      }
      if (new Date(blobsInvite.expiresAt) < new Date()) {
        return new Response(JSON.stringify({ success: false, error: "This invite has expired." }), { status: 400, headers: corsHeaders(req) });
      }
      // Doesn't block on mismatch — email casing/whitespace edge cases
      // aren't worth hard-failing registration over, and the invite token
      // itself (not the email match) is what's actually authoritative
      // here. Logged so a real problem is still visible.
      if (callerEmail && blobsInvite.email && callerEmail.toLowerCase() !== blobsInvite.email.toLowerCase()) {
        console.warn(`[provision-account] email mismatch: authenticated as ${callerEmail}, invite issued to ${blobsInvite.email}`);
      }

      accountType = blobsInvite.accountType === "org" ? "org" : "individual";
      orgId = blobsInvite.orgId || null;
      resolvedWaitlistId = blobsInvite.waitlistId || null;
    } else {
      const waitlistSnap = await db.doc(`waitlist/${waitlistIdParam}`).get();
      if (!waitlistSnap.exists) {
        return new Response(JSON.stringify({ success: false, error: "Invalid waitlist entry." }), { status: 400, headers: corsHeaders(req) });
      }
      const waitlistData = waitlistSnap.data();
      if (waitlistData.status !== "invited") {
        return new Response(JSON.stringify({ success: false, error: "This invite is no longer valid." }), { status: 400, headers: corsHeaders(req) });
      }
      if (!callerEmail || (waitlistData.email || "").toLowerCase() !== callerEmail.toLowerCase()) {
        // Fails closed — this is the ONLY authorization check on this
        // path (no token/secret involved), so a mismatch here is treated
        // as seriously as an invalid token would be on the other path.
        return new Response(JSON.stringify({ success: false, error: "This invite doesn't match your signed-in email." }), { status: 403, headers: corsHeaders(req) });
      }

      accountType = waitlistData.accountType === "org" ? "org" : "individual";
      orgId = waitlistData.accountType === "org" ? (waitlistData.resolvedOrgId || null) : null;
      resolvedWaitlistId = waitlistIdParam;
    }

    if (accountType === "org") {
      if (!orgId) {
        return new Response(JSON.stringify({ success: false, error: "This invite is missing its org assignment. Contact an Administrator." }), { status: 400, headers: corsHeaders(req) });
      }
      // Confirm the org still exists before assigning it — could
      // theoretically have been removed between invite-send and
      // registration. Cheap to check, fails closed rather than silently
      // assigning a dangling orgId.
      const orgSnap = await db.doc(`orgs/${orgId}`).get();
      if (!orgSnap.exists) {
        return new Response(JSON.stringify({ success: false, error: "The organization for this invite no longer exists. Contact an Administrator." }), { status: 400, headers: corsHeaders(req) });
      }
      await db.doc(`users/${uid}`).update({ orgId });
    } else {
      await db.doc(`orgs/${uid}`).set({
        kind: "individual",
        name: (blobsInvite && blobsInvite.fullName) || callerEmail || uid,
        addons: {},
        credits: { generationBalance: 0, transcriptionBalance: 0 },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.doc(`users/${uid}`).update({
        orgId: uid,
        requiresPurchase: true,
      });
    }

    // Mark the invite used (token path only — a waitlistId-only call from
    // Google Sign-In never had a Blobs invite to begin with) and the
    // waitlist entry registered (both paths).
    if (token && blobsInvite) {
      await store.set(token, JSON.stringify({ ...blobsInvite, used: true }));
    }
    if (resolvedWaitlistId) {
      try {
        await db.doc(`waitlist/${resolvedWaitlistId}`).update({
          status: "registered",
          registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        // Non-fatal — the account itself is already fully provisioned;
        // a waitlist bookkeeping miss shouldn't fail registration.
        console.error(`[provision-account] waitlist status update failed for ${resolvedWaitlistId}:`, err.message);
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
