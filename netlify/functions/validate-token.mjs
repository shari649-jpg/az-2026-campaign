// netlify/functions/validate-token.mjs
// Called by RegisterPage to validate an invite token stored in Netlify Blobs.
// Also called with action=consume to mark a token as used after registration.

import { getStore } from "@netlify/blobs";

const SITE_URL = "https://az-coalition-2026-election.netlify.app";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Content-Type": "application/json",
};

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const { token, action } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ valid: false, reason: "invalid" }), {
        status: 200, headers: CORS_HEADERS,
      });
    }

    const store = getStore("invites");
    let raw;
    try {
      raw = await store.get(token);
    } catch {
      return new Response(JSON.stringify({ valid: false, reason: "invalid" }), {
        status: 200, headers: CORS_HEADERS,
      });
    }

    if (!raw) {
      return new Response(JSON.stringify({ valid: false, reason: "invalid" }), {
        status: 200, headers: CORS_HEADERS,
      });
    }

    const invite = JSON.parse(raw);

    if (invite.used) {
      return new Response(JSON.stringify({ valid: false, reason: "used" }), {
        status: 200, headers: CORS_HEADERS,
      });
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return new Response(JSON.stringify({ valid: false, reason: "expired" }), {
        status: 200, headers: CORS_HEADERS,
      });
    }

    // Consume the token after successful registration
    if (action === "consume") {
      await store.set(token, JSON.stringify({ ...invite, used: true }));
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: CORS_HEADERS,
      });
    }

    // Just validating — return invite data so RegisterPage can pre-fill fields
    return new Response(JSON.stringify({
      valid: true,
      email:      invite.email,
      fullName:   invite.fullName,
      waitlistId: invite.waitlistId || null,
    }), { status: 200, headers: CORS_HEADERS });

  } catch (err) {
    console.error("[validate-token] error:", err.message);
    return new Response(JSON.stringify({ valid: false, reason: "invalid" }), {
      status: 200, headers: CORS_HEADERS,
    });
  }
}
