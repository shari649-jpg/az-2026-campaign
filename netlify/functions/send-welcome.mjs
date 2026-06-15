// netlify/functions/send-welcome.mjs
// Sends welcome email after successful registration via Gmail SMTP (Nodemailer).

import nodemailer from "nodemailer";

const SITE_URL   = "https://az-coalition-2026-election.netlify.app";
const FROM_EMAIL = "az.coalition.socials@gmail.com";
const FROM_NAME  = "Arizona Coalition Comms Hub";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Content-Type": "application/json",
};

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: FROM_EMAIL,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

function welcomeEmailHtml({ fullName }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Welcome to the AZ Coalition Comms Hub</title></head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1D5C4A;padding:32px 40px;text-align:center;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F5C842;margin-bottom:8px;">Arizona Coalition · 2026</div>
            <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff;line-height:1.2;">Welcome to the Comms Hub!</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 20px;font-size:16px;color:#4A4558;line-height:1.7;">Hi <strong>${fullName}</strong> — you're in! Here's how to hit the ground running:</p>
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #f0f0ec;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#F5C842;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#1D5C4A;">1</div>
                </td>
                <td style="padding:12px 0 12px 14px;border-bottom:1px solid #f0f0ec;vertical-align:top;">
                  <div style="font-size:15px;font-weight:700;color:#1D5C4A;margin-bottom:4px;">Message Machine</div>
                  <div style="font-size:14px;color:#666;line-height:1.6;">Generate platform-ready social media posts tailored to issue, audience, and style.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #f0f0ec;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#F5C842;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#1D5C4A;">2</div>
                </td>
                <td style="padding:12px 0 12px 14px;border-bottom:1px solid #f0f0ec;vertical-align:top;">
                  <div style="font-size:15px;font-weight:700;color:#1D5C4A;margin-bottom:4px;">Research</div>
                  <div style="font-size:14px;color:#666;line-height:1.6;">Look up candidate profiles, compare races, and explore district demographics.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #f0f0ec;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#F5C842;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#1D5C4A;">3</div>
                </td>
                <td style="padding:12px 0 12px 14px;border-bottom:1px solid #f0f0ec;vertical-align:top;">
                  <div style="font-size:15px;font-weight:700;color:#1D5C4A;margin-bottom:4px;">Rapid Response</div>
                  <div style="font-size:14px;color:#666;line-height:1.6;">Paste a news article URL for an instant breakdown — key facts, people, quotes.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #f0f0ec;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#F5C842;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#1D5C4A;">4</div>
                </td>
                <td style="padding:12px 0 12px 14px;border-bottom:1px solid #f0f0ec;vertical-align:top;">
                  <div style="font-size:15px;font-weight:700;color:#1D5C4A;margin-bottom:4px;">Rebuttal Generator</div>
                  <div style="font-size:14px;color:#666;line-height:1.6;">Counter misinformation fast with targeted rebuttals for your activists.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0;vertical-align:top;width:36px;">
                  <div style="width:28px;height:28px;background:#F5C842;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#1D5C4A;">5</div>
                </td>
                <td style="padding:12px 0 12px 14px;vertical-align:top;">
                  <div style="font-size:15px;font-weight:700;color:#1D5C4A;margin-bottom:4px;">Library</div>
                  <div style="font-size:14px;color:#666;line-height:1.6;">Every campaign and article you save goes here. Reload and build on past work.</div>
                </td>
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center" style="padding:8px 0 24px;">
                <a href="${SITE_URL}" style="display:inline-block;background:#1D5C4A;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:8px;letter-spacing:0.04em;">Open the Comms Hub →</a>
              </td></tr>
            </table>
            <p style="margin:0;font-size:13px;color:#aaa;text-align:center;">Need help? Visit the Quick Start Guide inside the app under the More menu.</p>
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
    const { email, fullName } = await req.json();
    if (!email || !fullName) {
      return new Response(JSON.stringify({ error: "Missing email or fullName." }), {
        status: 400, headers: CORS_HEADERS,
      });
    }

    const transporter = getTransporter();
    await transporter.sendMail({
      from:    `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to:      email,
      subject: "Welcome to the Arizona Coalition Comms Hub 🌵",
      html:    welcomeEmailHtml({ fullName }),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: CORS_HEADERS,
    });

  } catch (err) {
    console.error("[send-welcome] error:", err.message);
    // Non-fatal — don't surface email errors to the user
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200, headers: CORS_HEADERS,
    });
  }
}
