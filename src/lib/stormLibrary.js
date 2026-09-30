// src/lib/stormLibrary.js
//
// Data layer for Storm Chaser's Hub (the storm container) AND its posts
// subcollection (the actual video/graphic + six platform texts members
// download and post). Posts live at storms/{stormId}/posts/{postId};
// their media files live in Storage at storms/{stormId}/{postId}/....

import { db, auth, storage } from "../firebase";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  getDocs, query, orderBy, serverTimestamp, increment,
} from "firebase/firestore";
import {
  ref, uploadBytesResumable, uploadBytes, getDownloadURL, deleteObject,
} from "firebase/storage";

const COL = "storms";

// ── Status lifecycle ────────────────────────────────────────────────────
export const STORM_STATUS = {
  DRAFT: "draft",
  PENDING_REVIEW: "pending_review",
  ACTIVE: "active",
  ARCHIVED: "archived",
};

export const SUBJECT_TYPES = ["Candidate", "Issue/Topic", "Race/District", "Coalition-wide"];

// The six platforms a storm post's text is written for. Kept as a single
// source of truth here so the Hub's post editor and download/copy
// buttons never drift out of sync with each other.
// `badge` is a short abbreviation shown on the icon-style toggle button in
// the redesigned post display (StormsHubPage.jsx's UserPostCard, and the
// future public storm page reusing the same component) — added July 2026
// alongside that redesign. No icon library or brand logos are used here on
// purpose; a plain colored badge avoids reproducing any platform's actual
// trademarked logo.
export const PLATFORMS = [
  { key: "facebook",  label: "Facebook",    badge: "FB" },
  { key: "instagram", label: "Instagram",   badge: "IG" },
  { key: "twitter",   label: "X / Twitter", badge: "X" },
  { key: "threads",   label: "Threads",     badge: "TH" },
  { key: "tiktok",    label: "TikTok",      badge: "TT" },
  { key: "bluesky",   label: "Bluesky",     badge: "BS" },
];

// Per-platform character limits, used for the live counter in the post
// editor. Sources: each platform's own published limits as of mid-2026.
export const CHAR_LIMITS = {
  facebook:  63206,
  instagram: 2200,
  twitter:   280,
  threads:   500,
  tiktok:    2200,
  bluesky:   300,
};

export const MEDIA_TYPES = { VIDEO: "video", GRAPHIC: "graphic" };

// Base URL for a storm's public page (item 5 builds the actual /storm/:token
// route this points at) — kept here as the single source of truth so the
// link displayed/copied in StormPostsPanel.jsx and whatever the eventual
// public-fetch function needs to know about itself never drift apart.
export const PUBLIC_STORM_BASE_URL = "https://arizonacoalition.net/storm";
export const MAX_VIDEO_MB = 72;
export const MAX_GRAPHIC_MB = 15;
export const MAX_GRAPHICS_PER_POST = 10;

// ── Push-to-Storm bridge (Handoff #15, decision #7) ────────────────────────
// Message Machine (Admin/Manager only) can push its generated platform texts
// straight into a Storm post. Two paths:
//   - Existing storm: writes the post directly via createPost() below — no
//     bridge needed, it's a normal write.
//   - Brand-new storm: Message Machine can't create a storm itself (that
//     needs the full Storm form — title, summary, dates, etc.), so it stages
//     the texts here and sends the user to /storms to create the storm
//     normally. Once that new storm is saved, the Hub's existing
//     "jump straight into building its posts" behavior opens the Posts
//     panel automatically — which is the one moment this key gets read and
//     cleared. A short TTL keeps a stale, abandoned push from silently
//     attaching itself to some unrelated storm created later in the day.
export const PUSH_TO_STORM_KEY = "mm_push_to_storm";
export const PUSH_TO_STORM_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Aug 2026 — the reverse direction of the above. "+ Add Post" on a storm
// (StormPostsPanel.jsx) previously opened StormPostEditor directly on an
// empty post, relying on Storm Chasers' own thin, non-persona, no-mode
// native generation. That's been replaced: "+ Add Post" now stages the
// storm's title/summary/description as a single combined Issue/Content
// string and sends the user to Message Machine instead, so post creation
// goes through Message Machine's full mode/frame/audience/style/tone
// machinery. The user then uses Message Machine's EXISTING "Push to
// Storm" flow (pushToExistingStorm, above) to send the result back into
// this same storm — that path already writes directly to Firestore and
// already lets the user pick any storm from a list, so no new machinery
// was needed for the return trip, only this outbound leg.
export const STORM_TO_MM_KEY = "storm_pending_post";
export const STORM_TO_MM_TTL_MS = 10 * 60 * 1000; // 10 minutes — matches the reverse direction's TTL

// ── Permissions (storm container) ─────────────────────────────────────────
export function canReview(role)  { return role === "administrator" || role === "manager"; }
export function canArchive(role) { return role === "administrator" || role === "manager"; }
export function canDelete(role)  { return role === "administrator"; }

// ── Org co-editing (Sept 2026) ─────────────────────────────────────────
// "Org of one" (matches ProfilePage.jsx/AdminPage.jsx's established
// convention): an individual-tier account's own orgId IS its own uid.
// Not a flag, not a role — computed the same way every other caller
// already checks it.
export function isOrgOfOneAccount(uid, orgId) {
  return !!uid && !!orgId && orgId === uid;
}

// orgCoEditAccess() is the single source of truth for "can this viewer
// co-edit THIS storm's content/posts right now, and which statuses can
// they set it to" — mirrors firestore.rules' storms/{stormId} update
// branches exactly (see that file for the full reasoning):
//   • org-of-one: every stage (draft/pending_review/active/archived) of
//     their OWN storm — there's nobody else in that org to hand review to.
//   • org admin: CONTENT edits during draft OR pending_review of any
//     SAME-ORG storm — may only reach "active" FROM pending_review, so
//     co-editing doesn't skip the review gate the way org-of-one's own
//     storm does. Separately (round 2, Sept 2026): an ARCHIVE-ONLY
//     capability reachable from ANY non-archived status (Active included)
//     — a pure status transition, no content fields, so this doesn't
//     reopen editing on a storm that's already live.
// `canEditContent` tells callers (StormsHubPage.jsx) whether the
// content-editing UI (Manage Storm menu, StormFormModal, post editor)
// should be offered at all, vs. only a status control that can reach
// "archived" and nothing else.
// Returns null when the viewer has no co-edit access to this storm at all
// (different org, storm still lacks an orgId, already archived, etc.) —
// callers treat null as "fall back to whatever this viewer's role would
// normally get."
export function orgCoEditAccess(isOrgAdmin, uid, orgId, storm) {
  if (!orgId || !storm?.orgId || storm.orgId !== orgId) return null;
  if (isOrgOfOneAccount(uid, orgId)) {
    if (storm.createdBy?.uid !== uid) return null; // defense in depth — should never happen
    if (storm.status === STORM_STATUS.ARCHIVED) {
      return { kind: "org-of-one", canEditContent: false, statusOptions: [STORM_STATUS.ARCHIVED] };
    }
    return {
      kind: "org-of-one",
      canEditContent: true,
      statusOptions: [STORM_STATUS.DRAFT, STORM_STATUS.PENDING_REVIEW, STORM_STATUS.ACTIVE, STORM_STATUS.ARCHIVED],
    };
  }
  if (isOrgAdmin && storm.status !== STORM_STATUS.ARCHIVED) {
    const canEditContent = storm.status === STORM_STATUS.DRAFT || storm.status === STORM_STATUS.PENDING_REVIEW;
    if (canEditContent) {
      return {
        kind: "org-admin",
        canEditContent: true,
        statusOptions: storm.status === STORM_STATUS.DRAFT
          ? [STORM_STATUS.DRAFT, STORM_STATUS.PENDING_REVIEW, STORM_STATUS.ARCHIVED]
          : [STORM_STATUS.DRAFT, STORM_STATUS.PENDING_REVIEW, STORM_STATUS.ACTIVE, STORM_STATUS.ARCHIVED],
      };
    }
    // Active (or any other non-archived, non-draft/pending_review status):
    // no content editing offered directly here — but org admin CAN send it
    // back to Draft (Sept 2026, round 3: this was the only route to let an
    // org admin add more posts to an already-Active storm, since posts
    // co-editing is itself gated to draft/pending_review — see the
    // storms/{stormId}/posts rule) or straight to Archived. Both are pure
    // status transitions, no content fields touched here; re-entering
    // Draft is what reopens the co-edit branch above on the next call.
    return { kind: "org-admin-reopen-or-archive", canEditContent: false, statusOptions: [storm.status, STORM_STATUS.DRAFT, STORM_STATUS.ARCHIVED] };
  }
  return null;
}
export function canEdit(role, storm, uid) {
  if (role === "administrator" || role === "manager") return true;
  return storm.createdBy?.uid === uid && storm.status === STORM_STATUS.DRAFT;
}

// A storm's POSTS can be managed by staff (any storm) OR by the storm's
// own creator (their own storm only, any status). This is what lets a
// Member who drafted a storm immediately go build its posts, not just
// the container fields.
export function canManagePosts(role, storm, uid) {
  if (role === "administrator" || role === "manager") return true;
  return !!(storm && uid && storm.createdBy?.uid === uid);
}

// Per-platform text lock (Handoff #15, decision #7) — Admin/Manager only,
// regardless of who created the storm. A storm's own creator can manage
// posts (above) but cannot lock a field against their own future edits.
export function canLockFields(role) {
  return role === "administrator" || role === "manager";
}

function currentUserStamp() {
  const u = auth.currentUser;
  return u ? { uid: u.uid, displayName: u.displayName || null, email: u.email || null } : null;
}

// ── Storm container: create / read / update / delete ──────────────────────
// orgId (Aug 27 2026 fix) — createStorm() never wrote this field at all,
// which meant public-storm-regenerate.mjs's storm.orgId read was always
// null, silently skipping credit debiting for every public storm ever
// created (fail-open by design — confirmed via a real, reproduced test:
// two regens on a live public storm produced no ledger entry and no
// balance change). Caught early — no public storm existed yet except
// az-coalition's own test storm, so no backfill of existing docs was
// needed, only this fix going forward. orgId is passed in from the caller
// (the creating user's own profile.orgId) rather than looked up here, to
// avoid an extra Firestore read for something the caller already has via
// AuthContext.
export async function createStorm(data, role, orgId = null) {
  const createdBy = currentUserStamp();
  const initialStatus =
    (role === "administrator" || role === "manager") && data.status
      ? data.status
      : STORM_STATUS.DRAFT;

  // orgName (Sept 2026) — denormalized onto the storm at creation time so
  // Manager View can show "By <org name>" instead of always showing the
  // creator's own name. Fetched here (not stored elsewhere yet) because
  // orgs/{orgId} is readable to the creator via isSameOrg(orgId) — they're
  // always reading their OWN org's doc, never someone else's — which
  // avoids widening firestore.rules' orgs/{orgId} read (isSameOrg() ||
  // isAdmin()) to cover every Manager reading every org's billing-adjacent
  // doc just to label a storm card. For an "org of one" account,
  // provision-account.mjs already seeds orgs/{uid}.name with that
  // person's own name, so this naturally satisfies "org of one → just
  // show the person's name" with no special-casing needed here. Best
  // effort: a failed/missing read just leaves orgName unset and the UI
  // falls back to createdBy's name, same as before this change. Real
  // staff (administrator/manager) creating a coalition-wide storm pass no
  // orgId, so this is skipped for them entirely.
  let orgName = null;
  if (orgId) {
    try {
      const orgSnap = await getDoc(doc(db, "orgs", orgId));
      orgName = orgSnap.exists() ? (orgSnap.data().name || null) : null;
    } catch {
      orgName = null;
    }
  }

  const docRef = await addDoc(collection(db, COL), {
    title: data.title || "",
    summary: data.summary || "",
    description: data.description || "",
    hashtag: (data.hashtag || "").replace(/^#/, "").trim(),
    subjectType: data.subjectType || "Coalition-wide",
    subjectName: data.subjectType === "Coalition-wide" ? "" : (data.subjectName || ""),
    alarmLevel: [1, 2, 3].includes(data.alarmLevel) ? data.alarmLevel : 1,
    startAt: data.startAt || null,
    expiresAt: data.expiresAt || null,
    status: initialStatus,
    orgId: orgId || null,
    orgName,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    reviewedBy: null,
    reviewedAt: null,
  });
  return docRef.id;
}

export async function loadAllStorms() {
  const q = query(collection(db, COL), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Client-side check for whether a storm's end date has passed, used both
// by loadActiveStorms below and directly by StormsHubPage.jsx's UserView
// (which filters its own local storms list rather than re-fetching).
// The authoritative fix lives server-side in the hourly
// scheduled-archive-storms.mjs cron, which actually flips status to
// "archived" in Firestore — this is the defensive read-time check that
// covers the gap between an expiration passing and the next cron run.
//
// Uses the browser's own local time, same as every other expiresAt display
// in this app (StormsHubPage.jsx's fmtDateTime/fmtDateShort) — correct as
// long as the person viewing is in Arizona time, the existing assumption
// everywhere expiresAt is shown today. expiresAt itself is stored exactly
// as the raw <input type="datetime-local"> value, with no timezone info.
export function isStormExpired(expiresAt) {
  if (!expiresAt) return false; // no end date set — never auto-expires
  const t = new Date(expiresAt).getTime();
  return !isNaN(t) && t <= Date.now();
}

// Mirror of isStormExpired for the START side. A storm can be status "active"
// while its Start Date & Time is still in the future (staff activate it ahead
// of time); members must not see it until that moment arrives. Same
// browser-local-time assumption as isStormExpired. No startAt = live at once.
export function isStormNotStarted(startAt) {
  if (!startAt) return false;
  const t = new Date(startAt).getTime();
  return !isNaN(t) && t > Date.now();
}

export async function loadActiveStorms() {
  // Filtered client-side rather than a where() clause so this stays a
  // single simple index-free query; storm counts are small (~tens, not
  // thousands), so this is cheap.
  const all = await loadAllStorms();
  return all.filter(s => s.status === STORM_STATUS.ACTIVE && !isStormNotStarted(s.startAt) && !isStormExpired(s.expiresAt));
}

export async function loadStorm(id) {
  const snap = await getDoc(doc(db, COL, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateStorm(id, data) {
  await updateDoc(doc(db, COL, id), { ...data, updatedAt: serverTimestamp() });
}

// setStormStatus (Sept 2026 fix) — CONFIRMED REAL BUG closed here: this
// function's own file header describes the storm's creator being able to
// "manage a storm" they own, and StatusControl (StormsHubPage.jsx) has
// always presented a plain Member with a working-looking "Submit for
// Review" option on their own draft storm — but this function
// unconditionally threw for ANY status other than DRAFT whenever the
// caller wasn't a reviewer, with no exception for a Member submitting
// their OWN draft. The option has been fully clickable and completely
// non-functional since it was built; this closes that gap without
// loosening anything else. A non-reviewer may now make exactly ONE
// transition: their own storm, DRAFT -> PENDING_REVIEW. Every other case
// (a reviewer's own broader transitions, a non-reviewer targeting any
// other status, or a non-reviewer targeting a storm they don't own) is
// still blocked exactly as before — this doesn't touch canReview()'s
// existing authority over Active/Archived at all.
export async function setStormStatus(id, status, role, storm = null, uid = null, orgCoEdit = null) {
  const isOwnDraftSubmission = status === STORM_STATUS.PENDING_REVIEW
    && storm?.status === STORM_STATUS.DRAFT
    && !!storm?.createdBy?.uid
    && !!uid
    && storm.createdBy.uid === uid;

  // orgCoEdit (Sept 2026): caller passes orgCoEditAccess(isOrgAdmin, uid,
  // orgId, storm) for THIS storm/target pair. This is a client-side
  // convenience check only (a faster, friendlier error than waiting on
  // Firestore's own rejection) — firestore.rules is what actually
  // enforces which targets are reachable; this must stay a mirror of it,
  // never a looser gate.
  const isOrgCoEditTransition = !!orgCoEdit?.statusOptions?.includes(status);

  if (!canReview(role) && status !== STORM_STATUS.DRAFT && !isOwnDraftSubmission && !isOrgCoEditTransition) {
    throw new Error("Only Managers and Administrators can change a storm's review status.");
  }
  const patch = { status, updatedAt: serverTimestamp() };
  if (status === STORM_STATUS.ACTIVE) {
    patch.reviewedBy = currentUserStamp();
    patch.reviewedAt = serverTimestamp();
  }
  await updateDoc(doc(db, COL, id), patch);
}

// ── Public storm page (July 2026) ──────────────────────────────────────
// Manager/Admin only, and only meaningful while the storm is Active — the
// UI in StormPostsPanel.jsx enforces the Active check by simply not
// rendering these controls otherwise, same pattern as everywhere else in
// this file trusts the client's own role field for admin-gated writes.
//
// The token is generated once, the first time a storm goes public, and
// then left alone on every later toggle — so switching public access off
// and back on again reuses the same link rather than silently breaking
// something someone already shared or bookmarked.
export async function setStormPublic(id, isPublic, currentToken, role) {
  if (!canReview(role)) {
    throw new Error("Only Managers and Administrators can change a storm's public access.");
  }
  const patch = { isPublic, updatedAt: serverTimestamp() };
  if (isPublic && !currentToken) {
    patch.publicToken = crypto.randomUUID();
  }
  await updateDoc(doc(db, COL, id), patch);
  return patch.publicToken || currentToken || null;
}

// image is either { url, path, name, source: "post" } (referencing an
// already-uploaded post graphic — no re-upload, just copy the reference)
// or the result of uploadPublicCardImage below with source: "upload".
export async function setStormPublicCardImage(id, image, role) {
  if (!canReview(role)) {
    throw new Error("Only Managers and Administrators can change a storm's public card image.");
  }
  await updateDoc(doc(db, COL, id), { publicCardImage: image, updatedAt: serverTimestamp() });
}

// Uploads a dedicated image for the public card — separate from any post's
// own media, since a storm's public card image is independent of which
// (if any) post graphics exist. Mirrors uploadPostMedia's shape below, but
// non-resumable (a single small card image doesn't need progress tracking)
// and stored under its own Storage path so it's never confused with, or
// accidentally cleaned up by, a specific post's own media lifecycle.
export async function uploadPublicCardImage(stormId, file) {
  if (file.size > MAX_GRAPHIC_MB * 1024 * 1024) {
    throw new Error(`Image must be ${MAX_GRAPHIC_MB}MB or smaller.`);
  }
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `storms/${stormId}/public-card/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  return { url, path, name: file.name };
}

// Deletes the storm doc, all of its posts, and all of their Storage
// files. This is the only delete path that fully cleans up — deleting a
// post individually (deletePost, below) also cleans its own files, but
// this sweeps everything in one go for a full storm teardown.
// CONFIRMED GAP closed here (Sept 2026, round 3): this only ever cleaned up
// the posts subcollection (+ their Storage files) before deleting the storm
// doc itself — Firestore never cascade-deletes a subcollection when its
// parent document is deleted, so storms/{stormId}/notes was left behind as
// permanently orphaned docs: invisible to the app (nothing lists a deleted
// storm's id anymore) but still real rows in the database, still readable
// by anyone signed in (the notes read rule never checked the parent storm's
// existence), and still editable by their original author via
// updateStormNote(). The posts loop predates notes existing at all, and
// nobody extended it when notes were added. Mirrors that same loop now.
export async function deleteStorm(id) {
  const posts = await loadPosts(id);
  for (const post of posts) {
    await deletePostFiles(post);
    await deleteDoc(doc(db, COL, id, "posts", post.id));
  }
  const notes = await loadStormNotes(id);
  for (const note of notes) {
    await deleteDoc(doc(db, COL, id, "notes", note.id));
  }
  await deleteDoc(doc(db, COL, id));
}

export function alarmLabel(level) {
  return { 1: "1 Alarm", 2: "2 Alarm", 3: "3 Alarm — Urgent" }[level] || "1 Alarm";
}

// ══════════════════════════════════════════════════════════════════════
// Posts: storms/{stormId}/posts/{postId}
// ══════════════════════════════════════════════════════════════════════
//
// A post is EITHER:
//   - one video (mediaType: "video", media: [{ url, path, sizeMB }])
//   - one-or-more graphics (mediaType: "graphic", media: [{ url, path, sizeMB }, ...])
// `media` is always an array for a uniform shape, even when it holds one item.

function postsCol(stormId) {
  return collection(db, COL, stormId, "posts");
}

// ── Notes thread (Sept 2026) ────────────────────────────────────────────
// storms/{stormId}/notes/{noteId} — an append-only running thread between
// the storm's creator ("originator") and whoever reviews/co-edits it
// ("reviewer": Admin/Manager/org admin/org-of-one). See firestore.rules
// for the write boundary; this file just reads/writes within it.
function notesCol(stormId) {
  return collection(db, COL, stormId, "notes");
}

export async function loadStormNotes(stormId) {
  const q = query(notesCol(stormId), orderBy("at", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// byRole: "originator" | "reviewer" — caller decides which side this
// viewer is on for THIS storm (see StormsHubPage.jsx's noteRoleFor()).
// Which side of the thread is this viewer on for THIS storm, if any?
// Mirrors the notes/{noteId} create rule's own author-eligibility check —
// broader than orgCoEditAccess() above on purpose: a note can be left at
// ANY stage (draft/pending_review/active), by the creator or by anyone
// who can review/co-edit this org's storms, not just while content edits
// are open. Returns null when this viewer has no standing to post here
// (can still read the thread — read is open to any signed-in member).
export function noteRoleFor(role, isOrgAdmin, uid, orgId, storm) {
  if (!storm) return null;
  if (storm.createdBy?.uid && uid && storm.createdBy.uid === uid) return "originator";
  if (canReview(role)) return "reviewer";
  if (orgId && storm.orgId === orgId && (isOrgAdmin || isOrgOfOneAccount(uid, orgId))) return "reviewer";
  return null;
}

export async function addStormNote(stormId, text, byRole) {
  const trimmed = (text || "").trim();
  if (!trimmed) return;
  const u = auth.currentUser;
  await addDoc(notesCol(stormId), {
    text: trimmed,
    byUid: u?.uid || null,
    byName: u?.displayName || u?.email || "Someone",
    byRole,
    at: serverTimestamp(),
  });
}

// updateStormNote (Sept 2026, round 3) — CONFIRMED gap closed: notes were
// write-once with no edit path at all (no client function, no rules
// allowance). Mirrors firestore.rules' notes/{noteId} update branch
// exactly: only the note's own author may call this on their own note id,
// and it only ever touches `text` + a new `editedAt` stamp — the
// author/role/original-timestamp fields are never part of this write, so
// there's nothing here that could let a caller reassign whose note it is.
export async function updateStormNote(stormId, noteId, text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return;
  await updateDoc(doc(db, COL, stormId, "notes", noteId), {
    text: trimmed,
    editedAt: serverTimestamp(),
  });
}

export async function loadPosts(stormId) {
  const q = query(postsCol(stormId), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Media upload ──────────────────────────────────────────────────────────
// onProgress(fraction 0-1) is optional, called repeatedly during upload.
export async function uploadPostMedia(stormId, postId, file, onProgress) {
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `storms/${stormId}/${postId}/${Date.now()}_${safeName}`;
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

async function deletePostFiles(post) {
  for (const m of post.media || []) {
    try { await deleteObject(ref(storage, m.path)); }
    catch (e) { /* file may already be gone — non-fatal, continue cleanup */ }
  }
}

// ── Create ──────────────────────────────────────────────────────────────
// `media` is the array already-uploaded via uploadPostMedia (call that
// per-file from the UI first, collect the results, then create the post
// doc with all of them at once).
export async function createPost(stormId, data) {
  const docRef = await addDoc(postsCol(stormId), {
    title: data.title || "",
    order: data.order ?? 0,
    mediaType: data.mediaType, // "video" | "graphic"
    media: data.media || [],  // [{ url, path, sizeMB, name }, ...]
    texts: PLATFORMS.reduce((acc, p) => ({ ...acc, [p.key]: data.texts?.[p.key] || "" }), {}),
    // Per-platform lock (Admin/Manager only, set from StormPostEditor). A
    // locked field hides its Rephrase button and shows a "Locked by staff"
    // tag to everyone else. Defaults to unlocked for every platform.
    lockedFields: PLATFORMS.reduce((acc, p) => ({ ...acc, [p.key]: !!data.lockedFields?.[p.key] }), {}),
    // Generation params (Handoff #22, option A) — only present when this
    // post arrived via Message Machine's Push-to-Storm, which is the only
    // place Mode/Audience/Voice/Tone exist today. Native Storms posts (via
    // StormPostEditor's own Generate/Rephrase) have no such concept, so
    // this is simply omitted for those — never fabricate a value.
    genParams: data.genParams || null,
    createdBy: currentUserStamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // Denormalized count on the parent storm doc, so storm list views can
  // show "N posts" without an extra read per storm.
  await updateDoc(doc(db, COL, stormId), { postCount: increment(1) }).catch(() => {});
  return docRef.id;
}

// Compact one-line summary of a post's generation params, for display on
// storm cards. Returns null if the post has none (native Storms posts, or
// posts pushed before this field existed) so callers can skip rendering
// entirely rather than showing an empty row.
//
// Deliberately Audience + Tone ONLY (not Mode or Voice) — this same
// function renders on the public, unauthenticated storm page via
// PostDisplayCard.jsx, not just the internal member view. Voice stores the
// full persona/prompt-engineering text (e.g. "Bro Code voice: casual —
// advice from a trusted buddy..."), which is proprietary messaging-design
// detail, not something meant for public display. Matches the fields
// already shown on Message Machine's saved-campaign library cards
// (audience + modifier/tone pills only, no mode or voice text).
export function formatGenParams(genParams) {
  if (!genParams) return null;
  const parts = [];
  if (genParams.audience) parts.push(`Audience: ${genParams.audience}`);
  if (genParams.tone) parts.push(`Tone: ${genParams.tone}`);
  return parts.length ? parts.join(" · ") : null;
}

export async function updatePost(stormId, postId, data) {
  await updateDoc(doc(db, COL, stormId, "posts", postId), { ...data, updatedAt: serverTimestamp() });
}

// Deletes the post doc AND its Storage files (all media items).
export async function deletePost(stormId, postId) {
  const snap = await getDoc(doc(db, COL, stormId, "posts", postId));
  if (snap.exists()) await deletePostFiles({ id: postId, ...snap.data() });
  await deleteDoc(doc(db, COL, stormId, "posts", postId));
  await updateDoc(doc(db, COL, stormId), { postCount: increment(-1) }).catch(() => {});
}

// One-off backfill for storms created before postCount existed: counts
// the actual posts and writes the number back so future loads are free.
export async function backfillPostCount(stormId) {
  const posts = await loadPosts(stormId);
  await updateDoc(doc(db, COL, stormId), { postCount: posts.length }).catch(() => {});
  return posts.length;
}

// Remove a single media item from a post (e.g. one graphic out of five)
// without deleting the whole post.
export async function removeMediaItem(stormId, postId, mediaItem) {
  try { await deleteObject(ref(storage, mediaItem.path)); } catch (e) { /* already gone, fine */ }
  const snap = await getDoc(doc(db, COL, stormId, "posts", postId));
  const current = snap.exists() ? (snap.data().media || []) : [];
  const next = current.filter(m => m.path !== mediaItem.path);
  await updateDoc(doc(db, COL, stormId, "posts", postId), { media: next, updatedAt: serverTimestamp() });
}
