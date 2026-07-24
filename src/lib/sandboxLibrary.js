// src/lib/sandboxLibrary.js
//
// Data layer for the Prompt Sandbox (Handoff #26 follow-up). Presets are
// personal to whichever manager/admin saved them — stored under
// sandboxPresets/{uid}/presets/{presetId} rather than a flat top-level
// collection, so Firestore rules can scope read/write to request.auth.uid
// without a role check duplicated in the rules file. Mirrors the
// collection-per-user shape already established for saved Library items.

import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  getDocs, query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";

// Reuses Storms' platform list/labels so a preset's platform choice stays
// consistent with the rest of the app rather than inventing a second list
// that could drift (see stormLibrary.js PLATFORMS/CHAR_LIMITS).
export { PLATFORMS, CHAR_LIMITS } from "./stormLibrary";

function presetsCol(uid) {
  return collection(db, "sandboxPresets", uid, "presets");
}

export async function savePreset(uid, data) {
  const docRef = await addDoc(presetsCol(uid), {
    name: data.name,
    promptText: data.promptText,
    charMin: data.charMin ?? null,
    charMax: data.charMax ?? null,
    hashtag: data.hashtag || "",
    platform: data.platform || "",
    postCount: data.postCount ?? 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function loadPresets(uid) {
  const q = query(presetsCol(uid), orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function updatePreset(uid, presetId, data) {
  await updateDoc(doc(db, "sandboxPresets", uid, "presets", presetId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePreset(uid, presetId) {
  await deleteDoc(doc(db, "sandboxPresets", uid, "presets", presetId));
}

// ── Transcript source upload (new — video/audio-to-transcript feature) ────
// Uploads directly from the browser to Firebase Storage, the same
// uploadBytesResumable pattern stormLibrary.js's uploadPostMedia already
// uses — this is deliberate, not incidental: it bypasses Netlify Function
// body-size limits entirely, since the file bytes never pass through a
// function at all. The resulting download URL is what gets handed to the
// transcription service (see start-transcription.mjs), which fetches the
// audio itself server-side rather than receiving uploaded bytes.
//
// Cap is deliberately higher than Storms' MAX_VIDEO_MB (72MB, tuned for
// short-form platform-ready video). This is raw, unpublished source
// material for transcription only — a 30-60 minute rally speech or town
// hall recording can easily be larger than a finished social clip.
export const MAX_TRANSCRIPT_SOURCE_MB = 500;

export async function uploadTranscriptSource(uid, file, onProgress) {
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `sandboxTranscripts/${uid}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    task.on(
      "state_changed",
      (snap) => onProgress?.(snap.bytesTransferred / snap.totalBytes),
      reject,
      async () => {
        const url = await getDownloadURL(storageRef);
        resolve({ url, path, sizeMB: +(file.size / (1024 * 1024)).toFixed(1), name: file.name });
      }
    );
  });
}
