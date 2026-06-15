// netlify/functions/send-invite.mjs
//
// Called from the Admin page when an administrator clicks "Send Invite"
// on a waitlist entry. Generates a one-time token, stores it in Firestore
// with a 72-hour expiry, then emails an invite link via Resend.
//
// FROM address: onboarding@resend.dev (swap for your domain once verified)
// TO address:   the waitlist applicant's email
//
// Required env vars:
//   RESEND_API_KEY         — Resend sending-access API key (Secret)
//   FIREBASE_PROJECT_ID    — Firebase project ID
//   FIREBASE_CLIENT_EMAIL  — Firebase service account client email (Secret)
//   FIREBASE_PRIVATE_KEY   — Firebase service account private key (Secret)
//
// Modern Netlify Functions runtime (ESM)

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "crypto";

const SITE_URL   = "https://az-coalition-2026-election.netlify.app";
// TODO: swap FROM_EMAIL to your verified domain address once set up in Resend
const FROM_EMAIL = "onboarding@resend.dev";
const FROM_NAME  = "Arizona Coalition Comms Hub";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Content-Type": "application/json",
};

function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

function generateToken() {
  return randomBytes(32).toString("hex");
}

function inviteEmailHtml({ fullName, inviteUrl, expiryHours }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Invitation to AZ Coalition Comms Hub</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1D5C4A;padding:32px 40px;text-align:center;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F5C842;margin-bottom:8px;">Arizona Coalition · 2026</div>
            <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.2;">You're invited to the Comms Hub</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#4A4558;line-height:1.7;">
              Hi <strong>${fullName}</strong>,
            </p>
            <p style="margin:0 0 16px;font-size:16px;color:#4A4558;line-height:1.7;">
              Your request to join the Arizona Coalition Comms Hub has been approved! Click the button below to complete your registration.
            </p>
            <p style="margin:0 0 28px;font-size:16px;color:#4A4558;line-height:1.7;">
              The Comms Hub gives your coalition access to AI-powered messaging tools, candidate research, rapid response, and more — all in one place.
            </p>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center" style="padding:8px 0 32px;">
                <a href="${inviteUrl}" style="display:inline-block;background:#1D5C4A;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:8px;letter-spacing:0.04em;">
                  Complete Registration →
                </a>
              </td></tr>
            </table>

            <p style="margin:0 0 8px;font-size:13px;color:#888;line-height:1.6;">
              This invite link expires in <strong>${expiryHours} hours</strong>. If you didn't request access, you can safely ignore this email.
            </p>
            <p style="margin:0;font-size:13px;color:#aaa;line-height:1.6;word-break:break-all;">
              Or copy this link: ${inviteUrl}
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f8f6;padding:20px 40px;border-top:1px solid #e8e8e4;">
            <p style="margin:0;font-size:12px;color:#aaa;text-align:center;line-height:1.6;">
              Arizona Coalition · Comms Hub 2026 · Internal use only
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { waitlistId, email, fullName } = await req.json();

    if (!waitlistId || !email || !fullName) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), {
        status: 400, headers: CORS_HEADERS,
      });
    }

    const db       = getDb();
    const token    = generateToken();
    const expiry   = Date.now() + 72 * 60 * 60 * 1000; // 72 hours
    const inviteUrl = `${SITE_URL}/register?token=${token}`;

    // Store token in Firestore
    await db.collection("invites").doc(token).set({
      email:       email.toLowerCase().trim(),
      fullName:    fullName.trim(),
      waitlistId,
      createdAt:   new Date(),
      expiresAt:   new Date(expiry),
      used:        false,
    });

    // Mark waitlist entry as invited
    await db.collection("waitlist").doc(waitlistId).update({
      status:    "invited",
      invitedAt: new Date(),
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
        html:    inviteEmailHtml({ fullName, inviteUrl, expiryHours: 72 }),
      }),
    });

    if (!resendRes.ok) {
      const errData = await resendRes.json();
      console.error("[send-invite] Resend error:", errData);
      return new Response(JSON.stringify({ error: "Failed to send email.", detail: errData }), {
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
