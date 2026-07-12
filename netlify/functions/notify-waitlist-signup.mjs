// netlify/functions/notify-waitlist-signup.mjs
// Sends a staff notification email via Resend whenever someone submits the
// public waitlist form. Mirrors send-welcome.mjs's Resend pattern, but
// triggered from the opposite end: instead of emailing the applicant, this
// emails staff so someone knows to go review the new request.
//
// AUTH: none — this fires from WaitlistPage.jsx before an account exists,
// same as check-waitlist-email.mjs / check-waitlist-invite.mjs. Every
// applicant-supplied field is escaped before being interpolated into the
// email HTML (see send-welcome.mjs's July 2026 fix for why that matters).

const STAFF_EMAIL = "shari@arizonacoalition.net";
const FROM_EMAIL  = "noreply@arizonacoalition.net";
const FROM_NAME   = "Arizona Coalition Comms Hub";

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
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
  return res.json();
}

function signupEmailHtml({ fullName, email, organization, reason, platform, handle }) {
  const safeName     = escapeHtml(fullName);
  const safeEmail    = escapeHtml(email);
  const safeOrg      = escapeHtml(organization) || '<span style="color:#aaa;">—</span>';
  const safeReason   = escapeHtml(reason) || '<span style="color:#aaa;">—</span>';
  const safePlatform = escapeHtml(platform);
  const safeHandle   = escapeHtml(handle);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>New Waitlist Signup</title></head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1D5C4A;padding:28px 40px;text-align:center;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#F5C842;margin-bottom:8px;">Arizona Coalition · Comms Hub</div>
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;line-height:1.2;">New Waitlist Signup</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <table cellpadding="0" cellspacing="0" width="100%" style="font-size:14px;color:#4A4558;">
              <tr><td style="padding:8px 0;border-bottom:1px solid #f0f0ec;width:120px;color:#999;font-weight:700;">Name</td><td style="padding:8px 0;border-bottom:1px solid #f0f0ec;">${safeName}</td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f0f0ec;color:#999;font-weight:700;">Email</td><td style="padding:8px 0;border-bottom:1px solid #f0f0ec;">${safeEmail}</td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f0f0ec;color:#999;font-weight:700;">Organization</td><td style="padding:8px 0;border-bottom:1px solid #f0f0ec;">${safeOrg}</td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #f0f0ec;color:#999;font-weight:700;">Social</td><td style="padding:8px 0;border-bottom:1px solid #f0f0ec;">${safePlatform} — ${safeHandle}</td></tr>
              <tr><td style="padding:8px 0;color:#999;font-weight:700;vertical-align:top;">Reason</td><td style="padding:8px 0;">${safeReason}</td></tr>
            </table>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center" style="padding:28px 0 8px;">
                <a href="https://arizonacoalition.net/admin" style="display:inline-block;background:#1D5C4A;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:8px;letter-spacing:0.04em;">Review in Admin →</a>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f8f6;padding:16px 40px;border-top:1px solid #e8e8e4;">
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

  try {
    const { fullName, email, organization, reason, primaryPlatform, primaryHandle } = await req.json();

    if (!fullName || !email) {
      return new Response(JSON.stringify({ success: false, error: "Missing fullName or email." }), {
        status: 400, headers: corsHeaders(req),
      });
    }

    await sendEmail({
      to:      STAFF_EMAIL,
      subject: `New Waitlist Signup: ${fullName}`,
      html:    signupEmailHtml({
        fullName, email, organization, reason,
        platform: primaryPlatform, handle: primaryHandle,
      }),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: corsHeaders(req),
    });
  } catch (err) {
    console.error("[notify-waitlist-signup] error:", err.message);
    // Non-fatal — a notification failure shouldn't affect the applicant's
    // confirmation screen. WaitlistPage.jsx doesn't surface this error.
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200, headers: corsHeaders(req),
    });
  }
}
