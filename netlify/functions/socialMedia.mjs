// netlify/functions/socialMedia.mjs
//
// Media handling for Social Posting (Oct 2026): turns the attachments the
// browser named into bytes / URLs Upload-Post can use, and builds the
// Upload-Post request for photo and video posts.
//
// TWO SOURCES (the browser sends only identifiers, never file contents):
//   { source: "drive",  id }   a file in the coalition media library (Google
//                              Drive). The id is verified to live under the
//                              library's root folder before anything is fetched.
//   { source: "upload", url }  a file the user uploaded from their own device
//                              to Firebase Storage at socialUploads/{uid}/….
//                              The url must be OUR storage host and THEIR folder.
//
// HOW EACH KIND IS SENT
//   image(s) → POST /upload_photos with the bytes. Upload-Post's photo endpoint
//              takes binary files only (no URL option), so this server downloads
//              each image (≤ 10 MB) and forwards it.
//   video    → POST /upload with `video` = a URL (Upload-Post's video endpoint
//              accepts a file OR a URL). Device uploads pass the Storage
//              download URL; Drive videos pass Drive's download link. This avoids
//              pushing large files through a 26-second serverless function.
//
// TEMP FILES: device uploads are recorded in socialUploads/{id} with a
// deleteAfter time; scheduled-social-cleanup.mjs deletes them later. The wait
// matters for scheduled video posts — Upload-Post may fetch the URL when the
// post goes out, so the file must outlive the scheduled time.

import admin from "firebase-admin";
import { google } from "googleapis";
import {
  PLATFORMS, platformValue, kindFromMime, kindFromName, parseStorageUrl,
  MAX_IMAGE_BYTES, MAX_DRIVE_VIDEO_BYTES,
} from "./socialPostingHelper.mjs";

// MUST match ROOT_FOLDER_ID in browse-drive.mjs (the media library root).
export const DRIVE_ROOT_FOLDER_ID = "1Kt2ytgpZEy8NWPfuuY6j9M6QZuHVelw_";

function getDrive() {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Media library isn't configured."), { code: "not_configured" });
  return google.drive({ version: "v3", auth: apiKey });
}

const userError = (message) => Object.assign(new Error(message), { code: "user" });

// Is this Drive file inside the media library folder tree? (Walk up ≤10 levels.)
async function inLibrary(drive, parents) {
  let current = parents || [];
  for (let depth = 0; depth < 10 && current.length; depth++) {
    if (current.includes(DRIVE_ROOT_FOLDER_ID)) return true;
    const p = await drive.files.get({ fileId: current[0], fields: "id,parents" });
    current = p.data.parents || [];
  }
  return false;
}

// Look up what each attachment really is. Returns resolved items:
//   { source, kind, name, id? (drive), url?/bucket?/path? (upload), size?, mime? }
// Throws a { code: "user" } error with a plain-English message on anything
// invalid, out of bounds, or outside the user's own files.
export async function resolveAttachments(attachments, uid) {
  const out = [];
  for (const a of attachments) {
    if (a.source === "drive") {
      const drive = getDrive();
      let meta;
      try {
        meta = (await drive.files.get({ fileId: a.id, fields: "id,name,mimeType,size,parents,trashed" })).data;
      } catch {
        throw userError("Couldn't find one of the library files you picked.");
      }
      if (meta.trashed) throw userError("One of the library files was deleted.");
      if (!(await inLibrary(drive, meta.parents))) throw userError("That file isn't in the media library.");
      const kind = kindFromMime(meta.mimeType);
      if (!kind) throw userError(`"${meta.name}" is a ${meta.mimeType}, which can't be posted yet (JPG, PNG, WebP, MP4, MOV and WebM work).`);
      const size = Number.parseInt(meta.size, 10) || 0;
      if (kind === "image" && size > MAX_IMAGE_BYTES) throw userError(`"${meta.name}" is over ${MAX_IMAGE_BYTES / 1048576} MB. Pick a smaller image.`);
      if (kind === "video" && size > MAX_DRIVE_VIDEO_BYTES) {
        throw userError(`"${meta.name}" is too big to send straight from the library. Download it and use "From my device" instead.`);
      }
      out.push({ source: "drive", id: meta.id, name: meta.name, mime: meta.mimeType, size, kind });
    } else {
      const loc = parseStorageUrl(a.url, uid);
      if (!loc) throw userError("One of your uploaded files isn't valid. Please upload it again.");
      const kind = kindFromName(loc.path);
      if (!kind) throw userError("That file type can't be posted yet (JPG, PNG, WebP, MP4, MOV and WebM work).");
      out.push({ source: "upload", url: a.url, bucket: loc.bucket, path: loc.path, name: a.name || loc.path.split("/").pop(), kind });
    }
  }
  return out;
}

// Download one image's bytes (≤ 10 MB) from its source.
export async function fetchImage(att) {
  if (att.source === "drive") {
    const drive = getDrive();
    const res = await drive.files.get({ fileId: att.id, alt: "media" }, { responseType: "arraybuffer" });
    const buf = Buffer.from(res.data);
    if (buf.length > MAX_IMAGE_BYTES) throw userError(`"${att.name}" is over ${MAX_IMAGE_BYTES / 1048576} MB. Pick a smaller image.`);
    return { buf, mime: att.mime, filename: att.name };
  }
  const res = await fetch(att.url);
  if (!res.ok) throw userError("Couldn't read one of your uploaded images. Please upload it again.");
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_IMAGE_BYTES) throw userError(`"${att.name}" is over ${MAX_IMAGE_BYTES / 1048576} MB. Pick a smaller image.`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw userError(`"${att.name}" is over ${MAX_IMAGE_BYTES / 1048576} MB. Pick a smaller image.`);
  const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  return { buf, mime, filename: att.name };
}

// URL Upload-Post should fetch the video from.
export function videoUrl(att) {
  return att.source === "drive"
    ? `https://drive.google.com/uc?export=download&id=${att.id}`
    : att.url;
}

// Build the multipart body for /upload_text, /upload_photos or /upload.
// `images` = [{ buf, mime, filename }] for kind "image"; `video` = URL string for "video".
export function buildPostForm({ kind, username, platforms, texts, scheduledDate, timezone, facebookPageId, images, video, altX }) {
  const form = new FormData();
  form.append("user", username);
  for (const id of platforms) form.append("platform[]", platformValue(id, kind, altX));
  form.append("title", texts[platforms[0]]); // required default caption
  for (const id of platforms) form.append(PLATFORMS[id].titleField, texts[id]);
  if (scheduledDate) {
    form.append("scheduled_date", scheduledDate);
    form.append("timezone", timezone);
  }
  if (facebookPageId && platforms.includes("facebook")) form.append("facebook_page_id", facebookPageId);

  if (kind === "image") {
    for (const img of images) form.append("photos[]", new Blob([img.buf], { type: img.mime }), img.filename);
  } else if (kind === "video") {
    form.append("video", video);
    // Facebook defaults to Reels (9:16 only); VIDEO accepts any aspect ratio.
    if (platforms.includes("facebook")) form.append("facebook_media_type", "VIDEO");
    // Let Upload-Post process in the background rather than hold this
    // function open; scheduled posts return a job id instead.
    if (!scheduledDate) form.append("async_upload", "true");
  }
  return form;
}

export function endpointFor(kind) {
  return kind === "image" ? "/upload_photos" : kind === "video" ? "/upload" : "/upload_text";
}

// Remember device uploads so the cleanup job can delete them later.
export async function recordTempUploads(db, uid, resolved, scheduledDate) {
  const uploads = resolved.filter((a) => a.source === "upload");
  if (!uploads.length) return;
  const base = scheduledDate ? Math.max(Date.now(), new Date(scheduledDate).getTime()) : Date.now();
  // Photos are copied to Upload-Post immediately (1 day is plenty). Videos are
  // fetched by URL, possibly at publish time, so keep them 2 days past it.
  const days = (a) => (a.kind === "video" ? 2 : 1);
  await Promise.all(uploads.map((a) => db.collection("socialUploads").add({
    uid,
    bucket: a.bucket,
    path: a.path,
    kind: a.kind,
    deleteAfter: admin.firestore.Timestamp.fromMillis(base + days(a) * 86_400_000),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  })));
}
