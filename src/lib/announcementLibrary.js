import { db, auth } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";

const COL = "announcements";

// Admin + Manager can create/edit/delete scheduled announcements — matches
// the same permission tier used for reviewing/archiving Storms elsewhere
// (stormLibrary.js's canReview/canArchive), one step below the
// Administrator-only tier AdminPage itself uses.
export function canManageAnnouncements(role) {
  return role === "administrator" || role === "manager";
}

// Create a new scheduled announcement. startAt/endAt are JS Date objects.
export async function createAnnouncement({ text, startAt, endAt }) {
  const u = auth.currentUser;
  const createdBy = u ? { uid: u.uid, displayName: u.displayName || null, email: u.email || null } : null;
  const docRef = await addDoc(collection(db, COL), {
    text: text.trim(),
    startAt: Timestamp.fromDate(startAt),
    endAt: Timestamp.fromDate(endAt),
    createdBy,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateAnnouncement(id, { text, startAt, endAt }) {
  await updateDoc(doc(db, COL, id), {
    text: text.trim(),
    startAt: Timestamp.fromDate(startAt),
    endAt: Timestamp.fromDate(endAt),
  });
}

export async function deleteAnnouncement(id) {
  await deleteDoc(doc(db, COL, id));
}

// All announcements, most recently created first — powers the management
// list (active/upcoming/past) and doubles as the ordering loadActiveAnnouncement
// relies on for its own tie-break.
export async function loadAllAnnouncements() {
  const q = query(collection(db, COL), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// The single announcement that should be showing right now, if any.
// Only one displays at a time by design (simpler than stacking/rotating
// banners) — if two scheduled windows overlap, the most recently created
// one wins, since loadAllAnnouncements is already ordered createdAt desc
// and this just takes the first match.
export async function loadActiveAnnouncement() {
  const all = await loadAllAnnouncements();
  const now = Date.now();
  return (
    all.find((a) => {
      const start = a.startAt?.toMillis ? a.startAt.toMillis() : 0;
      const end = a.endAt?.toMillis ? a.endAt.toMillis() : 0;
      return start <= now && now <= end;
    }) || null
  );
}

// Does [startAt, endAt] overlap any OTHER existing announcement's window?
// Used by the management UI to warn (not block) when scheduling something
// that collides with an already-scheduled message.
export function findOverlapping(announcements, startAt, endAt, excludeId) {
  const s = startAt.getTime();
  const e = endAt.getTime();
  return announcements.filter((a) => {
    if (a.id === excludeId) return false;
    const aStart = a.startAt?.toMillis ? a.startAt.toMillis() : 0;
    const aEnd = a.endAt?.toMillis ? a.endAt.toMillis() : 0;
    return s <= aEnd && aStart <= e;
  });
}
