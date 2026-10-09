// netlify/functions/social-posts.mjs
//
// The user's own social-post list (socialPosting/{uid}/posts/{id}) — drafts,
// scheduled posts, and what went out. social-publish.mjs creates/updates
// records when something is actually posted or scheduled; this function
// handles everything else. The browser can only READ these records (see
// firestore.rules); every change comes through here so it is validated and,
// for cancelling, actually carried out at Upload-Post.
//
// POST JSON { action, ... }
//   save_draft        { draft: { id?, slot, platforms, texts, attachments } }
//                     Needs an active subscription. Text may be empty or over
//                     the limit (it's a draft); a real send re-validates.
//   delete_draft      { id }   drafts and finished posts; NOT scheduled ones
//   cancel_scheduled  { id }   cancels at Upload-Post, then returns the post to
//                              drafts (its content is kept)
//   refresh           { id? }  asks Upload-Post how processing/scheduled posts
//                              ended up; updates their status
//
// Cancel/refresh/delete work even if the subscription has lapsed, so people
// can always clean up.

import admin from "firebase-admin";
import {
  corsHeaders, reply, getAdminApp, requireSignedIn, uploadPostRequest,
  validatePublishRequest, parseStorageUrl, kindFromName, MAX_PROFILES,
} from "./socialPostingHelper.mjs";
import { recordTempUploads } from "./socialMedia.mjs";

const MAX_DRAFTS = 50;
const DRAFT_KEEP_DAYS = 30;

// Re-derive the bookkeeping Upload-Post-free uploads need so a draft's device
// files outlive the dialog: the daily cleanup deletes them 30 days out.
async function keepUploads(db, uid, attachments, days) {
  const resolved = [];
  for (const a of attachments) {
    if (a.source !== "upload") continue;
    const loc = parseStorageUrl(a.url, uid);
    if (!loc) continue;
    resolved.push({ source: "upload", bucket: loc.bucket, path: loc.path, kind: kindFromName(loc.path) || "image" });
  }
  await recordTempUploads(db, uid, resolved, null, days);
}

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[social-posts] admin init:", err.message);
    return reply(req, 500, { error: "Server configuration error." });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let decoded;
    try { decoded = await requireSignedIn(app, req, body.idToken); }
    catch { return reply(req, 401, { error: "You must be signed in." }); }
    const uid = decoded.uid;

    const db = admin.firestore(app);
    const FieldValue = admin.firestore.FieldValue;
    const ref = db.doc(`socialPosting/${uid}`);
    const postsCol = ref.collection("posts");
    const idOk = (v) => typeof v === "string" && /^[A-Za-z0-9]{10,40}$/.test(v);

    // ── save a draft ───────────────────────────────────────────────────────
    if (body.action === "save_draft") {
      const social = (await ref.get()).data() || {};
      if (social.status !== "active") {
        return reply(req, 402, { error: "Posting is locked until your Social Posting subscription is active." });
      }
      const profilesPaid = Math.min(MAX_PROFILES, Math.max(0, Number(social.profilesPaid) || 0));
      const d = body.draft || {};
      const v = validatePublishRequest({ ...d, scheduledDate: null, draftId: d.id }, Date.now(), { draft: true });
      if (v.error) return reply(req, 400, { error: v.error });
      const { slot, platforms, texts, attachments, draftId } = v.value;
      if (slot >= profilesPaid) return reply(req, 400, { error: "That profile isn't part of your subscription." });

      // Device-upload URLs must be this user's own; library/storm references
      // are fully checked when the post is actually sent.
      for (const a of attachments) {
        if (a.source === "upload" && !parseStorageUrl(a.url, uid)) {
          return reply(req, 400, { error: "One of your uploaded files isn't valid. Please upload it again." });
        }
      }

      const fields = {
        status: "draft",
        slot,
        platforms,
        texts,
        attachments,
        preview: (Object.values(texts).find((t) => t) || "").slice(0, 140),
        scheduledDate: null,
        timezone: null,
        jobId: null,
        requestId: null,
        error: null,
        lastError: null,
        notice: null,
        updatedAt: FieldValue.serverTimestamp(),
      };

      let docRef = null;
      if (draftId) {
        const existing = postsCol.doc(draftId);
        const snap = await existing.get();
        if (snap.exists) {
          if (snap.data().status !== "draft") return reply(req, 409, { error: "That post has already gone out or is scheduled." });
          docRef = existing;
        }
      }
      if (!docRef) {
        const count = (await postsCol.where("status", "==", "draft").limit(MAX_DRAFTS + 1).get()).size;
        if (count >= MAX_DRAFTS) return reply(req, 400, { error: `You can keep up to ${MAX_DRAFTS} drafts. Delete some first.` });
        docRef = postsCol.doc();
        await docRef.set({ ...fields, createdAt: FieldValue.serverTimestamp() });
      } else {
        await docRef.set(fields, { merge: true });
      }
      await keepUploads(db, uid, attachments, DRAFT_KEEP_DAYS).catch((e) => console.error("[social-posts] keepUploads:", e.message));
      return reply(req, 200, { ok: true, id: docRef.id });
    }

    // ── delete ─────────────────────────────────────────────────────────────
    if (body.action === "delete_draft") {
      if (!idOk(body.id)) return reply(req, 400, { error: "Unknown post." });
      const d = postsCol.doc(body.id);
      const snap = await d.get();
      if (!snap.exists) return reply(req, 200, { ok: true });
      if (snap.data().status === "scheduled") {
        return reply(req, 409, { error: "Cancel the scheduled post first, then delete it." });
      }
      await d.delete();
      return reply(req, 200, { ok: true });
    }

    // ── cancel a scheduled post ────────────────────────────────────────────
    if (body.action === "cancel_scheduled") {
      if (!idOk(body.id)) return reply(req, 400, { error: "Unknown post." });
      const d = postsCol.doc(body.id);
      const snap = await d.get();
      const post = snap.exists ? snap.data() : null;
      if (!post || post.status !== "scheduled" || !post.jobId) {
        return reply(req, 409, { error: "That post isn't scheduled." });
      }
      if (post.scheduledDate && new Date(post.scheduledDate).getTime() <= Date.now()) {
        return reply(req, 409, { error: "That post's time has already passed. Use Refresh to see what happened." });
      }
      // Only ever cancel a job THIS user's record owns (the doc lives under
      // their uid and jobId was written by social-publish.mjs).
      // A post sent to several networks is several jobs (one per network).
      const ids = (Array.isArray(post.jobIds) && post.jobIds.length ? post.jobIds : [post.jobId]).filter((x) => typeof x === "string");
      let r = { ok: true, status: 200 };
      for (const jid of ids) {
        const one = await uploadPostRequest(`/uploadposts/schedule/${encodeURIComponent(jid)}`, { method: "DELETE" });
        if (!one.ok && one.status !== 404) r = one;
        else if (one.status === 404 && r.ok) r = { ok: false, status: 404 };
      }
      if (!r.ok && r.status !== 404) {
        console.error("[social-posts] cancel failed:", r.status, JSON.stringify(r.data)?.slice(0, 300));
        return reply(req, 502, { error: "Couldn't cancel that post. Please try again in a moment." });
      }
      // 404 = Upload-Post no longer has it (already cancelled/ran). Either way
      // the content comes back as a draft so nothing the person wrote is lost.
      await d.set({
        status: "draft",
        jobId: null,
        jobIds: [],
        scheduledDate: null,
        timezone: null,
        notice: r.ok ? "Schedule cancelled. Your post is saved here as a draft." : "That scheduled post was no longer queued. It's saved here as a draft.",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await keepUploads(db, uid, post.attachments || [], DRAFT_KEEP_DAYS).catch(() => {});
      return reply(req, 200, { ok: true });
    }

    // ── refresh status ─────────────────────────────────────────────────────
    if (body.action === "refresh") {
      let docs;
      if (body.id) {
        if (!idOk(body.id)) return reply(req, 400, { error: "Unknown post." });
        const s = await postsCol.doc(body.id).get();
        docs = s.exists ? [s] : [];
      } else {
        const q = await postsCol.where("status", "in", ["processing", "scheduled"]).limit(20).get();
        docs = q.docs;
      }
      let updated = 0;
      for (const s of docs) {
        const p = s.data();
        const due = p.status === "processing" || (p.status === "scheduled" && p.scheduledDate && new Date(p.scheduledDate).getTime() <= Date.now());
        if (!due) continue;
        const qsList = (Array.isArray(p.requestIds) && p.requestIds.length ? p.requestIds.map((x) => `request_id=${encodeURIComponent(x)}`)
          : Array.isArray(p.jobIds) && p.jobIds.length ? p.jobIds.map((x) => `job_id=${encodeURIComponent(x)}`)
          : p.requestId ? [`request_id=${encodeURIComponent(p.requestId)}`] : p.jobId ? [`job_id=${encodeURIComponent(p.jobId)}`] : []);
        if (!qsList.length) continue;
        const rs = await Promise.all(qsList.map((qs) => uploadPostRequest(`/uploadposts/status?${qs}`)));
        if (rs.some((r) => !r.ok || !r.data || r.data.status !== "completed")) continue;
        const results = rs.flatMap((r) => (Array.isArray(r.data.results) ? r.data.results : []));
        const failed = results.filter((x) => x && x.success === false);
        if (failed.length) {
          const msg = failed.map((x) => `${x.platform}: ${String(x.message || "failed").slice(0, 120)}`).join("; ").slice(0, 400);
          await s.ref.set({ status: "failed", error: msg, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        } else {
          await s.ref.set({ status: "sent", error: null, sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        updated++;
      }
      return reply(req, 200, { ok: true, updated });
    }

    return reply(req, 400, { error: "Unknown action." });
  } catch (err) {
    if (err.code === "not_configured") {
      console.error("[social-posts] not configured:", err.message);
      return reply(req, 503, { error: "Posting isn't switched on yet. Contact an Administrator." });
    }
    console.error("[social-posts] error:", err);
    return reply(req, 500, { error: "Something went wrong. Please try again." });
  }
}
