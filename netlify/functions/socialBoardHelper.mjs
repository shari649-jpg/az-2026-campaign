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
//   { orgId, ownerUid, ownerName, preview, networks: { "facebook__0": {ok, profile, url?} },
//     sends: { "0": {requestIds[], jobIds[]} }, scheduledDate|null, createdAt,
//     expiresAt (ms), lastCheck (ms) }
// Links often arrive late (video, TikTok), so list-time code asks Upload-Post
// for them (see social-board.mjs) — it does not depend on the poster's page.

import admin from "firebase-admin";
import { PLATFORMS, normalizeResults, fixTikTokUrl, uploadPostRequest } from "./socialPostingHelper.mjs";

export const BOARD_DAYS = 7;
export const BOARD_ID_OK = /^[A-Za-z0-9]{10,40}$/;
const DAY = 86_400_000;

export const safeUrl = (u) => (typeof u === "string" && /^https:\/\//.test(u) && u.length < 1000 ? fixTikTokUrl(u) : null);

// A network on the board is keyed "<platform>__<profile slot>" so the same
// network on two of the poster's profiles (two Instagram accounts) stays two
// separate buttons. Older entries used the bare platform name.
export const netKey = (platform, slot) => `${platform}__${slot}`;
export const platformOf = (key) => String(key).split("__")[0];
export const BOARD_KEY_OK = /^[a-z]{3,20}(__[0-4])?$/;

// Create or extend the entry for one send (one profile). `id` is the client's
// shareId, so the sends to several profiles merge into ONE entry; if it
// already belongs to someone else, a fresh id is used instead.
export async function upsertBoardEntry(db, { uid, id, texts, platforms, networkResults, jobIds, requestIds, scheduledDate, slot = 0 }) {
  const okPlatforms = platforms.filter((p) => PLATFORMS[p] && networkResults?.[p]?.ok !== false);
  if (!okPlatforms.length) return null;
  const col = db.collection("amplifyPosts");
  let ref = id ? col.doc(id) : col.doc();
  const existing = await ref.get();
  if (existing.exists && existing.data().ownerUid !== uid) ref = col.doc();
  const user = (await db.doc(`users/${uid}`).get()).data() || {};
  const social = (await db.doc(`socialPosting/${uid}`).get()).data() || {};
  const profile = String(social.profileNames?.[String(slot)] || `Profile ${slot + 1}`).slice(0, 30);
  const when = scheduledDate ? new Date(scheduledDate).getTime() : Date.now();
  const networks = {};
  for (const p of okPlatforms) {
    const url = safeUrl(networkResults?.[p]?.url);
    networks[netKey(p, slot)] = { ok: true, profile, ...(url ? { url } : {}) };
  }
  const data = {
    orgId: user.orgId || null,
    ownerUid: uid,
    ownerName: String(user.fullName || "A teammate").slice(0, 80),
    preview: String(texts[okPlatforms[0]] || "").slice(0, 280),
    networks,
    sends: { [String(slot)]: { requestIds: requestIds || [], jobIds: jobIds || [] } },
    scheduledDate: scheduledDate || null,
    expiresAt: when + BOARD_DAYS * DAY,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastCheck: 0,
  };
  await ref.set(data, { merge: true });
  return ref.id;
}

// Ask Upload-Post whether an entry's posts finished and pick up their links.
// Each profile's send is checked on its own, because the same network can
// appear on two profiles. Returns true if the entry changed.
export async function refreshEntryLinks(ref, e) {
  const FV = admin.firestore.FieldValue;
  const sends = e.sends && Object.keys(e.sends).length ? e.sends
    : { legacy: { requestIds: e.requestIds || [], jobIds: e.jobIds || [] } }; // entries from before profiles were tracked
  const nets = { ...(e.networks || {}) };
  let changed = false;
  for (const [slot, s] of Object.entries(sends)) {
    const qs = Array.isArray(s.requestIds) && s.requestIds.length ? s.requestIds.map((x) => `request_id=${encodeURIComponent(x)}`)
      : Array.isArray(s.jobIds) && s.jobIds.length ? s.jobIds.map((x) => `job_id=${encodeURIComponent(x)}`) : [];
    if (!qs.length) continue;
    const rs = await Promise.all(qs.map((q) => uploadPostRequest(`/uploadposts/status?${q}`)));
    if (rs.some((r) => !r.ok || !r.data || r.data.status !== "completed")) continue;
    for (const r of rs) for (const x of normalizeResults(r.data)) {
      if (!PLATFORMS[x.platform]) continue;
      const key = slot === "legacy" ? x.platform : netKey(x.platform, slot);
      if (!nets[key]) continue;
      if (!x.ok) nets[key] = { ...nets[key], ok: false, url: undefined };
      else { const url = safeUrl(x.url) || nets[key].url; nets[key] = { ok: true, ...(nets[key].profile ? { profile: nets[key].profile } : {}), ...(url ? { url } : {}) }; }
      changed = true;
    }
  }
  // Firestore rejects undefined values.
  for (const k of Object.keys(nets)) for (const f of Object.keys(nets[k])) if (nets[k][f] === undefined) delete nets[k][f];
  await ref.set({ ...(changed ? { networks: nets, updatedAt: FV.serverTimestamp() } : {}), lastCheck: Date.now() }, { merge: true });
  return changed;
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
