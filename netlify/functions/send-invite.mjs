// netlify/functions/send-invite.mjs
//
// Called from AdminPage when an administrator clicks "Send Invite".
// Uses Firestore REST API (no firebase-admin SDK needed).
// Generates a one-time token, stores it in Firestore, emails invite via Resend.
//
// TODO: swap FROM_EMAIL once you have a verified domain in Resend.

import { randomBytes } from "crypto";

const SITE_URL    = "https://az-coalition-2026-election.netlify.app";
const FROM_EMAIL  = "onboarding@resend.dev";
const FROM_NAME   = "Arizona Coalition Comms Hub";
const PROJECT_ID  = process.env.FIREBASE_PROJECT_ID;
const FIRESTORE   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Content-Type": "application/json",
};

// ── Firestore REST helpers ────────────────────────────────────────────────

async function getAccessToken() {
  // Build a JWT for the service account and exchange it for an access token
  const clientEmail  = process.env.FIREBASE_CLIENT_EMAIL;
  // FIREBASE_PRIVATE_KEY is stored as base64 to avoid newline encoding issues
  const privateKeyRaw = (() => {
    const raw = process.env.FIREBASE_PRIVATE_KEY || "";
    // Try base64 decode first, fall back to raw with newline replacement
    try {
      const decoded = atob(raw.trim());
      if (decoded.includes("BEGIN")) return decoded;
    } catch {}
    return raw.replace(/\\n/g, "\n");
  })();

  const now    = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const header  = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: expiry,
    scope: "https://www.googleapis.com/auth/datastore",
  };

  const encode = obj => btoa(JSON.stringify(obj))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const headerB64  = encode(header);
  const payloadB64 = encode(payload);
  const sigInput   = `${headerB64}.${payloadB64}`;

  // Import the private key and sign
  const keyData = privateKeyRaw
    .replace("-----BEGIN RSA PRIVATE KEY-----", "")
    .replace("-----END RSA PRIVATE KEY-----", "")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const encoder   = new TextEncoder();
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(sigInput));
  const sigB64    = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${sigInput}.${sigB64}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

async function firestoreSet(accessToken, collection, docId, fields) {
  const url = `${FIRESTORE}/${collection}/${docId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Firestore write failed: ${JSON.stringify(err)}`);
  }
  return res.json();
}

async function firestoreUpdate(accessToken, collection, docId, fields) {
  // PATCH with updateMask to only update specific fields
  const fieldPaths = Object.keys(fields).join("&updateMask.fieldPaths=");
  const url = `${FIRESTORE}/${collection}/${docId}?updateMask.fieldPaths=${fieldPaths}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Firestore update failed: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// ── Email template ────────────────────────────────────────────────────────

function inviteEmailHtml({ fullName, inviteUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your Invitation</title></head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1D5C4A;padding:32px 40px;text-align:center;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F5C842;margin-bottom:8px;">Arizona Coalition · 2026</div>
            <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff;line-height:1.2;">You're invited to the Comms Hub</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#4A4558;line-height:1.7;">Hi <strong>${fullName}</strong>,</p>
            <p style="margin:0 0 16px;font-size:16px;color:#4A4558;line-height:1.7;">Your request to join the Arizona Coalition Comms Hub has been approved! Click below to complete your registration.</p>
            <p style="margin:0 0 28px;font-size:16px;color:#4A4558;line-height:1.7;">The Comms Hub gives your coalition access to AI-powered messaging, candidate research, rapid response, and more.</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center" style="padding:8px 0 32px;">
                <a href="${inviteUrl}" style="display:inline-block;background:#1D5C4A;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:8px;letter-spacing:0.04em;">Complete Registration →</a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#888;line-height:1.6;">This link expires in <strong>72 hours</strong>. If you didn't request access, ignore this email.</p>
            <p style="margin:0;font-size:13px;color:#aaa;line-height:1.6;word-break:break-all;">Or copy: ${inviteUrl}</p>
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

// ── Handler ───────────────────────────────────────────────────────────────

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { waitlistId, email, fullName } = await req.json();

    if (!waitlistId || !email || !fullName) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), {
        status: 400, headers: CORS_HEADERS,
      });
    }

    const token     = randomBytes(32).toString("hex");
    const inviteUrl = `${SITE_URL}/register?token=${token}`;
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    // Get Firebase access token
    const accessToken = await getAccessToken();

    // Write invite doc to Firestore
    await firestoreSet(accessToken, "invites", token, {
      email:      { stringValue: email.toLowerCase().trim() },
      fullName:   { stringValue: fullName.trim() },
      waitlistId: { stringValue: waitlistId },
      expiresAt:  { stringValue: expiresAt },
      used:       { booleanValue: false },
      createdAt:  { stringValue: new Date().toISOString() },
    });

    // Mark waitlist entry as invited
    await firestoreUpdate(accessToken, "waitlist", waitlistId, {
      status:    { stringValue: "invited" },
      invitedAt: { stringValue: new Date().toISOString() },
    });

    // Send invite email via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    `${FROM_NAME} <${FROM_EMAIL}>`,
        to:      [email],
        subject: "You're invited to the Arizona Coalition Comms Hub",
        html:    inviteEmailHtml({ fullName, inviteUrl }),
      }),
    });

    if (!resendRes.ok) {
      const errData = await resendRes.json();
      console.error("[send-invite] Resend error:", JSON.stringify(errData));
      return new Response(JSON.stringify({ error: "Email failed to send.", detail: errData }), {
        status: 502, headers: CORS_HEADERS,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: CORS_HEADERS,
    });

  } catch (err) {
    console.error("[send-invite] error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: CORS_HEADERS,
    });
  }
}
