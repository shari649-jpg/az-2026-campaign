// netlify/functions/manage-user.mjs
// Admin-only user management: disable, enable, or permanently delete a user.
// Requires the Firebase Admin SDK, since none of these actions can be
// performed from client-side JavaScript (Firebase blocks them deliberately).
//
// Setup required before this function will work:
//   1. Firebase Console → Project Settings → Service Accounts → Generate new private key
//   2. Set the downloaded JSON (as a single-line string) as the Netlify env var:
//      FIREBASE_SERVICE_ACCOUNT_JSON
//   3. Add "firebase-admin" to package.json dependencies and to
//      netlify.toml's [functions] external_node_modules list.

import admin from "firebase-admin";

const SITE_URL = "https://az-coalition-2026-election.netlify.app";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Content-Type": "application/json",
};

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON env var not set");
  const credential = admin.credential.cert(JSON.parse(json));
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
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error("[manage-user] admin init error:", err.message);
    return new Response(JSON.stringify({ error: "Server is not configured for user management yet." }), {
      status: 500, headers: CORS_HEADERS,
    });
  }

  try {
    const { idToken, action, targetUid } = await req.json();

    if (!action || !targetUid) {
      return new Response(JSON.stringify({ error: "Missing action or targetUid." }), {
        status: 400, headers: CORS_HEADERS,
      });
    }

    let callerUid;
    try {
      callerUid = await requireAdmin(app, idToken);
    } catch (err) {
      const status = err.message === "unauthenticated" ? 401 : 403;
      return new Response(JSON.stringify({ error: "Not authorized to perform this action." }), {
        status, headers: CORS_HEADERS,
      });
    }

    // Prevent an administrator from disabling or deleting their own account
    // through this tool — avoids accidental lockout with no one left to fix it.
    if (callerUid === targetUid) {
      return new Response(JSON.stringify({ error: "You can't perform this action on your own account." }), {
        status: 400, headers: CORS_HEADERS,
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
      return new Response(JSON.stringify({ success: true, action }), { status: 200, headers: CORS_HEADERS });
    }

    if (action === "delete") {
      // Remove the Auth account first; if that succeeds, remove the Firestore
      // profile too, so neither is left as an orphaned half-record.
      await auth.deleteUser(targetUid);
      await db.doc(`users/${targetUid}`).delete();
      return new Response(JSON.stringify({ success: true, action }), { status: 200, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: CORS_HEADERS,
    });

  } catch (err) {
    console.error("[manage-user] error:", err.message);
    const status = err.code === "auth/user-not-found" ? 404 : 500;
    return new Response(JSON.stringify({ error: err.message || "Something went wrong." }), {
      status, headers: CORS_HEADERS,
    });
  }
}
