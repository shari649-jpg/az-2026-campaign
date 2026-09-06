// netlify/functions/manage-user.mjs
// Admin-only user management: disable, enable, delete, change a user's
// email address, or reactivate a disabled account into a specific access
// path (reactivate_org / reactivate_individual — added Aug 2026, see below).
// Requires the Firebase Admin SDK, since none of these actions can be
// performed from client-side JavaScript (Firebase blocks them
// deliberately — a signed-in client can only ever change ITS OWN email,
// never another account's).
//
// ACTIONS
// ────────────────────────────────────────────────────────────────────────
//   disable / enable     — flips Auth `disabled` + users/{uid}.disabled
//                           only. Doesn't touch orgId or requiresPurchase.
//                           Org-admin-scoped callers may use these two.
//   delete                — real Administrator only. Removes the Auth
//                           account and users/{uid}, AND (added Aug 2026)
//                           cascades to the target's own orgs/{uid} doc +
//                           Stripe Customer record, but ONLY when the
//                           target is a real "org of one" individual
//                           account (orgId === their own uid) — a shared
//                           org's data/Stripe customer is never touched by
//                           one member's deletion. Fixes the previously
//                           confirmed orphaned-doc/orphaned-Stripe-customer
//                           bug (Handoff #36, TODO 8/13 item 11).
//   update_email          — real Administrator only. See below.
//   reactivate_org         — real Administrator only (added Aug 2026).
//                           Re-enables a disabled account directly into a
//                           given org, no purchase gate (the org already
//                           pays), matching a fresh org invite.
//   reactivate_individual   — real Administrator only (added Aug 2026).
//                           Re-enables a disabled account as a standalone
//                           "org of one," routed through requiresPurchase
//                           exactly like a fresh individual signup.
//
// Setup required before this function will work:
//   1. Firebase Console → Project Settings → Service Accounts → Generate new private key
//   2. Set the downloaded JSON (as a single-line string) as the Netlify env var
//      FIREBASE_SERVICE_ACCOUNT_JSON, scoped to BUILDS ONLY (not Functions/Runtime).
//   3. Add "firebase-admin" to package.json dependencies and to
//      netlify.toml's [functions] external_node_modules list.
//
// NOTE ON CREDENTIAL LOADING: this function reads its Firebase credential from
// a local firebase-service-account.json file rather than process.env. That file
// is generated automatically at build time by scripts/inject-secrets.mjs (see
// that file for why — short version: AWS Lambda caps total env var size at 4KB
// per function, and a full service-account JSON alone is most of that budget).
// If this file is missing, run `npm run build` locally to regenerate it, or
// check that FIREBASE_SERVICE_ACCOUNT_JSON is set in Netlify with Builds scope.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import Stripe from "stripe";

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

// Verify the caller's ID token and confirm they're authorized for the
// requested action. Two paths:
//   1. Real Administrator — authorized for every action (disable, enable,
//      delete, update_email), same as always.
//   2. Org admin (August 2026, TODO #1) — a plain "user" with orgAdmin:true
//      on their own doc — authorized ONLY for disable/enable, and ONLY on a
//      target who (a) belongs to their own org, (b) is a plain "user", not
//      a Manager/Administrator or another org admin. This mirrors
//      firestore.rules' scoped update branch on users/{uid} exactly (same
//      "own org, plain members only" boundary) — this function is the
//      independent server-side enforcement point for the one action
//      (disable/enable) that has to go through the Admin SDK rather than a
//      direct client Firestore write, same two-independent-checks reasoning
//      as grant-credits.mjs.
// Throws "unauthenticated", "forbidden", or "not_found" (target doesn't
// exist — only relevant on the org-admin path, since that one needs to
// read the target doc to check org/role).
async function authorize(app, idToken, action, targetUid) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  const db = admin.firestore(app);
  const callerSnap = await db.doc(`users/${decoded.uid}`).get();
  const caller = callerSnap.exists ? callerSnap.data() : {};

  if (caller.role === "administrator") {
    return { callerUid: decoded.uid, isOrgAdminCaller: false };
  }

  const isScopedAction = action === "disable" || action === "enable";
  if (caller.orgAdmin === true && isScopedAction) {
    if (!caller.orgId) throw new Error("forbidden");
    const targetSnap = await db.doc(`users/${targetUid}`).get();
    if (!targetSnap.exists) throw new Error("not_found");
    const target = targetSnap.data();
    if (target.orgId !== caller.orgId || target.role !== "user" || target.orgAdmin === true) {
      throw new Error("forbidden");
    }
    return { callerUid: decoded.uid, isOrgAdminCaller: true };
  }

  throw new Error("forbidden");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error("[manage-user] admin init error:", err.message);
    return new Response(JSON.stringify({ error: "Server is not configured for user management yet." }), {
      status: 500, headers: corsHeaders(req),
    });
  }

  try {
    const { idToken, action, targetUid, newEmail, targetOrgId } = await req.json();

    if (!action || !targetUid) {
      return new Response(JSON.stringify({ error: "Missing action or targetUid." }), {
        status: 400, headers: corsHeaders(req),
      });
    }

    let callerUid;
    try {
      ({ callerUid } = await authorize(app, idToken, action, targetUid));
    } catch (err) {
      const status = err.message === "unauthenticated" ? 401 : err.message === "not_found" ? 404 : 403;
      const msg = err.message === "not_found"
        ? "That account no longer exists."
        : "Not authorized to perform this action.";
      return new Response(JSON.stringify({ error: msg }), {
        status, headers: corsHeaders(req),
      });
    }

    // Prevent an administrator from disabling, deleting, or changing the
    // email of their own account through this tool — avoids accidental
    // lockout with no one left to fix it. (AdminPage.jsx's UI already
    // hides these actions for the signed-in admin's own row; this is the
    // server-side backstop.)
    if (callerUid === targetUid) {
      return new Response(JSON.stringify({ error: "You can't perform this action on your own account." }), {
        status: 400, headers: corsHeaders(req),
      });
    }

    const auth = admin.auth(app);
    const db = admin.firestore(app);

    if (action === "disable" || action === "enable") {
      await auth.updateUser(targetUid, { disabled: action === "disable" });
      // Disabling a user's Firebase Auth account (above) blocks future
      // sign-in, but does NOT invalidate an ID token that was already
      // issued — that token stays valid, and every Netlify function's
      // requireSignedIn()/verifyIdToken() would keep honoring it, for up to
      // its natural ~1hr expiry. A disabled user could keep spending
      // Claude/AssemblyAI credits with a token grabbed just before being
      // disabled. Fixed Sep 2026 security pass: revoke all of the target's
      // existing refresh tokens (forces re-authentication) whenever they're
      // disabled — this doesn't retroactively kill an already-issued ID
      // token instantly (Firebase only enforces revocation on token
      // refresh/re-verification with checkRevoked, which this app's
      // functions don't currently pass), so the ~1hr natural-expiry window
      // isn't fully closed by this alone, but it does stop the account from
      // getting a NEW valid token going forward and closes the "long-lived
      // session token" persistence risk. Only runs on disable, not enable —
      // there's nothing to revoke when re-enabling.
      if (action === "disable") {
        await auth.revokeRefreshTokens(targetUid).catch(err => {
          console.error(`[manage-user] revokeRefreshTokens failed for ${targetUid}:`, err.message);
        });
      }
      await db.doc(`users/${targetUid}`).update({
        disabled: action === "disable",
        ...(action === "disable" ? { disabledAt: new Date() } : { disabledAt: admin.firestore.FieldValue.delete() }),
      });
      return new Response(JSON.stringify({ success: true, action }), { status: 200, headers: corsHeaders(req) });
    }

    if (action === "delete") {
      // Read the target's own doc BEFORE deleting anything — this is the
      // only chance to learn whether they're an "org of one" individual
      // account (orgId === their own uid, see provision-account.mjs) so
      // the cascade below knows whether it's safe to also remove
      // orgs/{targetUid}. A shared-org member's orgId never equals their
      // own uid, so this check alone is what protects other org members'
      // data from ever being touched by an individual account's deletion.
      const targetUserSnap = await db.doc(`users/${targetUid}`).get();
      const targetsOwnOrgId = targetUserSnap.exists ? targetUserSnap.data().orgId : null;
      const isOrgOfOne = !!targetsOwnOrgId && targetsOwnOrgId === targetUid;

      // Remove the Auth account first; if that succeeds, remove the Firestore
      // profile too, so neither is left as an orphaned half-record.
      await auth.deleteUser(targetUid);
      await db.doc(`users/${targetUid}`).delete();

      // Cascade: previously this stopped here, which orphaned an
      // individual account's own orgs/{uid} doc (their private credit
      // balance/addons record) and its Stripe Customer object every
      // single time — confirmed bug, Handoff #36/TODO 8/13 item 11. Only
      // runs for a real org-of-one; a shared org's orgs/{orgId} doc and
      // Stripe customer belong to every other member too and must never
      // be touched by one member's deletion.
      if (isOrgOfOne) {
        let stripeCustomerId = null;
        try {
          const orgSnap = await db.doc(`orgs/${targetUid}`).get();
          stripeCustomerId = orgSnap.exists ? orgSnap.data().stripeCustomerId || null : null;
          await db.doc(`orgs/${targetUid}`).delete();
        } catch (err) {
          // Non-fatal — the Auth account and users/{uid} doc are already
          // gone, which is the part that actually blocks/unblocks sign-in
          // and access; a failure here shouldn't undo that or fail the
          // whole request. Logged so it's not silently lost.
          console.error(`[manage-user] orgs/${targetUid} cleanup failed during cascade delete:`, err.message);
        }

        if (stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
          try {
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
            await stripe.customers.del(stripeCustomerId);
          } catch (err) {
            // Also non-fatal, same reasoning as above — a Stripe-side
            // cleanup failure (e.g. already deleted, API hiccup) shouldn't
            // block the account deletion that already succeeded.
            console.error(`[manage-user] Stripe customer ${stripeCustomerId} cleanup failed during cascade delete:`, err.message);
          }
        } else if (stripeCustomerId && !process.env.STRIPE_SECRET_KEY) {
          console.warn(`[manage-user] STRIPE_SECRET_KEY not configured — Stripe customer ${stripeCustomerId} left uncleaned for deleted user ${targetUid}.`);
        }
      }

      return new Response(JSON.stringify({ success: true, action }), { status: 200, headers: corsHeaders(req) });
    }

    // Change a user's email address. This has to go through the Admin SDK —
    // Firebase's client SDK will only ever let a signed-in user change
    // THEIR OWN email (with reauthentication), never another account's, so
    // there was previously no way to fix a typo'd or outdated email without
    // deleting and recreating the account. The new address is set as
    // unverified: an admin typing in a new email isn't the same as that
    // person proving they control the inbox, so the existing
    // "Unverified · Resend" flow in AdminPage.jsx (backed by
    // resend-verification.mjs) is what gets it re-verified, same as any
    // other unverified account.
    if (action === "update_email") {
      const emailLower = (newEmail || "").trim().toLowerCase();
      if (!emailLower || !EMAIL_RE.test(emailLower)) {
        return new Response(JSON.stringify({ error: "Please enter a valid email address." }), {
          status: 400, headers: corsHeaders(req),
        });
      }
      try {
        await auth.updateUser(targetUid, { email: emailLower, emailVerified: false });
      } catch (err) {
        if (err.code === "auth/email-already-exists") {
          return new Response(JSON.stringify({ error: "That email is already in use by another account." }), {
            status: 409, headers: corsHeaders(req),
          });
        }
        throw err;
      }
      await db.doc(`users/${targetUid}`).update({
        email: emailLower,
        emailVerified: false,
      });
      return new Response(JSON.stringify({ success: true, action, email: emailLower }), { status: 200, headers: corsHeaders(req) });
    }

    // Reactivation — two distinct actions, scoped since Handoff #36
    // (TODO 8/13 item 9), never built until now. Both start from a
    // disabled account (any prior kind) and explicitly decide its next
    // access path, rather than the plain "enable" toggle above, which
    // only ever flips `disabled` and never touches orgId/requiresPurchase
    // — real Administrator only (falls through to authorize()'s
    // org-admin-scoped branch, which only covers disable/enable, so an
    // org admin gets "forbidden" on these, same as delete/update_email).
    //
    // Neither action deletes or touches any OTHER account's org doc. If a
    // shared-org member is later reactivated as an individual, or an
    // individual is reactivated into a shared org, whatever their old
    // personal orgs/{uid} doc still holds (credits, addons) is left as-is
    // by design — reconciling that is a real decision, not a default this
    // function should make silently.

    if (action === "reactivate_org") {
      if (!targetOrgId) {
        return new Response(JSON.stringify({ error: "targetOrgId is required to reactivate into an org." }), {
          status: 400, headers: corsHeaders(req),
        });
      }
      // Confirm the org is real before assigning it — same defensive
      // check provision-account.mjs makes at signup, not assumed correct
      // just because the Admin picked it in a dropdown.
      const orgSnap = await db.doc(`orgs/${targetOrgId}`).get();
      if (!orgSnap.exists) {
        return new Response(JSON.stringify({ error: "That organization no longer exists." }), {
          status: 400, headers: corsHeaders(req),
        });
      }
      await auth.updateUser(targetUid, { disabled: false });
      await db.doc(`users/${targetUid}`).update({
        disabled: false,
        disabledAt: admin.firestore.FieldValue.delete(),
        orgId: targetOrgId,
        // The org already pays — no purchase gate for a member reactivated
        // into it, matching how a fresh org invite works.
        requiresPurchase: false,
      });
      return new Response(JSON.stringify({ success: true, action, orgId: targetOrgId }), { status: 200, headers: corsHeaders(req) });
    }

    if (action === "reactivate_individual") {
      // Route back through the exact same purchase gate a fresh
      // individual signup hits (decision, Handoff #36) — not a free
      // re-enable. If this account still has its own orgs/{uid} doc from
      // before, reuse it untouched (their old balance/addons, if any,
      // just carry forward); only create a fresh one if it's genuinely
      // gone, mirroring provision-account.mjs's individual-path shape.
      const orgSnap = await db.doc(`orgs/${targetUid}`).get();
      if (!orgSnap.exists) {
        const targetUserSnap = await db.doc(`users/${targetUid}`).get();
        const targetUserData = targetUserSnap.exists ? targetUserSnap.data() : {};
        await db.doc(`orgs/${targetUid}`).set({
          kind: "individual",
          name: targetUserData.fullName || targetUserData.email || targetUid,
          addons: {},
          credits: { generationBalance: 0, transcriptionBalance: 0 },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await auth.updateUser(targetUid, { disabled: false });
      await db.doc(`users/${targetUid}`).update({
        disabled: false,
        disabledAt: admin.firestore.FieldValue.delete(),
        orgId: targetUid,
        requiresPurchase: true,
      });
      return new Response(JSON.stringify({ success: true, action, orgId: targetUid }), { status: 200, headers: corsHeaders(req) });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: corsHeaders(req),
    });

  } catch (err) {
    console.error("[manage-user] error:", err.message);
    const status = err.code === "auth/user-not-found" ? 404 : 500;
    return new Response(JSON.stringify({ error: err.message || "Something went wrong." }), {
      status, headers: corsHeaders(req),
    });
  }
}
