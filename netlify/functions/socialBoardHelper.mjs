// netlify/functions/socialBoardHelper.mjs
//
// The Amplify board (Oct 2026): one entry per shared send in the top-level
// collection `amplifyPosts/{shareId}`. Teammates who pay for Social Posting see
// their org's entries and open each network's live post to boost it by hand.
//
// Browsers never touch this collection (no rules entry = denied); everything
// goes through social-board.mjs / social-publish.mjs with the Admin SDK.
//
// Entry shape:
//   { orgId, ownerUid, ownerName, preview, networks: { facebook: {ok, url?} },
//     requestIds[], jobIds[], scheduledDate|null, createdAt, expiresAt (ms),
//     lastCheck (ms) }
// Links often arrive late (video, TikTok), so list-time code asks Upload-Post
// for them (see social-board.mjs) — it does not depend on the poster's page.

import admin from "firebase-admin";
import { PLATFORMS, normalizeResults, fixTikTokUrl, uploadPostRequest } from "./socialPostingHelper.mjs";

export const BOARD_DAYS = 7;
export const BOARD_ID_OK = /^[A-Za-z0-9]{10,40}$/;
const DAY = 86_400_000;

export const safeUrl = (u) => (typeof u === "string" && /^https:\/\//.test(u) && u.length < 1000 ? fixTikTokUrl(u) : null);

// Create or extend the entry for one send. `id` is the client's shareId; if it
// already belongs to someone else, a fresh id is used instead.
export async function upsertBoardEntry(db, { uid, id, texts, platforms, networkResults, jobIds, requestIds, scheduledDate }) {
  const FV = admin.firestore.FieldValue;
  const okPlatforms = platforms.filter((p) => PLATFORMS[p] && networkResults?.[p]?.ok !== false);
  if (!okPlatforms.length) return null;
  const col = db.collection("amplifyPosts");
  let ref = id ? col.doc(id) : col.doc();
  const existing = await ref.get();
  if (existing.exists && existing.data().ownerUid !== uid) ref = col.doc();
  const user = (await db.doc(`users/${uid}`).get()).data() || {};
  const when = scheduledDate ? new Date(scheduledDate).getTime() : Date.now();
  const networks = {};
  for (const p of okPlatforms) {
    const url = safeUrl(networkResults?.[p]?.url);
    networks[p] = { ok: true, ...(url ? { url } : {}) };
  }
  const data = {
    orgId: user.orgId || null,
    ownerUid: uid,
    ownerName: String(user.fullName || "A teammate").slice(0, 80),
    preview: String(texts[okPlatforms[0]] || "").slice(0, 280),
    networks,
    scheduledDate: scheduledDate || null,
    expiresAt: when + BOARD_DAYS * DAY,
    createdAt: FV.serverTimestamp(),
    lastCheck: 0,
  };
  if (requestIds?.length) data.requestIds = FV.arrayUnion(...requestIds);
  if (jobIds?.length) data.jobIds = FV.arrayUnion(...jobIds);
  await ref.set(data, { merge: true });
  return ref.id;
}

// Ask Upload-Post whether an entry's posts finished and pick up their links.
// Returns true if the entry changed.
export async function refreshEntryLinks(ref, e) {
  const qs = (Array.isArray(e.requestIds) && e.requestIds.length ? e.requestIds.map((x) => `request_id=${encodeURIComponent(x)}`)
    : Array.isArray(e.jobIds) && e.jobIds.length ? e.jobIds.map((x) => `job_id=${encodeURIComponent(x)}`) : []);
  const FV = admin.firestore.FieldValue;
  if (!qs.length) { await ref.set({ lastCheck: Date.now() }, { merge: true }); return false; }
  const rs = await Promise.all(qs.map((q) => uploadPostRequest(`/uploadposts/status?${q}`)));
  if (rs.some((r) => !r.ok || !r.data || r.data.status !== "completed")) {
    await ref.set({ lastCheck: Date.now() }, { merge: true });
    return false;
  }
  const nets = { ...(e.networks || {}) };
  for (const r of rs) for (const x of normalizeResults(r.data)) {
    if (!PLATFORMS[x.platform] || !nets[x.platform]) continue;
    if (!x.ok) nets[x.platform] = { ok: false };
    else { const url = safeUrl(x.url) || nets[x.platform].url; nets[x.platform] = { ok: true, ...(url ? { url } : {}) }; }
  }
  await ref.set({ networks: nets, lastCheck: Date.now(), updatedAt: FV.serverTimestamp() }, { merge: true });
  return true;
}

// Which entries still need their links (due, has an ok network without a link,
// not checked in the last 90 s, and younger than 3 days)?
export function needsLinks(e, now = Date.now()) {
  if (e.scheduledDate && new Date(e.scheduledDate).getTime() > now) return false;
  const nets = Object.values(e.networks || {});
  if (!nets.some((n) => n.ok && !n.url)) return false;
  const born = e.scheduledDate ? new Date(e.scheduledDate).getTime() : (e.expiresAt || now) - BOARD_DAYS * DAY;
  if (now - born > 3 * DAY) return false;
  return now - (e.lastCheck || 0) > 90_000;
}
