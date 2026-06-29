// netlify/functions/manage-user.mjs
// Admin-only user management: disable, enable, or permanently delete a user.
// Requires the Firebase Admin SDK, since none of these actions can be
// performed from client-side JavaScript (Firebase blocks them deliberately).
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
// in Firestore before allowing any action. This is the only thing standing
// between this endpoint and "anyone can disable or delete any account."
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
    console.error("[manage-user] admin init error:", err.message);
    return new Response(JSON.stringify({ error: "Server is not configured for user management yet." }), {
      status: 500, headers: corsHeaders(req),
    });
  }

  try {
    const { idToken, action, targetUid } = await req.json();

    if (!action || !targetUid) {
      return new Response(JSON.stringify({ error: "Missing action or targetUid." }), {
        status: 400, headers: corsHeaders(req),
      });
    }

    let callerUid;
    try {
      callerUid = await requireAdmin(app, idToken);
    } catch (err) {
      const status = err.message === "unauthenticated" ? 401 : 403;
      return new Response(JSON.stringify({ error: "Not authorized to perform this action." }), {
        status, headers: corsHeaders(req),
      });
    }

    // Prevent an administrator from disabling or deleting their own account
    // through this tool — avoids accidental lockout with no one left to fix it.
    if (callerUid === targetUid) {
      return new Response(JSON.stringify({ error: "You can't perform this action on your own account." }), {
        status: 400, headers: corsHeaders(req),
      });
    }

    const auth = admin.auth(app);
    const db = admin.firestore(app);

    if (action === "disable" || action === "enable") {
      await auth.updateUser(targetUid, { disabled: action === "disable" });
      await db.doc(`users/${targetUid}`).update({
        disabled: action === "disable",
        ...(action === "disable" ? { disabledAt: new Date() } : { disabledAt: admin.firestore.FieldValue.delete() }),
      });
      return new Response(JSON.stringify({ success: true, action }), { status: 200, headers: corsHeaders(req) });
    }

    if (action === "delete") {
      // Remove the Auth account first; if that succeeds, remove the Firestore
      // profile too, so neither is left as an orphaned half-record.
      await auth.deleteUser(targetUid);
      await db.doc(`users/${targetUid}`).delete();
      return new Response(JSON.stringify({ success: true, action }), { status: 200, headers: corsHeaders(req) });
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
