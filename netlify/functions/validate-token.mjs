// netlify/functions/validate-token.mjs
// Called by RegisterPage to validate an invite token stored in Netlify Blobs.
// Also called with action=consume to mark a token as used after registration.

import { getStore } from "@netlify/blobs";

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

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { token, action } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ valid: false, reason: "invalid" }), {
        status: 200, headers: corsHeaders(req),
      });
    }

    const store = getStore("invites");
    let raw;
    try {
      raw = await store.get(token);
    } catch {
      return new Response(JSON.stringify({ valid: false, reason: "invalid" }), {
        status: 200, headers: corsHeaders(req),
      });
    }

    if (!raw) {
      return new Response(JSON.stringify({ valid: false, reason: "invalid" }), {
        status: 200, headers: corsHeaders(req),
      });
    }

    const invite = JSON.parse(raw);

    if (invite.used) {
      return new Response(JSON.stringify({ valid: false, reason: "used" }), {
        status: 200, headers: corsHeaders(req),
      });
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return new Response(JSON.stringify({ valid: false, reason: "expired" }), {
        status: 200, headers: corsHeaders(req),
      });
    }

    // Consume the token after successful registration
    if (action === "consume") {
      await store.set(token, JSON.stringify({ ...invite, used: true }));
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: corsHeaders(req),
      });
    }

    // Just validating — return invite data so RegisterPage can pre-fill fields
    return new Response(JSON.stringify({
      valid: true,
      email:       invite.email,
      fullName:    invite.fullName,
      waitlistId:  invite.waitlistId || null,
      // Aug 2026 individual-tier addition — defaults preserve the exact
      // behavior of every invite sent before these fields existed.
      accountType: invite.accountType === "org" ? "org" : "individual",
      orgId:       invite.accountType === "org" ? (invite.orgId || null) : null,
    }), { status: 200, headers: corsHeaders(req) });

  } catch (err) {
    console.error("[validate-token] error:", err.message);
    return new Response(JSON.stringify({ valid: false, reason: "invalid" }), {
      status: 200, headers: corsHeaders(req),
    });
  }
}
