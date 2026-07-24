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
import { db } from "../firebase";

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
