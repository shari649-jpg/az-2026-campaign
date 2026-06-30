// netlify/functions/resend-verification.mjs
// Admin-only: generate a fresh Firebase email-verification link for one or
// more users and send it via Resend, branded to match send-welcome.mjs.
//
// Why this exists: the client-side sendEmailVerification() call only works
// for whoever is currently signed into the browser — there's no way to
// trigger it for someone else. This uses the Admin SDK's
// generateEmailVerificationLink(), which can mint a valid link for any user
// by email, without that person needing to be signed in anywhere. Useful
// for clearing a backlog of accounts stuck at emailVerified: false (e.g.
// after the original verification email landed in spam, or the original
// 3-day link expired before they got to it).
//
// AUTH: admin-only, same pattern as manage-user.mjs.
//
// Setup: same as manage-user.mjs (FIREBASE_SERVICE_ACCOUNT_JSON via
// scripts/inject-secrets.mjs) plus RESEND_API_KEY (Functions scope).

import admin from "firebase-admin";
import { readFileSync } from "node:fs";

const SITE_URL    = "https://arizonacoalition.net";
const FROM_EMAIL  = "noreply@arizonacoalition.net";
const FROM_NAME   = "Arizona Coalition Comms Hub";
const REPLY_TO    = "info@arizonacoalition.net";

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

async function requireAdmin(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  const snap = await admin.firestore(app).doc(`users/${decoded.uid}`).get();
  const role = snap.exists ? snap.data().role : null;
  if (role !== "administrator") throw new Error("forbidden");
  return decoded.uid;
}

async function sendEmail({ to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to,
      subject,
      html,
      reply_to: REPLY_TO,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
  return res.json();
}

function verificationEmailHtml({ fullName, link }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Verify your email — Arizona Coalition Comms Hub</title></head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1D5C4A;padding:32px 40px;text-align:center;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F5C842;margin-bottom:8px;">Arizona Coalition · 2026</div>
            <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;line-height:1.2;">Verify your email</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#4A4558;line-height:1.7;">Hi <strong>${fullName}</strong>,</p>
            <p style="margin:0 0 28px;font-size:15px;color:#4A4558;line-height:1.7;">Your Comms Hub account is created, but your email still needs to be verified before you can sign in. Click below to finish activating your account.</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center" style="padding:8px 0 24px;">
                <a href="${link}" style="display:inline-block;background:#1D5C4A;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:8px;letter-spacing:0.04em;">Verify my email →</a>
              </td></tr>
            </table>
            <p style="margin:0;font-size:13px;color:#aaa;text-align:center;">This link is valid for 3 days. If you didn't request this, you can ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f8f6;padding:20px 40px;border-top:1px solid #e8e8e4;">
            <p style="margin:0;font-size:12px;color:#aaa;text-align:center;">Arizona Coalition · Comms Hub 2026 · Internal use only</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error("[resend-verification] admin init error:", err.message);
    return new Response(JSON.stringify({ error: "Server is not configured for this yet." }), {
      status: 500, headers: corsHeaders(req),
    });
  }

  try {
    // uids: array of Firestore user doc IDs (same as Firebase Auth UID) to
    // resend a verification email to. Single-user calls just pass [uid].
    const { idToken, uids } = await req.json();

    if (!Array.isArray(uids) || uids.length === 0) {
      return new Response(JSON.stringify({ error: "Missing uids (must be a non-empty array)." }), {
        status: 400, headers: corsHeaders(req),
      });
    }
    // Hard cap to keep a single request well inside Netlify's 26s function
    // timeout — sequential processing (required by Resend's rate limit)
    // means this caps wall-clock time, not just request count. For larger
    // backlogs, call this endpoint multiple times.
    if (uids.length > 30) {
      return new Response(JSON.stringify({ error: "Max 30 users per request." }), {
        status: 400, headers: corsHeaders(req),
      });
    }

    try {
      await requireAdmin(app, idToken);
    } catch (err) {
      const status = err.message === "unauthenticated" ? 401 : 403;
      return new Response(JSON.stringify({ error: "Not authorized to perform this action." }), {
        status, headers: corsHeaders(req),
      });
    }

    const auth = admin.auth(app);
    const db = admin.firestore(app);
    const actionCodeSettings = { url: `${SITE_URL}/login` };

    // IMPORTANT: process sequentially, not via Promise.all. Resend enforces
    // a hard 5 requests/second limit per account with no burst allowance —
    // firing all sends concurrently silently 429s everything past the 5th.
    // A small delay between each user keeps every call inside that window.
    // See: https://resend.com/docs/knowledge-base/account-quotas-and-limits
    const results = [];
    for (const uid of uids) {
      try {
        // Re-fetch on every iteration rather than batching ahead of time —
        // this also surfaces, in logs, the exact emailVerified value Firebase
        // Auth returns for each uid at the moment it's checked, in case that
        // value doesn't match what Firestore shows for the same account.
        const userRecord = await auth.getUser(uid);
        console.log(`[resend-verification] uid=${uid} email=${userRecord.email} auth.emailVerified=${userRecord.emailVerified}`);

        if (userRecord.emailVerified) {
          results.push({ uid, email: userRecord.email, success: false, reason: "already-verified" });
          continue;
        }
        if (!userRecord.email) {
          results.push({ uid, success: false, reason: "no-email-on-account" });
          continue;
        }

        const profileSnap = await db.doc(`users/${uid}`).get();
        const fullName = profileSnap.exists ? (profileSnap.data().fullName || "") : "";

        const link = await auth.generateEmailVerificationLink(userRecord.email, actionCodeSettings);

        await sendEmail({
          to: userRecord.email,
          subject: "Verify your email for Arizona Coalition Comms Hub",
          html: verificationEmailHtml({ fullName: fullName || userRecord.email, link }),
        });

        results.push({ uid, email: userRecord.email, success: true });
      } catch (err) {
        console.error(`[resend-verification] failed for uid ${uid}:`, err.message);
        results.push({ uid, success: false, reason: err.code || err.message || "unknown-error" });
      }
      // ~250ms between sends keeps us comfortably under Resend's 5/sec cap
      // even accounting for the Firebase Admin calls in between.
      await new Promise(r => setTimeout(r, 250));
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.length - sent;

    return new Response(JSON.stringify({ success: true, sent, failed, results }), {
      status: 200, headers: corsHeaders(req),
    });

  } catch (err) {
    console.error("[resend-verification] error:", err.message);
    return new Response(JSON.stringify({ error: err.message || "Something went wrong." }), {
      status: 500, headers: corsHeaders(req),
    });
  }
}
