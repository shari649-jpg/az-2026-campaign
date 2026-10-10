// netlify/functions/social-board.mjs
//
// The Amplify board (Oct 2026). Teammates who pay for Social Posting see the
// recent posts their org members shared, and open each network's live post to
// boost it by hand (repost, like, comment). Nothing is automated.
//
// POST JSON { action, ... }
//   list           → { entries, platforms, me }        paid users only
//   set_platforms  { platforms: ["facebook", ...] }    which networks I want to see
//   mark           { id, platform (a network key), done }   "I amplified this"
//   unshare        { shareId }                         owner takes an entry down
//
// Access: viewing needs socialPosting/{uid}.status === "active" (the same flag
// that gates posting, so a lapsed or never-paid user sees an upsell, not the
// board). Who sees what: entries with the same orgId as the viewer; a user with
// no org sees only their own. Browsers have no rules access to amplifyPosts, so
// this function is the only way in.

import admin from "firebase-admin";
import { corsHeaders, reply, getAdminApp, requireSignedIn, PLATFORMS } from "./socialPostingHelper.mjs";
import { BOARD_ID_OK, BOARD_KEY_OK, needsLinks, platformOf, refreshEntryLinks, safeUrl } from "./socialBoardHelper.mjs";

const MAX_ENTRIES = 60;
const MAX_REFRESH = 5; // entries asked about Upload-Post per list call

export default async function (req) {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let app;
  try { app = getAdminApp(); } catch (err) {
    console.error("[social-board] admin init:", err.message);
    return reply(req, 500, { error: "Server configuration error." });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let decoded;
    try { decoded = await requireSignedIn(app, req, body.idToken); }
    catch { return reply(req, 401, { error: "You must be signed in." }); }
    const uid = decoded.uid;

    const db = admin.firestore(app);
    const FV = admin.firestore.FieldValue;
    const socialRef = db.doc(`socialPosting/${uid}`);
    const social = (await socialRef.get()).data() || {};
    const active = social.status === "active";
    const paywall = () => reply(req, 402, { error: "The Amplify board is part of Social Posting. Subscribe on your Profile page to use it." });
    const col = db.collection("amplifyPosts");

    // ── take my own entry down (works even if my subscription lapsed) ──────
    if (body.action === "unshare") {
      if (!BOARD_ID_OK.test(body.shareId || "")) return reply(req, 400, { error: "Unknown post." });
      const ref = col.doc(body.shareId);
      const s = await ref.get();
      if (s.exists && s.data().ownerUid === uid) await ref.delete();
      const mine = await socialRef.collection("posts").where("shareId", "==", body.shareId).get();
      await Promise.all(mine.docs.map((d) => d.ref.set({ shared: false }, { merge: true })));
      return reply(req, 200, { ok: true });
    }

    if (!active) return paywall();

    // ── which networks I want to see ───────────────────────────────────────
    if (body.action === "set_platforms") {
      const list = Array.isArray(body.platforms) ? [...new Set(body.platforms)].filter((p) => PLATFORMS[p]) : [];
      await socialRef.set({ boardPlatforms: list }, { merge: true });
      return reply(req, 200, { ok: true, platforms: list });
    }

    // ── "I amplified this" ─────────────────────────────────────────────────
    if (body.action === "mark") {
      if (!BOARD_ID_OK.test(body.id || "") || !BOARD_KEY_OK.test(body.platform || "") || !PLATFORMS[platformOf(body.platform)]) return reply(req, 400, { error: "Unknown post." });
      await socialRef.collection("amplified").doc(body.id).set({
        platforms: { [body.platform]: body.done ? true : FV.delete() },
        updatedAt: FV.serverTimestamp(),
      }, { merge: true });
      return reply(req, 200, { ok: true });
    }

    // ── the board ──────────────────────────────────────────────────────────
    if (body.action === "list") {
      const me = (await db.doc(`users/${uid}`).get()).data() || {};
      const q = me.orgId ? col.where("orgId", "==", me.orgId) : col.where("ownerUid", "==", uid);
      const snap = await q.limit(300).get();
      const now = Date.now();

      // Expired entries are removed as people look (best effort, a few at a time).
      const expired = snap.docs.filter((d) => (d.data().expiresAt || 0) < now);
      await Promise.all(expired.slice(0, 20).map((d) => d.ref.delete().catch(() => {})));

      let live = snap.docs.filter((d) => (d.data().expiresAt || 0) >= now)
        .filter((d) => { const sd = d.data().scheduledDate; return !sd || new Date(sd).getTime() <= now; });

      // Links arrive late (video, TikTok). Ask Upload-Post for a few entries
      // that are still waiting; whoever opens the board triggers this, so it
      // doesn't depend on the poster keeping a page open.
      const stale = live.filter((d) => needsLinks(d.data(), now)).slice(0, MAX_REFRESH);
      if (stale.length) {
        await Promise.all(stale.map((d) => refreshEntryLinks(d.ref, d.data()).catch((e) => console.error("[social-board] refresh failed:", e.message))));
        const fresh = await Promise.all(stale.map((d) => d.ref.get()));
        const byId = new Map(fresh.map((f) => [f.id, f]));
        live = live.map((d) => byId.get(d.id) || d);
      }

      const doneSnap = await socialRef.collection("amplified").limit(300).get();
      const done = {};
      for (const d of doneSnap.docs) done[d.id] = Object.keys(d.data().platforms || {}).filter((p) => d.data().platforms[p] === true);

      const entries = live.map((d) => {
        const e = d.data();
        // One button per network per profile: [{ key, platform, profile, url }]
        const networks = [];
        for (const [key, n] of Object.entries(e.networks || {})) {
          if (BOARD_KEY_OK.test(key) && PLATFORMS[platformOf(key)] && n && n.ok) {
            networks.push({ key, platform: platformOf(key), profile: typeof n.profile === "string" ? n.profile : "", url: safeUrl(n.url) });
          }
        }
        const ts = e.createdAt?.toMillis ? e.createdAt.toMillis() : e.createdAt?._seconds ? e.createdAt._seconds * 1000 : 0;
        return {
          id: d.id, ownerName: e.ownerName || "A teammate", mine: e.ownerUid === uid,
          preview: e.preview || "", createdAt: ts, networks,
        };
      }).filter((e) => e.networks.length)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_ENTRIES);
      entries.forEach((e) => { e.done = done[e.id] || []; });

      return reply(req, 200, { ok: true, entries, platforms: Array.isArray(social.boardPlatforms) ? social.boardPlatforms : null, me: uid });
    }

    return reply(req, 400, { error: "Unknown action." });
  } catch (err) {
    if (err.code === "not_configured") return reply(req, 503, { error: "Posting isn't switched on yet. Contact an Administrator." });
    console.error("[social-board] error:", err);
    return reply(req, 500, { error: "Something went wrong. Please try again." });
  }
}
