// netlify/functions/send-invite.mjs
// Stores invite token in Netlify Blobs, sends invite email via Resend.
//
// AUTH: admin-only, same pattern as manage-user.mjs. Without this check, anyone
// with the URL could send a real invite email containing a working registration
// link to any address. See that file's header comment for the credential setup
// (firebase-service-account.json generated at build time by inject-secrets.mjs).

import { randomBytes } from "crypto";
import { getStore } from "@netlify/blobs";
import admin from "firebase-admin";
import { readFileSync } from "node:fs";

// Used to build the invite link that goes out in the email — always the
// current canonical domain, since this URL is what the recipient clicks.
const SITE_URL  = "https://arizonacoalition.net";
const FROM_EMAIL = "noreply@arizonacoalition.net";
const FROM_NAME  = "Arizona Coalition Comms Hub";
const REPLY_TO   = "info@arizonacoalition.net";


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
// in Firestore before allowing an invite to be sent. This is the only thing
// standing between this endpoint and "anyone can email themselves a working
// registration link."
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

function inviteEmailHtml({ fullName, inviteUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Your Invitation</title></head>
<body style="margin:0;padding:0;background:#E1E7F0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#E1E7F0;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#4A3163;padding:32px 40px;text-align:center;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F5C842;margin-bottom:8px;">Arizona Coalition · 2026</div>
            <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff;line-height:1.2;">You're invited to the Comms Hub</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#362A44;line-height:1.7;">Hi <strong>${fullName}</strong>,</p>
            <p style="margin:0 0 16px;font-size:16px;color:#362A44;line-height:1.7;">Your request to join the Arizona Coalition Comms Hub has been approved! Click below to complete your registration.</p>
            <p style="margin:0 0 28px;font-size:16px;color:#362A44;line-height:1.7;">The Comms Hub gives your coalition access to AI-powered messaging, candidate research, rapid response, and more.</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center" style="padding:8px 0 32px;">
                <a href="${inviteUrl}" style="display:inline-block;background:#4A3163;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:8px;letter-spacing:0.04em;">Complete Registration →</a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#888;">This link expires in <strong>72 hours</strong>. If you didn't request access, ignore this email.</p>
            <p style="margin:0;font-size:13px;color:#aaa;word-break:break-all;">Or copy: ${inviteUrl}</p>
          </td>
        </tr>
        <tr>
          <td style="background:#E1E7F0;padding:20px 40px;border-top:1px solid #E1E7F0;">
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
    console.error("[send-invite] admin init error:", err.message);
    return new Response(JSON.stringify({ error: "Server is not configured for invites yet." }), {
      status: 500, headers: corsHeaders(req),
    });
  }

  try {
    const { idToken, waitlistId, email, fullName, accountType, orgId } = await req.json();

    try {
      await requireAdmin(app, idToken);
    } catch (err) {
      const status = err.message === "unauthenticated" ? 401 : 403;
      return new Response(JSON.stringify({ error: "Not authorized to send invites." }), {
        status, headers: corsHeaders(req),
      });
    }

    if (!waitlistId || !email || !fullName) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), {
        status: 400, headers: corsHeaders(req),
      });
    }

    // accountType ("individual" | "org") + orgId (org only) — Aug 2026
    // individual-tier addition. Resolved by the Admin on the Waitlist tab,
    // never inferred. Defaults to "individual" if omitted, matching every
    // invite sent before this field existed. An "org" invite requires a
    // real, already-confirmed orgId — this function doesn't validate that
    // the org actually exists; provision-account.mjs does that check
    // server-side at registration time, since that's the point that
    // actually writes it and where a stale/bad orgId would do real harm.
    const resolvedAccountType = accountType === "org" ? "org" : "individual";
    if (resolvedAccountType === "org" && !orgId) {
      return new Response(JSON.stringify({ error: "orgId is required for an org-track invite." }), {
        status: 400, headers: corsHeaders(req),
      });
    }

    const token     = randomBytes(32).toString("hex");
    const inviteUrl = `${SITE_URL}/register?token=${token}`;
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    // Store token in Netlify Blobs
    const store = getStore("invites");
    await store.set(token, JSON.stringify({
      email:      email.toLowerCase().trim(),
      fullName:   fullName.trim(),
      waitlistId,
      accountType: resolvedAccountType,
      ...(resolvedAccountType === "org" ? { orgId } : {}),
      expiresAt,
      used:       false,
      createdAt:  new Date().toISOString(),
    }));

    // Send invite email via Resend
    await sendEmail({
      to:      email,
      subject: "You're invited to the Arizona Coalition Comms Hub",
      html:    inviteEmailHtml({ fullName, inviteUrl }),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: corsHeaders(req),
    });

  } catch (err) {
    console.error("[send-invite] error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders(req),
    });
  }
}
