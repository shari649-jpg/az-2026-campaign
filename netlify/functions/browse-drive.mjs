// netlify/functions/browse-drive.mjs
// Browses Google Drive media folder using API key (public folder access).
// Folder must be shared as "Anyone with the link - Viewer".
// Modes:
//   folders  — list subfolders of a given folderId
//   files    — list image/video/gif files in a folder
//   debug    — list everything visible
//
// AUTH: requires a valid Firebase ID token (any signed-in user). Previously
// this endpoint had NO auth check — anyone with the URL could browse the
// org's Drive media folder (including the unscoped debug mode) without
// signing in. Fixed July 2026 security pass.
//
// Modern Netlify Functions runtime (ESM)

import { google } from "googleapis";
import admin from "firebase-admin";
import { readFileSync } from "node:fs";

const ROOT_FOLDER_ID = "1Kt2ytgpZEy8NWPfuuY6j9M6QZuHVelw_";

const IMAGE_MIMES = [
  "image/jpeg", "image/png", "image/webp",
  "image/svg+xml", "image/bmp", "image/tiff",
];
const VIDEO_MIMES = [
  "video/mp4", "video/quicktime", "video/x-msvideo",
  "video/webm", "video/mpeg", "video/x-matroska",
];
const GIF_MIME = "image/gif";
const ALL_MEDIA_MIMES = [...IMAGE_MIMES, GIF_MIME, ...VIDEO_MIMES];

function getDrive() {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_DRIVE_API_KEY env var not set");
  return google.drive({ version: "v3", auth: apiKey });
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(new URL("./firebase-service-account.json", import.meta.url), "utf8"));
  } catch {
    throw new Error("firebase-service-account.json not found — run `npm run build` to regenerate via scripts/inject-secrets.mjs.");
  }
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

async function requireSignedIn(app, idToken) {
  if (!idToken) throw new Error("unauthenticated");
  const decoded = await admin.auth(app).verifyIdToken(idToken);
  return decoded.uid;
}

function mapFile(f) {
  const isVideo = VIDEO_MIMES.includes(f.mimeType);
  const isGif   = f.mimeType === GIF_MIME;
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size ? parseInt(f.size) : null,
    modifiedTime: f.modifiedTime,
    type: isVideo ? "video" : isGif ? "gif" : "image",
    thumbnailLink: f.thumbnailLink
      ? f.thumbnailLink.replace(/=s\d+/, "=s400")
      : null,
    downloadUrl: `https://drive.google.com/uc?export=download&id=${f.id}`,
    viewUrl: !isVideo
      ? `https://drive.google.com/uc?export=view&id=${f.id}`
      : null,
  };
}

export default async function (req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Auth (added — this endpoint previously had no check at all) ──────────
  let adminApp;
  try {
    adminApp = getAdminApp();
  } catch (err) {
    console.error("[browse-drive] admin init error:", err.message);
    return new Response(JSON.stringify({ success: false, error: "Server configuration error." }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization") || "";
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const body = await req.json();
    const idToken = headerToken || body.idToken;

    try {
      await requireSignedIn(adminApp, idToken);
    } catch {
      return new Response(JSON.stringify({ success: false, error: "You must be signed in to use this tool." }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }

    const { mode, folderId } = body;
    const targetFolder = folderId || ROOT_FOLDER_ID;

    console.log(`[browse-drive] mode=${mode} targetFolder=${targetFolder}`);

    const drive = getDrive();

    if (mode === "folders") {
      const res = await drive.files.list({
        q: `'${targetFolder}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name, modifiedTime)",
        orderBy: "name",
        pageSize: 100,
      });

      const folders = (res.data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
      }));

      console.log(`[browse-drive] folders found: ${folders.length}`);

      let folderName = "Media";
      try {
        const meta = await drive.files.get({ fileId: targetFolder, fields: "name" });
        folderName = meta.data.name;
      } catch (e) {
        console.log(`[browse-drive] folder name lookup failed: ${e.message}`);
      }

      return new Response(
        JSON.stringify({ success: true, folders, folderName }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (mode === "files") {
      const mimeFilter = ALL_MEDIA_MIMES.map(m => `mimeType = '${m}'`).join(" or ");

      const res = await drive.files.list({
        q: `'${targetFolder}' in parents and (${mimeFilter}) and trashed = false`,
        fields: "files(id, name, mimeType, size, modifiedTime, thumbnailLink)",
        orderBy: "name",
        pageSize: 200,
      });

      const files = (res.data.files || []).map(mapFile);
      console.log(`[browse-drive] files found: ${files.length}`);

      let folderName = "Media";
      try {
        const meta = await drive.files.get({ fileId: targetFolder, fields: "name" });
        folderName = meta.data.name;
      } catch (e) {
        console.log(`[browse-drive] folder name lookup failed: ${e.message}`);
      }

      return new Response(
        JSON.stringify({ success: true, files, folderName, total: files.length }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (mode === "debug") {
      const res = await drive.files.list({
        fields: "files(id, name, mimeType, parents)",
        pageSize: 20,
        q: "trashed = false",
        orderBy: "modifiedTime desc",
      });
      return new Response(
        JSON.stringify({ success: true, debug: true, visibleFiles: res.data.files || [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid mode" }), { status: 400 });

  } catch (err) {
    console.error("[browse-drive] error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
