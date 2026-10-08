// netlify/functions/social-publish.mjs
//
// Posts (or schedules) to the user's connected networks through Upload-Post —
// text, 1-4 images, or one video. This is where the paywall is actually
// enforced: the browser's button state is cosmetic, THIS function re-reads
// socialPosting/{uid} and refuses unless status === "active".
//
// POST JSON:
//   {
//     slot: 0,                                  // which paid profile
//     platforms: ["facebook","instagram"],      // Message Machine platform ids
//     texts: { facebook: "...", instagram: "..." },
//     attachments?: [                           // omit for a text post
//       { source: "drive",  id: "<Drive file id>", name },
//       { source: "upload", url: "<Firebase Storage download URL>", name }
//     ],
//     scheduledDate?: "2026-10-09T16:00:00Z",   // omit = post now
//     timezone?: "America/Phoenix",
//     facebookPageId?: "1234567890"
//   }
//
// Order of checks: signed in → active subscription → slot is one they paid
// for → request shape → daily cap → attachments resolved (media-library
// membership / own-uploads-only, size, type) → every chosen network can take
// this kind of post → those networks are actually connected on THAT profile.
// The Upload-Post username is read from Firestore, never from the request.
//
// Every attempt is logged to socialPosting/{uid}/log.

import admin from "firebase-admin";
import {
  corsHeaders, reply, getAdminApp, requireSignedIn,
  uploadPostRequest, connectedKeys, validatePublishRequest,
  postKind, checkCapabilities,
  PLATFORMS, MAX_PROFILES, DAILY_PUBLISH_LIMIT,
} from "./socialPostingHelper.mjs";
import {
  resolveAttachments, fetchImage, videoUrl, buildPostForm, endpointFor, recordTempUploads,
} from "./socialMedia.mjs";

// Upload-Post's docs disagree on how to spell X ("x" vs "twitter") depending
// on the endpoint. If it rejects the platform value with a 400, retry once
// with the other spelling.
async function sendWithXFallback(kind, platforms, makeForm) {
  let r = await uploadPostRequest(endpointFor(kind), { method: "POST", form: makeForm(false) });
  const msg = JSON.stringify(r.data || "").toLowerCase();
  if (r.status === 400 && platforms.includes("twitter") && msg.includes("platform")) {
    console.warn("[social-publish] platform value rejected; retrying X with the alternate spelling.");
    r = await uploadPostRequest(endpointFor(kind), { method: "POST", form: makeForm(true) });
  }
  return r;
}

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[social-publish] admin init:", err.message);
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

    // ── the paywall ────────────────────────────────────────────────────────
    if (social.status !== "active") {
      return reply(req, 402, { error: "Posting is locked until your Social Posting subscription is active." });
    }
    const profilesPaid = Math.min(MAX_PROFILES, Math.max(0, Number(social.profilesPaid) || 0));

    const v = validatePublishRequest(body);
    if (v.error) return reply(req, 400, { error: v.error });
    const { slot, platforms, texts, attachments, scheduledDate, timezone, facebookPageId } = v.value;

    if (slot >= profilesPaid) return reply(req, 400, { error: "That profile isn't part of your subscription." });
    const username = social.uploadPostProfiles?.[String(slot)];
    if (!username) return reply(req, 400, { error: "Connect your accounts for that profile first." });

    // ── daily abuse cap (separate from the AI-call rate limit) ─────────────
    const today = new Date().toISOString().slice(0, 10);
    try {
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(ref)).data() || {};
        const n = s.dailyPublishesDate === today ? (s.dailyPublishes || 0) : 0;
        if (n >= DAILY_PUBLISH_LIMIT) throw Object.assign(new Error("cap"), { code: "cap" });
        tx.set(ref, { dailyPublishes: n + 1, dailyPublishesDate: today }, { merge: true });
      });
    } catch (err) {
      if (err.code === "cap") return reply(req, 429, { error: "Daily posting limit reached. Try again tomorrow." });
      throw err;
    }

    // ── what is being posted, and can every network take it? ───────────────
    let resolved;
    try { resolved = await resolveAttachments(attachments, uid); }
    catch (err) {
      if (err.code === "user") return reply(req, 400, { error: err.message });
      throw err;
    }
    const pk = postKind(resolved.map((a) => a.kind));
    if (pk.error) return reply(req, 400, { error: pk.error });
    const kind = pk.kind;
    const cap = checkCapabilities(kind, platforms);
    if (cap.error) return reply(req, 400, { error: cap.error });

    // ── are those networks actually connected on this profile? ─────────────
    const prof = await uploadPostRequest(`/uploadposts/users/${encodeURIComponent(username)}`);
    if (!prof.ok) {
      console.error("[social-publish] profile lookup failed:", prof.status, prof.data);
      return reply(req, 502, { error: "Couldn't reach the posting service. Please try again." });
    }
    const connected = new Set(connectedKeys(prof.data?.profile?.social_accounts));
    const notConnected = platforms.filter((id) => !PLATFORMS[id].accountKeys.some((k) => connected.has(k)));
    if (notConnected.length) {
      return reply(req, 400, { error: `Not connected yet: ${notConnected.map((id) => PLATFORMS[id].label).join(", ")}. Connect them on your Profile page.` });
    }

    // ── fetch media + build the request ────────────────────────────────────
    let images = null;
    let video = null;
    try {
      if (kind === "image") images = await Promise.all(resolved.map(fetchImage));
      if (kind === "video") video = videoUrl(resolved[0]);
    } catch (err) {
      if (err.code === "user") return reply(req, 400, { error: err.message });
      throw err;
    }
    const makeForm = (altX) => buildPostForm({
      kind, username, platforms, texts, scheduledDate, timezone, facebookPageId, images, video, altX,
    });

    const r = await sendWithXFallback(kind, platforms, makeForm);

    // Don't leak upstream internals to the browser; give a useful message.
    let message = null;
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) {
        console.error("[social-publish] Upload-Post rejected our API key / plan:", r.status, r.data);
        message = "The posting service isn't available right now. Contact an Administrator.";
      } else if (r.status === 429) {
        message = "The posting service's monthly limit has been reached. Contact an Administrator.";
      } else {
        message = (typeof r.data?.message === "string" && r.data.message) ||
                  (typeof r.data?.error === "string" && r.data.error) ||
                  "The post didn't go through.";
      }
    } else {
      // Device uploads are deleted by scheduled-social-cleanup.mjs later.
      await recordTempUploads(db, uid, resolved, scheduledDate).catch((e) => console.error("[social-publish] temp-upload bookkeeping failed:", e.message));
    }

    await ref.collection("log").add({
      platforms,
      kind,
      attachments: resolved.length,
      scheduled: !!scheduledDate,
      scheduledDate: scheduledDate || null,
      ok: r.ok,
      status: r.status,
      jobId: r.data?.job_id || null,
      requestId: r.data?.request_id || null,
      preview: texts[platforms[0]].slice(0, 140),
      error: r.ok ? null : String(message).slice(0, 300),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (!r.ok) {
      console.error("[social-publish] Upload-Post error:", r.status, JSON.stringify(r.data)?.slice(0, 500));
      return reply(req, 502, { ok: false, error: message });
    }
    return reply(req, 200, {
      ok: true,
      kind,
      scheduled: !!scheduledDate,
      processing: !!r.data?.request_id && !scheduledDate, // video: finishes in the background
      jobId: r.data?.job_id || null,
      results: r.data?.results || null,
    });
  } catch (err) {
    if (err.code === "not_configured") {
      console.error("[social-publish] not configured:", err.message);
      return reply(req, 503, { error: "Posting isn't switched on yet. Contact an Administrator." });
    }
    console.error("[social-publish] error:", err);
    return reply(req, 500, { error: "Something went wrong. Please try again." });
  }
}
