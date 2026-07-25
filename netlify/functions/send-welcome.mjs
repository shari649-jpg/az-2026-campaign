// netlify/functions/send-welcome.mjs
// Sends welcome email after successful registration via Resend.
//
// AUTH: requires a valid Firebase ID token (any signed-in user — this is
// called right after a brand-new account signs in for the first time, so
// the caller is always freshly authenticated at that point). Previously
// this endpoint had NO auth check and interpolated fullName into the email
// HTML with no escaping — anyone with the URL could send an
// Arizona-Coalition-branded email to any address, with attacker-controlled
// HTML in the body. Fixed July 2026 security pass: added auth + escaping.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";

// Used for the "Open the Comms Hub" link in the welcome email — always the
// current canonical domain, since this URL is what the recipient clicks.
const SITE_URL   = "https://arizonacoalition.net";
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
    serviceAccount = JSON.parse(readFileSync(new URL("./firebase-service-account.json", import.meta.url), "utf8"));
  } catch {
    throw new Error("firebase-service-account.json not found — run `npm run build` to regenerate via scripts/inject-secrets.mjs.");
  }
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

async function requireSignedIn(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  return { uid: decoded.uid, email: decoded.email };
}

// Minimal HTML-escaping for the one user-supplied value (fullName) that
// gets interpolated into the email template below. Prevents someone from
// putting markup/script-looking text in their display name and having it
// render unescaped inside the sent email.
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function welcomeEmailHtml({ fullName }) {
  const safeName = escapeHtml(fullName);
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Welcome to the AZ Coalition Comms Hub</title></head>
<body style="margin:0;padding:0;background:#E1E7F0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#E1E7F0;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#4A3163;padding:32px 40px;text-align:center;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F5C842;margin-bottom:8px;">Arizona Coalition · 2026</div>
            <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff;line-height:1.2;">Welcome to the Comms Hub!</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 20px;font-size:16px;color:#362A44;line-height:1.7;">Hi <strong>${safeName}</strong> — you're in! Here's how to hit the ground running:</p>
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #E1E7F0;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#F5C842;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#4A3163;">1</div>
                </td>
                <td style="padding:12px 0 12px 14px;border-bottom:1px solid #E1E7F0;vertical-align:top;">
                  <div style="font-size:15px;font-weight:700;color:#4A3163;margin-bottom:4px;">Message Machine</div>
                  <div style="font-size:14px;color:#666;line-height:1.6;">Generate platform-ready social media posts tailored to issue, audience, and style.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #E1E7F0;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#F5C842;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#4A3163;">2</div>
                </td>
                <td style="padding:12px 0 12px 14px;border-bottom:1px solid #E1E7F0;vertical-align:top;">
                  <div style="font-size:15px;font-weight:700;color:#4A3163;margin-bottom:4px;">Research</div>
                  <div style="font-size:14px;color:#666;line-height:1.6;">Look up candidate profiles, compare races, and explore district demographics.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #E1E7F0;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#F5C842;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#4A3163;">3</div>
                </td>
                <td style="padding:12px 0 12px 14px;border-bottom:1px solid #E1E7F0;vertical-align:top;">
                  <div style="font-size:15px;font-weight:700;color:#4A3163;margin-bottom:4px;">Rapid Response</div>
                  <div style="font-size:14px;color:#666;line-height:1.6;">Paste a news article URL for an instant breakdown — key facts, people, quotes.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #E1E7F0;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#F5C842;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#4A3163;">4</div>
                </td>
                <td style="padding:12px 0 12px 14px;border-bottom:1px solid #E1E7F0;vertical-align:top;">
                  <div style="font-size:15px;font-weight:700;color:#4A3163;margin-bottom:4px;">Rebuttal Generator</div>
                  <div style="font-size:14px;color:#666;line-height:1.6;">Counter misinformation fast with targeted rebuttals for your activists.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#F5C842;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#4A3163;">5</div>
                </td>
                <td style="padding:12px 0 12px 14px;vertical-align:top;">
                  <div style="font-size:15px;font-weight:700;color:#4A3163;margin-bottom:4px;">Library</div>
                  <div style="font-size:14px;color:#666;line-height:1.6;">Every campaign and article you save goes here. Reload and build on past work.</div>
                </td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center" style="padding:8px 0 24px;">
                <a href="${SITE_URL}" style="display:inline-block;background:#4A3163;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:8px;letter-spacing:0.04em;">Open the Comms Hub →</a>
              </td></tr>
            </table>
            <p style="margin:0;font-size:13px;color:#aaa;text-align:center;">Need help? Visit the Quick Start Guide inside the app under the More menu.</p>
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
    console.error("[send-welcome] admin init error:", err.message);
    // Non-fatal by design elsewhere in this file, but auth setup failing is
    // a real server problem — surface it rather than silently no-op.
    return new Response(JSON.stringify({ success: false, error: "Server configuration error." }), {
      status: 500, headers: corsHeaders(req),
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const { fullName, idToken: bodyToken } = await req.json();
    const idToken = headerToken || bodyToken;

    // ── Auth ──────────────────────────────────────────────────────────────
    // The send target is bound to the verified token's own email claim, not
    // to a client-submitted `email` field. Previously this function trusted
    // whatever `email` the request body contained as the recipient, checking
    // only that *some* valid signed-in user made the call — any authenticated
    // Member could have POSTed an arbitrary recipient address and had this
    // function send to it, unlimited, with no rate limit. Since this is
    // meant to be a self-service "email myself once, right after verifying"
    // trigger (see AuthContext.jsx), binding to decoded.email closes that
    // gap without changing the intended behavior at all.
    let verifiedEmail;
    try {
      const decoded = await requireSignedIn(app, idToken);
      verifiedEmail = decoded.email;
    } catch {
      return new Response(JSON.stringify({ success: false, error: "You must be signed in to use this tool." }), {
        status: 401, headers: corsHeaders(req),
      });
    }

    if (!verifiedEmail || !fullName) {
      return new Response(JSON.stringify({ error: "Missing email or fullName." }), {
        status: 400, headers: corsHeaders(req),
      });
    }

    await sendEmail({
      to:      verifiedEmail,
      subject: "Welcome to the Arizona Coalition Comms Hub 🌵",
      html:    welcomeEmailHtml({ fullName }),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: corsHeaders(req),
    });

  } catch (err) {
    console.error("[send-welcome] error:", err.message);
    // Non-fatal — don't surface email errors to the user
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200, headers: corsHeaders(req),
    });
  }
}
