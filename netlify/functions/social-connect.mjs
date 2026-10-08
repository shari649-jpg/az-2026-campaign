// netlify/functions/social-connect.mjs
//
// Creates a user's Upload-Post profile (lazily, per paid slot) and hands back
// Upload-Post's hosted "connect your accounts" link. The user signs in to
// each network on that network's own screen, so no social passwords or tokens
// ever touch this app — Upload-Post holds them.
//
// ACTIONS (POST JSON, signed-in user, ACTIVE subscription required):
//   { action: "status" }          → which networks are connected on each paid profile
//   { action: "connect", slot }   → { url } to send the user to
//
// slot = 0-based index of one of the user's paid profiles (0..profilesPaid-1).
// Profile usernames are azc_<uid>_<slot>, stored in socialPosting/{uid}.uploadPostProfiles.

import admin from "firebase-admin";
import {
  corsHeaders, reply, getAdminApp, requireSignedIn,
  profileUsername, uploadPostRequest, connectedKeys, MAX_PROFILES,
} from "./socialPostingHelper.mjs";

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[social-connect] admin init:", err.message);
    return reply(req, 500, { error: "Server configuration error." });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let decoded;
    try { decoded = await requireSignedIn(app, req, body.idToken); }
    catch { return reply(req, 401, { error: "You must be signed in." }); }
    const uid = decoded.uid;

    const db = admin.firestore(app);
    const ref = db.doc(`socialPosting/${uid}`);
    const social = (await ref.get()).data() || {};
    if (social.status !== "active") {
      return reply(req, 402, { error: "An active Social Posting subscription is required." });
    }
    const profilesPaid = Math.min(MAX_PROFILES, Math.max(0, Number(social.profilesPaid) || 0));

    // ── status ─────────────────────────────────────────────────────────────
    if (body.action === "status") {
      const profiles = [];
      for (let slot = 0; slot < profilesPaid; slot++) {
        const username = social.uploadPostProfiles?.[String(slot)] || null;
        let connected = [];
        if (username) {
          const r = await uploadPostRequest(`/uploadposts/users/${encodeURIComponent(username)}`);
          if (r.ok) connected = connectedKeys(r.data?.profile?.social_accounts);
        }
        profiles.push({ slot, created: !!username, connected });
      }
      return reply(req, 200, { profilesPaid, profiles });
    }

    // ── connect ────────────────────────────────────────────────────────────
    if (body.action === "connect") {
      const slot = Number.parseInt(body.slot, 10);
      if (!Number.isInteger(slot) || slot < 0 || slot >= profilesPaid) {
        return reply(req, 400, { error: "That profile isn't part of your subscription." });
      }
      const username = social.uploadPostProfiles?.[String(slot)] || profileUsername(uid, slot);

      // Create the Upload-Post profile if we haven't recorded one. If it
      // already exists (e.g. a previous attempt created it but the write
      // below failed) a GET finds it and we skip creation.
      if (!social.uploadPostProfiles?.[String(slot)]) {
        const existing = await uploadPostRequest(`/uploadposts/users/${encodeURIComponent(username)}`);
        if (!existing.ok) {
          const created = await uploadPostRequest("/uploadposts/users", { method: "POST", json: { username } });
          if (!created.ok) {
            console.error("[social-connect] create profile failed:", created.status, created.data);
            return reply(req, 502, { error: "Couldn't set up your posting profile. Please try again in a minute." });
          }
        }
        await ref.set({ uploadPostProfiles: { [String(slot)]: username } }, { merge: true });
      }

      const siteUrl = process.env.SITE_URL || "https://arizonacoalition.net";
      const link = await uploadPostRequest("/uploadposts/users/generate-jwt", {
        method: "POST",
        json: {
          username,
          redirect_url: `${siteUrl}/profile?social=connected`,
          redirect_button_text: "Back to AZ Coalition",
          ...(process.env.SOCIAL_CONNECT_LOGO_URL ? { logo_image: process.env.SOCIAL_CONNECT_LOGO_URL } : {}),
        },
      });
      if (!link.ok || !link.data?.access_url) {
        console.error("[social-connect] generate-jwt failed:", link.status, link.data);
        return reply(req, 502, { error: "Couldn't open the connection page. Please try again in a minute." });
      }
      return reply(req, 200, { url: link.data.access_url });
    }

    return reply(req, 400, { error: "Unknown action." });
  } catch (err) {
    if (err.code === "not_configured") {
      console.error("[social-connect] UPLOAD_POST_API_KEY not set.");
      return reply(req, 503, { error: "Posting isn't switched on yet. Contact an Administrator." });
    }
    console.error("[social-connect] error:", err);
    return reply(req, 500, { error: "Something went wrong. Please try again." });
  }
}
