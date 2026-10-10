// src/lib/socialPosting.js
//
// Client helpers for the Social Posting feature (Oct 2026): $5 per profile
// per month; unlocks pushing Message Machine posts to a user's own accounts.
//
// The browser NEVER decides whether posting is unlocked. useSocialPosting()
// only mirrors socialPosting/{uid}, a document that is writable solely by the
// Stripe webhook (see firestore.rules). Because it's a live listener, the
// Send buttons unlock by themselves the moment the webhook lands after
// checkout — no refresh, no approval step. The server functions
// (social-publish.mjs etc.) re-check the same document on every call, so
// editing anything here can't bypass the paywall.

import { useEffect, useState } from "react";
import { doc, onSnapshot, collection, query, orderBy, limit } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";
import { useAuth } from "../context/AuthContext";

export const PRICE_PER_PROFILE = 5;   // dollars / month — display only; real price is in social-billing.mjs
export const MAX_PROFILES = 5;        // mirrors socialPostingHelper.mjs

// Message Machine platform ids that can be pushed. `caps` = what each network
// accepts (mirrors PLATFORMS in socialPostingHelper.mjs; the server re-checks).
export const SOCIAL_PLATFORMS = {
  facebook:  { label: "Facebook",    maxChars: 63206, accountKeys: ["facebook"],     caps: ["text", "image", "video"] },
  instagram: { label: "Instagram",   maxChars: 2200,  accountKeys: ["instagram"],    caps: ["image", "video"] },
  threads:   { label: "Threads",     maxChars: 500,   accountKeys: ["threads"],      caps: ["text", "image", "video"] },
  bluesky:   { label: "Bluesky",     maxChars: 300,   accountKeys: ["bluesky"],      caps: ["text", "image", "video"] },
  twitter:   { label: "X (Twitter)", maxChars: 280,   accountKeys: ["x", "twitter"], caps: ["text", "image", "video"] },
  tiktok:    { label: "TikTok",      maxChars: 2200,  accountKeys: ["tiktok"],       caps: ["video"] },
};

// ── Media limits (mirror socialPostingHelper.mjs / storage.rules) ──────────
export const MAX_ATTACHMENTS = 4;                    // images; or exactly 1 video
export const MAX_IMAGE_MB = 10;
export const MAX_VIDEO_UPLOAD_MB = 200;              // device uploads
export const MAX_DRIVE_VIDEO_MB = 95;                // library videos
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];
const VIDEO_EXT = ["mp4", "mov", "webm"];

export function kindFromFileName(name = "") {
  const ext = String(name).split(".").pop().toLowerCase();
  if (IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_EXT.includes(ext)) return "video";
  return null;
}

// What a set of attachments is: "text" | "image" | "video" | "mixed".
export function attachmentKind(attachments) {
  if (!attachments.length) return "text";
  const kinds = new Set(attachments.map((a) => a.kind));
  return kinds.size > 1 ? "mixed" : [...kinds][0];
}

// Can another file of `kind` be added to the current attachments?
// Returns an error string, or "" if fine.
export function canAdd(attachments, kind) {
  if (!attachments.length) return "";
  const cur = attachmentKind(attachments);
  if (cur === "video") return "A video post can only have that one video. Remove it first to add something else.";
  if (kind === "video") return "A video can't be combined with pictures. Remove the pictures first.";
  if (attachments.length >= MAX_ATTACHMENTS) return `You can attach up to ${MAX_ATTACHMENTS} pictures.`;
  return "";
}

// Upload a file from the user's device to their own temporary folder in
// Firebase Storage, and return {source:"upload", url, name, kind}. The server
// only accepts URLs under the signed-in user's own socialUploads/{uid}/ folder
// and deletes the file after posting (scheduled-social-cleanup.mjs).
export function uploadDeviceFile(file, uid, onProgress) {
  const kind = kindFromFileName(file.name);
  if (!kind) return Promise.reject(new Error("Only JPG, PNG, WebP pictures and MP4, MOV, WebM videos can be posted."));
  const maxMb = kind === "image" ? MAX_IMAGE_MB : MAX_VIDEO_UPLOAD_MB;
  if (file.size > maxMb * 1024 * 1024) {
    return Promise.reject(new Error(`${file.name} is too big — ${kind === "image" ? "pictures" : "videos"} can be up to ${maxMb} MB.`));
  }
  const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  const ref = storageRef(storage, `socialUploads/${uid}/${Date.now()}-${safe}`);
  const contentType = file.type || (kind === "image" ? "image/jpeg" : "video/mp4");
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref, file, { contentType });
    task.on("state_changed",
      (snap) => onProgress?.(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
      () => reject(new Error(`Couldn't upload ${file.name}. Check your connection and try again.`)),
      async () => {
        try { resolve({ source: "upload", url: await getDownloadURL(task.snapshot.ref), name: file.name, kind }); }
        catch { reject(new Error(`Couldn't upload ${file.name}. Please try again.`)); }
      });
  });
}

const NETWORK_LABELS = {
  facebook: "Facebook", instagram: "Instagram", threads: "Threads", bluesky: "Bluesky",
  x: "X (Twitter)", twitter: "X (Twitter)", tiktok: "TikTok", linkedin: "LinkedIn",
  youtube: "YouTube", pinterest: "Pinterest",
};
export function networkLabel(key) {
  return NETWORK_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

// "Personal" if the user named it, otherwise "Profile 2".
export const profileLabel = (p) => (p?.name ? p.name : `Profile ${(p?.slot ?? 0) + 1}`);

export function isPostable(platformId, connectedKeys) {
  const cfg = SOCIAL_PLATFORMS[platformId];
  return !!cfg && cfg.accountKeys.some((k) => connectedKeys.includes(k));
}

export async function callSocial(fn, user, payload) {
  const idToken = await user.getIdToken();
  const res = await fetch(`/.netlify/functions/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong. Please try again.");
    err.status = res.status;
    throw err;
  }
  return data;
}

// Live view of the user's own socialPosting/{uid} document.
export function useSocialPosting() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    if (!uid) { setState({ loading: false, data: null }); return undefined; }
    setState((s) => ({ ...s, loading: true }));
    const unsub = onSnapshot(
      doc(db, "socialPosting", uid),
      (snap) => setState({ loading: false, data: snap.exists() ? snap.data() : null }),
      // A permission error just means "no subscription record" — treat as locked.
      () => setState({ loading: false, data: null }),
    );
    return unsub;
  }, [uid]);

  return {
    loading: state.loading,
    data: state.data,
    status: state.data?.status || "none",
    active: state.data?.status === "active",
    profilesPaid: Number(state.data?.profilesPaid) || 0,
    profileNames: state.data?.profileNames || {},
  };
}

// Live list of the user's own drafts / scheduled / recent posts
// (socialPosting/{uid}/posts — read-only here; changes go through the
// social-posts function).
export function useMySocialPosts() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState({ loading: true, posts: [] });
  useEffect(() => {
    if (!uid) { setState({ loading: false, posts: [] }); return undefined; }
    const q = query(collection(db, "socialPosting", uid, "posts"), orderBy("updatedAt", "desc"), limit(60));
    return onSnapshot(q,
      (snap) => setState({ loading: false, posts: snap.docs.map((d) => ({ id: d.id, ...d.data() })) }),
      () => setState({ loading: false, posts: [] }));
  }, [uid]);
  return state;
}
