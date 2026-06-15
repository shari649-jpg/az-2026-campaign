// netlify/functions/send-invite.mjs
// Stores invite token in Netlify Blobs (no Firebase Admin needed).
// AdminPage updates waitlist status client-side via the Firebase client SDK.
// TODO: swap FROM_EMAIL once you have a verified domain in Resend.

import { randomBytes } from "crypto";
import { getStore } from "@netlify/blobs";

const SITE_URL   = "https://az-coalition-2026-election.netlify.app";
const FROM_EMAIL = "onboarding@resend.dev";
const FROM_NAME  = "Arizona Coalition Comms Hub";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Content-Type": "application/json",
};

function inviteEmailHtml({ fullName, inviteUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Your Invitation</title></head>
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
            <p style="margin:0 0 8px;font-size:13px;color:#888;">This link expires in <strong>72 hours</strong>. If you didn't request access, ignore this email.</p>
            <p style="margin:0;font-size:13px;color:#aaa;word-break:break-all;">Or copy: ${inviteUrl}</p>
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

    // Store token in Netlify Blobs
    const store = getStore("invites");
    await store.set(token, JSON.stringify({
      email:      email.toLowerCase().trim(),
      fullName:   fullName.trim(),
      waitlistId,
      expiresAt,
      used:       false,
      createdAt:  new Date().toISOString(),
    }));

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
      return new Response(JSON.stringify({ error: "Email failed.", detail: errData }), {
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
