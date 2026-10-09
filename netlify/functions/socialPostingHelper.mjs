// netlify/functions/socialPostingHelper.mjs
//
// Shared helpers for the "Social Posting" feature (Oct 2026): a $5 per
// profile per month Stripe subscription that unlocks pushing Message Machine
// posts to a user's own social accounts through Upload-Post's API.
//
// FILES THAT USE THIS
//   social-billing.mjs   — subscribe (Stripe Checkout), add a profile,
//                          open the Stripe billing portal (cancel / card).
//   social-connect.mjs   — creates the user's Upload-Post profile and the
//                          hosted "connect your accounts" link; reports
//                          which networks are connected.
//   social-publish.mjs   — the actual post / schedule call.
//   socialPostingWebhook.mjs — called from stripe-webhook.mjs; the ONLY
//                          thing that ever marks a subscription active.
//
// WHERE STATE LIVES
//   socialPosting/{uid} (Admin SDK writes only — see firestore.rules).
//     status               "active" | "past_due" | "incomplete" | "canceled"
//     profilesPaid         number of profiles the subscription covers (1..MAX_PROFILES)
//     stripeCustomerId     a PER-USER Stripe Customer, deliberately NOT the
//                          org's shared customer (orgs/{orgId}.stripeCustomerId)
//                          — the Stripe billing portal shows every
//                          subscription on a customer, so sharing the org's
//                          would let one member see another member's billing.
//     stripeSubscriptionId
//     cancelAtPeriodEnd, currentPeriodEnd
//     uploadPostProfiles   { "0": "azc_<uid>_0", "1": ... } — Upload-Post
//                          profile usernames, created lazily on first connect.
//
// TRUST MODEL: every posting call re-reads socialPosting/{uid} server-side
// and requires status === "active". Nothing the browser sends can unlock
// posting; the Upload-Post profile username is read from this doc, never from
// the request body.

import admin from "firebase-admin";
import { readFileSync } from "node:fs";

export const ALLOWED_ORIGINS = [
  "https://arizonacoalition.net",
  "https://az-coalition-2026-election.netlify.app",
];

export function corsHeaders(req) {
  const origin = req.headers.get("origin");
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export function reply(req, status, body) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

export function getAdminApp() {
  if (admin.apps.length) return admin.app();
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(new URL("./firebase-service-account.json", import.meta.url), "utf8"));
  } catch {
    throw new Error("firebase-service-account.json not found — run `npm run build` to regenerate via scripts/inject-secrets.mjs.");
  }
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

// Same shape as every other function here: Bearer header first, body
// idToken as a fallback.
export async function requireSignedIn(app, req, bodyToken) {
  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const idToken = headerToken || bodyToken;
  if (!idToken) throw new Error("unauthenticated");
  return admin.auth(app).verifyIdToken(idToken);
}

// ── Pricing / limits — server-side source of truth ─────────────────────
export const PRICE_PER_PROFILE_CENTS = 500; // $5.00 / profile / month
export const MAX_PROFILES = 5;              // per user; raise deliberately, it costs real Upload-Post profile slots
export const DAILY_PUBLISH_LIMIT = 100;     // publish calls per user per UTC day — abuse guard

// ── Networks Message Machine can push (Oct 2026) ───────────────────────
// Keys are Message Machine's own platform ids (message-machine.jsx
// PLATFORMS). `caps` = which kinds of post that network can take through
// Upload-Post: "text" (no attachment), "image" (1-4 photos), "video" (one).
// Instagram can't post text alone and TikTok needs a video, hence their caps.
// `titleField` is Upload-Post's per-network caption override; maxChars mirrors
// Message Machine's own limits.
export const PLATFORMS = {
  facebook:  { label: "Facebook",    maxChars: 63206, titleField: "facebook_title",  accountKeys: ["facebook"],     caps: ["text", "image", "video"] },
  threads:   { label: "Threads",     maxChars: 500,   titleField: "threads_title",   accountKeys: ["threads"],      caps: ["text", "image", "video"] },
  bluesky:   { label: "Bluesky",     maxChars: 300,   titleField: "bluesky_title",   accountKeys: ["bluesky"],      caps: ["text", "image", "video"] },
  twitter:   { label: "X (Twitter)", maxChars: 280,   titleField: "x_title",         accountKeys: ["x", "twitter"], caps: ["text", "image", "video"] },
  instagram: { label: "Instagram",   maxChars: 2200,  titleField: "instagram_title", accountKeys: ["instagram"],    caps: ["image", "video"] },
  tiktok:    { label: "TikTok",      maxChars: 2200,  titleField: "tiktok_title",    accountKeys: ["tiktok"],       caps: ["video"] },
};

// The value Upload-Post expects in platform[]. UNCONFIRMED spelling for X:
// Upload-Post's X guide uses "x" for text posts while its video reference
// lists "twitter". We send the documented one per endpoint, and
// social-publish.mjs retries ONCE with the other spelling if Upload-Post
// rejects the platform value with a 400 (see sendWithXFallback).
export function platformValue(id, kind, altX = false) {
  if (id !== "twitter") return id;
  const base = kind === "video" ? "twitter" : "x";
  return altX ? (base === "x" ? "twitter" : "x") : base;
}

// ── Media limits ───────────────────────────────────────────────────────
export const MAX_ATTACHMENTS = 4;                    // up to 4 images, or exactly 1 video
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;     // 10 MB per image
export const MAX_DRIVE_VIDEO_BYTES = 95 * 1024 * 1024; // Drive shows a virus-scan interstitial on big files, which breaks link-based fetches
export const IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];
export const VIDEO_EXT = ["mp4", "mov", "webm"];
export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"];

export function kindFromName(name) {
  const ext = String(name || "").toLowerCase().split(".").pop();
  if (IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_EXT.includes(ext)) return "video";
  return null;
}
export function kindFromMime(mime) {
  if (IMAGE_MIMES.includes(mime)) return "image";
  if (VIDEO_MIMES.includes(mime)) return "video";
  return null;
}

// A device upload arrives as a Firebase Storage download URL. Only accept
// OUR storage host and ONLY this user's own socialUploads/{uid}/ folder — the
// server will fetch it (or hand it to Upload-Post), so it must never be
// attacker-chosen. Returns { bucket, path } or null.
export function parseStorageUrl(url, uid) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== "firebasestorage.googleapis.com") return null;
  const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!m) return null;
  let path;
  try { path = decodeURIComponent(m[2]); } catch { return null; }
  if (path.includes("..") || !path.startsWith(`socialUploads/${uid}/`)) return null;
  return { bucket: m[1], path };
}

// A storm media URL comes from OUR Firestore (storms/{id}/posts/{id}.media[].url),
// never from the browser, but we still only fetch Firebase Storage hosts.
export function isStorageHost(url) {
  try { const u = new URL(url); return u.protocol === "https:" && u.hostname === "firebasestorage.googleapis.com"; }
  catch { return false; }
}

export function mapStripeStatus(stripeStatus) {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default: // "incomplete", "paused", anything new Stripe adds — fail closed (locked)
      return "incomplete";
  }
}

export function profileUsername(uid, slot) {
  return `azc_${uid}_${slot}`;
}

// ── Upload-Post ────────────────────────────────────────────────────────
const UP_BASE = "https://api.upload-post.com/api";

export async function uploadPostRequest(path, { method = "GET", json, form } = {}) {
  const key = process.env.UPLOAD_POST_API_KEY;
  if (!key) {
    const err = new Error("Posting service isn't configured yet.");
    err.code = "not_configured";
    throw err;
  }
  const headers = { Authorization: `ApiKey ${key}` };
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form; // FormData — fetch sets the multipart boundary itself
  }
  const res = await fetch(`${UP_BASE}${path}`, { method, headers, body });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
  return { ok: res.ok, status: res.status, data };
}

// Upload-Post's profile object lists networks under social_accounts: a
// connected network is an object, an unconnected one is null or "".
export function connectedKeys(socialAccounts) {
  return Object.entries(socialAccounts || {})
    .filter(([, v]) => v && typeof v === "object")
    .map(([k]) => k);
}

// ── Publish request validation (pure — unit-testable) ──────────────────
// Shape-checks everything the browser sent. What an attachment actually IS
// (image vs video, in the media library or not) is decided later, server-side,
// by socialMedia.mjs — the client's claims are never trusted for that.
const ID_OK = /^[A-Za-z0-9_-]{5,100}$/;

// opts.draft: this is a saved draft, not a send — empty text and over-limit text
// are allowed (the person is still working on it); every real send re-validates
// strictly.
export function validatePublishRequest(body, now = Date.now(), opts = {}) {
  const slot = Number.parseInt(body?.slot, 10);
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PROFILES) {
    return { error: "Pick which profile to post from." };
  }
  const platforms = Array.isArray(body.platforms) ? [...new Set(body.platforms)] : [];
  if (!platforms.length) return { error: "Pick at least one network." };

  const texts = {};
  for (const id of platforms) {
    const cfg = PLATFORMS[id];
    if (!cfg) return { error: `"${id}" isn't a network we can post to.` };
    const t = typeof body.texts?.[id] === "string" ? body.texts[id].trim() : "";
    if (t.length > 70_000) return { error: `The ${cfg.label} text is far too long.` };
    if (!t && !opts.draft) return { error: `There's no text for ${cfg.label}.` };
    if (t.length > cfg.maxChars && !opts.draft) {
      return { error: `The ${cfg.label} text is ${t.length} characters; its limit is ${cfg.maxChars}.` };
    }
    texts[id] = t;
  }

  const rawAtt = body.attachments == null ? [] : body.attachments;
  if (!Array.isArray(rawAtt)) return { error: "Attachments weren't in the right format." };
  if (rawAtt.length > MAX_ATTACHMENTS) return { error: `You can attach at most ${MAX_ATTACHMENTS} images, or one video.` };
  const attachments = [];
  for (const a of rawAtt) {
    const name = typeof a?.name === "string" ? a.name.slice(0, 200) : "";
    if (a?.source === "drive" && typeof a.id === "string" && /^[A-Za-z0-9_-]{10,100}$/.test(a.id)) {
      const folderId = typeof a.folderId === "string" && /^[A-Za-z0-9_-]{10,100}$/.test(a.folderId) ? a.folderId : null;
      attachments.push({ source: "drive", id: a.id, name, folderId });
    } else if (a?.source === "upload" && typeof a.url === "string" && a.url.length < 2048) {
      attachments.push({ source: "upload", url: a.url, name });
    } else if (a?.source === "storm" && ID_OK.test(a.stormId || "") && ID_OK.test(a.postId || "")
      && typeof a.path === "string" && a.path.length < 512 && !a.path.includes("..")
      && a.path.startsWith(`storms/${a.stormId}/${a.postId}/`)) {
      // A file on a coalition storm post. Whether that post really lists this
      // file is checked server-side against Firestore (socialMedia.mjs).
      attachments.push({ source: "storm", stormId: a.stormId, postId: a.postId, path: a.path, name });
    } else {
      return { error: "One of the attachments isn't valid." };
    }
  }

  let scheduledDate = null;
  let timezone = "UTC";
  if (body.scheduledDate) {
    const when = new Date(body.scheduledDate);
    if (Number.isNaN(when.getTime())) return { error: "That schedule time isn't valid." };
    if (when.getTime() < now + 60_000) return { error: "The schedule time has to be in the future." };
    if (when.getTime() > now + 364 * 86_400_000) return { error: "You can schedule at most a year ahead." };
    if (typeof body.timezone === "string" && body.timezone) {
      try { new Intl.DateTimeFormat("en-US", { timeZone: body.timezone }); timezone = body.timezone; }
      catch { return { error: "Unknown timezone." }; }
    }
    scheduledDate = when.toISOString(); // always explicit UTC so there's no ambiguity
  }

  let facebookPageId = null;
  if (body.facebookPageId) {
    if (!/^[0-9]{5,30}$/.test(String(body.facebookPageId))) return { error: "That Facebook Page ID isn't valid." };
    facebookPageId = String(body.facebookPageId);
  }

  const draftId = typeof body.draftId === "string" && /^[A-Za-z0-9]{10,40}$/.test(body.draftId) ? body.draftId : null;

  return { value: { slot, platforms, texts, attachments, scheduledDate, timezone, facebookPageId, draftId } };
}

// Given the resolved kinds of the attachments, what kind of post is this?
// 0 attachments → "text"; 1-4 images → "image"; exactly one video → "video".
export function postKind(kinds) {
  if (kinds.length === 0) return { kind: "text" };
  const videos = kinds.filter((k) => k === "video").length;
  const images = kinds.filter((k) => k === "image").length;
  if (videos > 1) return { error: "Attach only one video per post." };
  if (videos === 1 && images > 0) return { error: "You can't mix a video and images in one post." };
  return { kind: videos === 1 ? "video" : "image" };
}

// Can every chosen network take this kind of post?
export function checkCapabilities(kind, platforms) {
  for (const id of platforms) {
    const cfg = PLATFORMS[id];
    if (cfg.caps.includes(kind)) continue;
    return { error: kind === "text"
      ? `${cfg.label} needs an image or video attached.`
      : `${cfg.label} can't take ${kind === "image" ? "images" : "a video"} from here yet.` };
  }
  return {};
}
