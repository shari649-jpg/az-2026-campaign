// src/lib/stormLibrary.js
//
// Data layer for Storm Chasers Hub — the container/workflow object for a
// social storm campaign. This covers the STORM itself (title, dates, alarm
// rating, status, permissions). Individual storm ENTRIES (one video + six
// platform texts each) are a separate collection built in the next pass —
// see BUILD_PLAN_Social_Storms.md — and will nest under storms/{id}/entries.

import { db, auth } from "../firebase";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  getDocs, query, orderBy, serverTimestamp,
} from "firebase/firestore";

const COL = "storms";

// ── Status lifecycle ────────────────────────────────────────────────────
// draft            — being built by a Member; not visible to other members
// pending_review   — Member submitted; waiting on a Manager/Admin
// active           — live in the Storm Chaser's Vault for members to use
// archived         — pulled from the Vault, kept for records
export const STORM_STATUS = {
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  ACTIVE: "active",
  ARCHIVED: "archived",
};

export const SUBJECT_TYPES = ["Candidate", "Issue/Topic", "Race/District", "Coalition-wide"];

// ── Permissions ──────────────────────────────────────────────────────────
// administrator: create, edit, review/approve, archive, delete — anything
// manager:       create, edit, review/approve, archive — no hard delete
// user (member): create (lands in draft), edit only their own drafts —
//                cannot self-approve, archive, or delete
export function canReview(role)  { return role === "administrator" || role === "manager"; }
export function canArchive(role) { return role === "administrator" || role === "manager"; }
export function canDelete(role)  { return role === "administrator"; }
export function canEdit(role, storm, uid) {
  if (role === "administrator" || role === "manager") return true;
  return storm.createdBy?.uid === uid && storm.status === STORM_STATUS.DRAFT;
}

function currentUserStamp() {
  const u = auth.currentUser;
  return u ? { uid: u.uid, displayName: u.displayName || null, email: u.email || null } : null;
}

// ── Create ───────────────────────────────────────────────────────────────
// Members land in draft regardless of what they pass in; only a
// manager/admin call may set an initial status of pending_review or active.
export async function createStorm(data, role) {
  const createdBy = currentUserStamp();
  const initialStatus =
    (role === "administrator" || role === "manager") && data.status
      ? data.status
      : STORM_STATUS.DRAFT;

  const docRef = await addDoc(collection(db, COL), {
    title: data.title || "",
    summary: data.summary || "",
    description: data.description || "",
    hashtag: (data.hashtag || "").replace(/^#/, "").trim(),
    subjectType: data.subjectType || "Coalition-wide",
    subjectName: data.subjectType === "Coalition-wide" ? "" : (data.subjectName || ""),
    alarmLevel: [1, 2, 3].includes(data.alarmLevel) ? data.alarmLevel : 1,
    startAt: data.startAt || null,       // ISO string from a datetime-local input
    expiresAt: data.expiresAt || null,   // ISO string
    status: initialStatus,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    reviewedBy: null,
    reviewedAt: null,
  });
  return docRef.id;
}

// ── Read ─────────────────────────────────────────────────────────────────
export async function loadAllStorms() {
  const q = query(collection(db, COL), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function loadStorm(id) {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ── Update ───────────────────────────────────────────────────────────────
export async function updateStorm(id, data) {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
}

// Manager/Admin only — enforced again in Firestore rules, not just the UI.
export async function setStormStatus(id, status, role) {
  if (!canReview(role) && status !== STORM_STATUS.DRAFT) {
    throw new Error("Only Managers and Administrators can change a storm's review status.");
  }
  const patch = { status, updatedAt: serverTimestamp() };
  if (status === STORM_STATUS.ACTIVE) {
    patch.reviewedBy = currentUserStamp();
    patch.reviewedAt = serverTimestamp();
  }
  await updateDoc(doc(db, COL, id), patch);
}

// ── Delete ───────────────────────────────────────────────────────────────
// Admin-only. (Managers archive instead — see canDelete above.) Note: this
// removes the storm document only. Once entries + Storage videos exist
// (next build phase), deleting a storm must also delete its entries
// subcollection and their Storage files, or they'll orphan and keep billing.
export async function deleteStorm(id) {
  await deleteDoc(doc(db, COL, id));
}

// ── Alarm display helper ──────────────────────────────────────────────────
export function alarmLabel(level) {
  return { 1: "1 Alarm", 2: "2 Alarm", 3: "3 Alarm — Urgent" }[level] || "1 Alarm";
}
