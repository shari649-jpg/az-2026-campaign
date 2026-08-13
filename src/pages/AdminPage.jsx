import { useState, useEffect } from "react";
import { Inflate } from "fflate";
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, getDoc, setDoc, where, writeBatch, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminHeadshots from "./AdminHeadshots";

const GOLD       = "var(--gold)";
const TEAL       = "var(--teal)";
const TURQUOISE  = "var(--turquoise)";
const CHARCOAL   = "var(--charcoal)";
const RED        = "#c41e1e";
const TERRACOTTA = "var(--terracotta)";
const BG         = "var(--bg)";

const ROLE_OPTIONS = ["user", "manager", "administrator"];
const ROLE_COLORS  = {
  administrator: { bg: "#FFF8DC", color: TEAL,     border: GOLD },
  manager:       { bg: "#E6FAF7", color: TEAL,     border: TURQUOISE },
  user:          { bg: "#f5f5f5", color: CHARCOAL, border: "#ccc" },
};

const WAITLIST_STATUS_COLORS = {
  pending:    { bg: "#FFF8DC", color: "#8a6800", border: GOLD },
  invited:    { bg: "#E6FAF7", color: TEAL,      border: TURQUOISE },
  registered: { bg: "#f0f0f0", color: "#888",    border: "#ccc" },
  rejected:   { bg: "#fdf2f2", color: RED,        border: "#f5c6c6" },
};

// Mirrors netlify/functions/rateLimitHelper.mjs's LIMITS table — kept in sync
// by hand since one lives in the client bundle and the other in a Netlify
// function. Only used here to decide whether to show the same-day override
// control (Handoff #15, decision #9); the actual enforcement is server-side.
const DAILY_LIMITS = { administrator: 200, manager: 100, user: 50 };

function todayUTC() { return new Date().toISOString().slice(0, 10); }

// A user's override only counts on the day it was granted — matches
// rateLimitHelper.mjs treating dailyCalls/dailyCallsDate the same way, so
// the bump doesn't silently carry over and quietly raise tomorrow's limit too.
function overrideToday(u, today) {
  return u.dailyLimitOverrideDate === today ? (u.dailyLimitOverride || 0) : 0;
}
// Standing override — persistent, no date check. Mirrors
// rateLimitHelper.mjs's own standingRaw/standing calc.
function standingLimit(u) {
  const raw = Number(u.dailyLimitStanding);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}
function usedToday(u, today) {
  return u.dailyCallsDate === today ? (u.dailyCalls || 0) : 0;
}
function isAtDailyLimit(u) {
  const today = todayUTC();
  const limit = (DAILY_LIMITS[u.role] ?? DAILY_LIMITS.user) + standingLimit(u) + overrideToday(u, today);
  return usedToday(u, today) >= limit;
}

export default function AdminPage() {
  const { isManager, isAdmin, isOrgAdmin, user: currentUser, profile: currentProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab]   = useState("users"); // "users" | "waitlist"
  const [users, setUsers]           = useState([]);
  const [waitlist, setWaitlist]     = useState([]);
  const [loadingUsers, setLoadingUsers]     = useState(true);
  const [loadingWaitlist, setLoadingWaitlist] = useState(true);
  const [search, setSearch]         = useState("");
  const [saving, setSaving]         = useState(null);
  const [inviting, setInviting]     = useState(null); // waitlistId being invited
  const [confirmRemoveWaitlistId, setConfirmRemoveWaitlistId] = useState(null); // waitlistId pending remove confirmation
  const [removingWaitlistId, setRemovingWaitlistId] = useState(null); // waitlistId currently mid delete call
  const [showRegistered, setShowRegistered] = useState(false); // hide completed registrations by default
  // One org selection per pending org-track waitlist entry, keyed by
  // waitlistId — the Admin picks the real orgId here before an org-track
  // invite can be sent (see send-invite.mjs / provision-account.mjs).
  const [inviteOrgChoice, setInviteOrgChoice] = useState({});
  const [editingUid, setEditingUid] = useState(null); // uid currently in edit mode
  const [editForm, setEditForm]     = useState({ fullName: "", email: "", socials: [{ platform: "", handle: "" }], researchOrgIds: [], orgId: "", dailyLimitStanding: "", dailyLimitToday: "", orgAdmin: false });
  const [detailsUid, setDetailsUid] = useState(null); // uid currently shown in the read-only details modal
  const [actionUid, setActionUid]   = useState(null); // uid currently mid disable/enable/delete call
  const [actionError, setActionError] = useState(null); // { uid, message }
  const [resendingVerification, setResendingVerification] = useState(false); // bulk or single in flight
  const [verificationResult, setVerificationResult] = useState(null); // { sent, failed } from last run
  const [confirmDeleteUid, setConfirmDeleteUid] = useState(null); // uid pending delete confirmation
  const [cnFiles, setCnFiles]        = useState([]);
  const [cnParsing, setCnParsing]   = useState(false);
  const [cnPreview, setCnPreview]   = useState(null); // { count, totalR, totalD }
  const [cnParsed, setCnParsed]     = useState(null); // full parsed payload
  const [cnUploading, setCnUploading] = useState(false);
  const [cnDone, setCnDone]         = useState(false);
  const [notif, setNotif]           = useState(null);
  // Public Regenerate kill switch (Handoff #19/#22) — config/publicRegenerate.enabled
  // in Firestore, read by public-storm-regenerate.mjs on every request. No
  // deploy needed to flip it; loaded lazily only when the Settings tab opens.
  const [pubRegenEnabled, setPubRegenEnabled] = useState(true);
  const [pubRegenLoaded, setPubRegenLoaded] = useState(false);
  const [pubRegenSaving, setPubRegenSaving] = useState(false);
  // ── Orgs tab (August 2026, priority-list item #1 follow-up) ─────────────
  // orgs/{orgId} docs, loaded lazily the first time the Orgs tab opens —
  // same lazy-load pattern as pubRegenLoaded/fetchPubRegenSetting above.
  const [orgs, setOrgs]               = useState([]);
  const [orgsLoaded, setOrgsLoaded]   = useState(false);
  const [orgsLoading, setOrgsLoading] = useState(false);
  // Individual users each get their own real orgs/{uid} doc ("org of one",
  // Aug 2026) so the existing credit/rate-limit code works unmodified for
  // them too — but that means `orgs` now contains two very different
  // kinds of doc, and anywhere this app shows a picker of "which
  // organization" (research visibility, sending an org-track invite),
  // it should only ever offer real, multi-member coalitions, not a list
  // cluttered with every individual's personal org. `!== "individual"`
  // (not `=== "coalition"`) is deliberate — az-coalition and dem-cast
  // predate this field entirely and have no `kind` set, so a strict
  // equality check would incorrectly hide them; this fails open the same
  // way `active !== false` does elsewhere in this app.
  const coalitionOrgs = orgs.filter(o => o.kind !== "individual");
  const [addonSaving, setAddonSaving] = useState(null); // orgId currently mid addon-toggle call
  // One grant-form's worth of state per org row, keyed by orgId, so
  // multiple rows can have independent in-progress forms without
  // colliding. { [orgId]: { creditType, amount, reason, submitting } }
  const [grantForms, setGrantForms]   = useState({});
  // Per-org history (credit grants + billed transcription jobs) — lazy
  // loaded only when a card's history is expanded, keyed by orgId so
  // multiple cards can be open independently without re-fetching.
  const [historyOpenIds, setHistoryOpenIds] = useState(new Set());
  const [historyData, setHistoryData] = useState({}); // { [orgId]: { grants, jobs, loaded, loading } }
  // ── Candidates tab (August 2026) ─────────────────────────────────────
  // Bulk active/inactive toggle for candidates who've lost a primary —
  // pulled forward from the full future candidate CRUD panel because
  // primary nights (Aug 11, Aug 18, Sept 8, etc.) can eliminate 30+
  // candidates at once, and one-by-one Firestore Console deletion doesn't
  // scale to that and risks clicking the wrong doc. This never deletes —
  // it sets `active: false`, which query-candidates.mjs filters out of
  // default Research results. Fully reversible via "Mark Active" below.
  const [candidates, setCandidates]           = useState([]);
  const [candidatesLoaded, setCandidatesLoaded] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [showInactive, setShowInactive]       = useState(false);
  // State + Org filters (added per person's request, Aug 8 2026) — split
  // out of the free-text search entirely rather than kept inside it.
  // State codes are two letters, which caused real false-positive matches
  // when left in the same substring search as name/office/district (e.g.
  // searching "OR" matched anything containing "or" — Governor,
  // Corporation Commission, etc.) — an exact-match dropdown sidesteps that
  // class of bug rather than trying to special-case the free-text search.
  const [candidateStateFilter, setCandidateStateFilter] = useState(""); // "" = all states
  const [candidateOrgFilter, setCandidateOrgFilter]     = useState(""); // "" = all orgs
  const [selectedCandidateIds, setSelectedCandidateIds] = useState(new Set());
  const [candidatesSaving, setCandidatesSaving] = useState(false);
  // ── Candidate field editor (Block 5 item 4, Aug 2026) ────────────────
  // Full per-candidate edit modal — extends the existing active/inactive
  // bulk toggle above with the 17 fields that had NO in-app edit path at
  // all before this (Firestore Console only). editingCandidate holds the
  // full candidate object (for reference/id); candidateEditForm is the
  // working copy of just the editable fields, so Cancel can discard
  // changes without needing to re-fetch.
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [candidateEditForm, setCandidateEditForm] = useState({});
  const [candidateFieldSaving, setCandidateFieldSaving] = useState(false);
  // Which of the expandable long-text fields are currently expanded, per
  // person's request (Aug 8 2026) — a Set of field keys, reset each time
  // the modal opens on a different candidate so it doesn't carry over.
  const [expandedCandidateFields, setExpandedCandidateFields] = useState(new Set());

  // org-admin addition (August 2026): a plain org admin (not a Manager/
  // Administrator) is allowed onto this page too, but never reaches the
  // full tabbed UI below or its data fetches (candidates, waitlist, orgs,
  // settings) — see the early-return to <OrgAdminPanel /> further down.
  // Keeping the gate itself permissive and doing the real narrowing at
  // render time (rather than duplicating a second route/page) means the
  // org-admin surface can reuse this file's shared style constants and
  // AuthContext wiring without a second gate to keep in sync.
  useEffect(() => { if (!isManager && !isOrgAdmin) navigate("/"); }, [isManager, isOrgAdmin]);
  useEffect(() => { if (isManager) { fetchUsers(); fetchWaitlist(); } }, [isManager]);
  useEffect(() => { if (activeTab === "settings" && !pubRegenLoaded) fetchPubRegenSetting(); }, [activeTab]);
  useEffect(() => { if (activeTab === "orgs" && !orgsLoaded) fetchOrgs(); }, [activeTab]);
  useEffect(() => { if (activeTab === "candidates" && !candidatesLoaded) fetchCandidates(); }, [activeTab]);
  useEffect(() => { if (activeTab === "candidates" && !orgsLoaded && !orgsLoading) fetchOrgs(); }, [activeTab]);
  useEffect(() => { if (activeTab === "waitlist" && !orgsLoaded && !orgsLoading) fetchOrgs(); }, [activeTab]);
  // Research→Admin deep link (Aug 8 2026 addition) — CandidateQuery.jsx and
  // RaceComparison.jsx now link a candidate's name straight to
  // /admin?tab=candidates&edit=<id> for Managers/Admins, since that page is
  // used constantly to spot-check the database. This effect does the other
  // half: switches to the Candidates tab, waits for the candidate list to
  // actually load (it's fetched lazily, only once that tab is active — see
  // the effect above), then opens that one candidate's edit modal directly.
  // Clears the `edit` param either way once handled (found or not), so a
  // page refresh doesn't reopen it and a stale/bad id just silently no-ops
  // instead of getting stuck trying every render.
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "candidates" && activeTab !== "candidates") {
      setActiveTab("candidates");
      return; // re-run once activeTab updates and the candidates effect above fires
    }
    const editId = searchParams.get("edit");
    if (!editId) return;
    if (!candidatesLoaded) return; // wait for fetchCandidates to finish
    const target = candidates.find(c => c.id === editId);
    if (target) startEditCandidate(target);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [searchParams, activeTab, candidatesLoaded, candidates]);

  const fetchPubRegenSetting = async () => {
    try {
      const snap = await getDoc(doc(db, "config", "publicRegenerate"));
      setPubRegenEnabled(snap.exists() ? snap.data().enabled !== false : true);
    } catch { /* default stays true (enabled) if the doc can't be read */ }
    setPubRegenLoaded(true);
  };

  const togglePubRegen = async () => {
    setPubRegenSaving(true);
    try {
      const next = !pubRegenEnabled;
      await setDoc(doc(db, "config", "publicRegenerate"), { enabled: next }, { merge: true });
      setPubRegenEnabled(next);
      notify(next ? "Public Regenerate turned back on." : "Public Regenerate turned off.");
    } catch {
      notify("Couldn't update the setting — try again.", "err");
    }
    setPubRegenSaving(false);
  };

  const notify = (msg, type = "ok") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

  // ── Orgs tab ──────────────────────────────────────────────────────────
  const fetchOrgs = async () => {
    setOrgsLoading(true);
    try {
      const snap = await getDocs(collection(db, "orgs"));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      setOrgs(list);
      // Seed a blank grant-form entry for any org that doesn't have one yet
      // (first load, or a newly-seeded org since the last fetch).
      setGrantForms(prev => {
        const next = { ...prev };
        for (const o of list) {
          if (!next[o.id]) next[o.id] = { creditType: "generation", amount: "", reason: "", submitting: false };
        }
        return next;
      });
    } catch {
      notify("Failed to load orgs.", "err");
    }
    setOrgsLoading(false);
    setOrgsLoaded(true);
  };

  // ── Candidates tab ────────────────────────────────────────────────────
  const fetchCandidates = async () => {
    setCandidatesLoading(true);
    try {
      const snap = await getDocs(collection(db, "candidates"));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const officeCompare = (a.office || "").localeCompare(b.office || "");
        if (officeCompare !== 0) return officeCompare;
        return (a.name || "").localeCompare(b.name || "");
      });
      setCandidates(list);
    } catch {
      notify("Failed to load candidates.", "err");
    }
    setCandidatesLoading(false);
    setCandidatesLoaded(true);
  };

  const toggleCandidateSelected = (id) => {
    setSelectedCandidateIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bulk write via a single batch — matches firestore.rules' existing
  // candidates/{candidateId} rule (isManager() for create/update), so no
  // new rule or Netlify function is needed for this. Firestore batches cap
  // at 500 writes; a single primary night's losses will never come close.
  const setCandidatesActiveState = async (nextActive) => {
    if (selectedCandidateIds.size === 0) return;
    setCandidatesSaving(true);
    try {
      const batch = writeBatch(db);
      selectedCandidateIds.forEach(id => {
        batch.update(doc(db, "candidates", id), { active: nextActive });
      });
      await batch.commit();
      setCandidates(prev => prev.map(c =>
        selectedCandidateIds.has(c.id) ? { ...c, active: nextActive } : c
      ));
      notify(`${selectedCandidateIds.size} candidate${selectedCandidateIds.size !== 1 ? "s" : ""} marked ${nextActive ? "active" : "inactive"}.`);
      setSelectedCandidateIds(new Set());
    } catch {
      notify("Couldn't update those candidates — try again.", "err");
    }
    setCandidatesSaving(false);
  };

  // ── Candidate field editor ──────────────────────────────────────────
  // Every field the migration script (scripts/migrate-candidates-to-
  // firestore.mjs) writes, EXCEPT photo_filename (has its own dedicated
  // upload flow on the Headshots tab already — included here anyway as a
  // plain text override, since clearing a wrong value shouldn't require a
  // full re-upload) and focusOrgIds (its own dedicated toggle section
  // below, not a plain text field). Order matches roughly how a staffer
  // would actually fill these in: identity fields first, then the
  // longer research/messaging content.
  const CANDIDATE_EDIT_FIELDS = [
    { key: "name", label: "Name", type: "text" },
    { key: "office", label: "Office", type: "text" },
    { key: "party", label: "Party (D / R / other)", type: "text" },
    { key: "district", label: "District", type: "text" },
    { key: "level", label: "Level", type: "text" },
    { key: "state", label: "State", type: "text" },
    { key: "incumbentStatus", label: "Incumbent Status", type: "text" },
    { key: "wins", label: "Wins", type: "text" },
    { key: "campaignWebsite", label: "Campaign Website", type: "text" },
    { key: "ballotpediaUrl", label: "Ballotpedia URL", type: "text" },
    { key: "photoFilename", label: "Photo Filename (upload the actual file on the Headshots tab)", type: "text" },
    { key: "background", label: "Background", type: "textarea", expandable: true },
    { key: "recordAccomplishments", label: "Record & Accomplishments", type: "textarea", expandable: true },
    { key: "strengths", label: "Strengths", type: "textarea", expandable: true },
    { key: "vulnerabilities", label: "Vulnerabilities", type: "textarea", expandable: true },
    { key: "keyQuotes", label: "Key Quotes", type: "textarea", expandable: true },
    { key: "policyPlatform", label: "Policy Platform", type: "textarea", expandable: true },
    { key: "issueTags", label: "Issue Tags", type: "textarea", expandable: true },
    { key: "messagingHooks", label: "Messaging Hooks", type: "textarea" },
    { key: "endorsements", label: "Endorsements", type: "textarea" },
    { key: "fundraising", label: "Fundraising", type: "textarea" },
    { key: "opponent", label: "Opponent", type: "textarea" },
    { key: "opponentVulnerabilities", label: "Opponent Vulnerabilities", type: "textarea" },
    { key: "notes", label: "Notes", type: "textarea" },
  ];

  const startEditCandidate = (c) => {
    setEditingCandidate(c);
    const form = {};
    CANDIDATE_EDIT_FIELDS.forEach(f => { form[f.key] = c[f.key] || ""; });
    setCandidateEditForm(form);
    setExpandedCandidateFields(new Set());
    // focusOrgIds toggle section below needs the org list — same lazy-load
    // guard already used for the researchOrgIds section on the Users tab.
    if (!orgsLoaded && !orgsLoading) fetchOrgs();
  };

  const toggleExpandCandidateField = (key) => {
    setExpandedCandidateFields(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const cancelEditCandidate = () => { setEditingCandidate(null); setCandidateEditForm({}); };

  const updateCandidateField = (key, value) => {
    setCandidateEditForm(f => ({ ...f, [key]: value }));
  };

  const saveCandidateEdit = async () => {
    if (!editingCandidate) return;
    setCandidateFieldSaving(true);
    try {
      const payload = {};
      CANDIDATE_EDIT_FIELDS.forEach(f => { payload[f.key] = candidateEditForm[f.key]; });
      await updateDoc(doc(db, "candidates", editingCandidate.id), payload);
      setCandidates(prev => prev.map(c => c.id === editingCandidate.id ? { ...c, ...payload } : c));
      notify(`${payload.name || "Candidate"} updated.`);
      cancelEditCandidate();
    } catch {
      notify("Couldn't save that candidate — try again.", "err");
    }
    setCandidateFieldSaving(false);
  };

  // focusOrgIds toggle — matches firestore.rules' focusOrgIdsChangeIsOwnOrgOnly()
  // exactly: an Administrator can toggle any org's membership; a Manager
  // may ONLY toggle their OWN org (their org's checkbox is enabled, every
  // other org's is disabled) — enforced here in the UI, not just left to
  // fail server-side, per the Admin Manual's own stated principle
  // (Section 11.2: "anything the interface prevents should also be
  // independently verified server-side" — the inverse matters too: a
  // Manager shouldn't have to click something that was always going to be
  // rejected to find out it wasn't allowed).
  const canToggleFocusOrg = (orgId) => isAdmin || (isManager && currentProfile?.orgId === orgId);

  const toggleCandidateFocusOrg = async (candidate, orgId) => {
    if (!canToggleFocusOrg(orgId)) return;
    const current = Array.isArray(candidate.focusOrgIds) ? candidate.focusOrgIds : [];
    const next = current.includes(orgId) ? current.filter(id => id !== orgId) : [...current, orgId];
    try {
      await updateDoc(doc(db, "candidates", candidate.id), { focusOrgIds: next });
      setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, focusOrgIds: next } : c));
      if (editingCandidate?.id === candidate.id) setEditingCandidate(c => ({ ...c, focusOrgIds: next }));
    } catch {
      notify("Couldn't update org focus for that candidate — try again.", "err");
    }
  };

  // Direct client write — allowed for admins per firestore.rules'
  // `orgs/{orgId}` block (allow create, update, delete: if isAdmin()), same
  // pattern as togglePubRegen's direct setDoc above. No Netlify function
  // needed for a same-shape boolean flip like this one.
  const toggleOrgAddon = async (org) => {
    setAddonSaving(org.id);
    try {
      const next = !(org.addons?.sandboxTranscription);
      await updateDoc(doc(db, "orgs", org.id), { "addons.sandboxTranscription": next });
      setOrgs(prev => prev.map(o => o.id === org.id ? { ...o, addons: { ...o.addons, sandboxTranscription: next } } : o));
      notify(`${org.name || org.id}: Sandbox transcription ${next ? "enabled" : "disabled"}.`);
    } catch {
      notify("Couldn't update that org's addon — try again.", "err");
    }
    setAddonSaving(null);
  };

  const updateGrantForm = (orgId, patch) => {
    setGrantForms(prev => ({ ...prev, [orgId]: { ...prev[orgId], ...patch } }));
  };

  // Admin-granted comp credits (A.8). Deliberately NOT a direct client
  // Firestore write, even though isAdmin() could technically write
  // orgs/{orgId} directly — going through the Netlify function keeps the
  // balance increment and the creditGrants audit-trail entry atomic (one
  // function call, one server-side transaction) rather than two separate
  // client writes that could partially fail, and keeps the "who granted
  // this and why" record tamper-evident (server-set grantedBy from the
  // verified ID token, not a client-supplied field).
  const handleGrantCredits = async (org) => {
    const form = grantForms[org.id];
    const amount = Number(form?.amount);
    if (!form?.amount || !Number.isFinite(amount) || amount <= 0) {
      notify("Enter a positive credit amount first.", "err");
      return;
    }
    if (!form?.reason?.trim()) {
      notify("A reason is required for every grant — it's what shows up in the audit trail.", "err");
      return;
    }
    updateGrantForm(org.id, { submitting: true });
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch("/.netlify/functions/grant-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
        body: JSON.stringify({ orgId: org.id, creditType: form.creditType, amount, reason: form.reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Grant failed.");
      setOrgs(prev => prev.map(o => o.id === org.id ? { ...o, credits: data.credits } : o));
      updateGrantForm(org.id, { amount: "", reason: "", submitting: false });
      notify(`Granted ${amount} ${form.creditType} credit(s) to ${org.name || org.id}.`);
    } catch (err) {
      notify(err.message || "Couldn't grant credits — try again.", "err");
      updateGrantForm(org.id, { submitting: false });
    }
  };

  // Per-org history: creditGrants (subcollection, already scoped to this
  // org by path) and billed transcriptionJobs (top-level collection,
  // filtered client-side after a single-equality-filter fetch —
  // deliberately NOT combined with a second where() or an orderBy() in
  // the query itself, since either would require a Firestore composite
  // index to be created before this works. Sorting/filtering happens in
  // JS after the fetch instead, so this works immediately with zero
  // Firebase Console setup.
  const toggleHistory = async (orgId) => {
    setHistoryOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId); else next.add(orgId);
      return next;
    });

    if (historyData[orgId]?.loaded) return; // already fetched, just toggling visibility

    setHistoryData(prev => ({ ...prev, [orgId]: { grants: [], jobs: [], loaded: false, loading: true } }));
    try {
      const [grantsSnap, jobsSnap] = await Promise.all([
        getDocs(collection(db, "orgs", orgId, "creditGrants")),
        getDocs(query(collection(db, "transcriptionJobs"), where("orgId", "==", orgId))),
      ]);
      const grants = grantsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      const jobs = jobsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(j => j.billed) // unbilled/in-progress jobs aren't history yet
        .sort((a, b) => (b.billedAt?.seconds || 0) - (a.billedAt?.seconds || 0));
      setHistoryData(prev => ({ ...prev, [orgId]: { grants, jobs, loaded: true, loading: false } }));
    } catch {
      notify("Couldn't load history for that org.", "err");
      setHistoryData(prev => ({ ...prev, [orgId]: { grants: [], jobs: [], loaded: false, loading: false } }));
    }
  };

  function formatMinutesSeconds(totalSeconds) {
    if (!totalSeconds && totalSeconds !== 0) return "—";
    const m = Math.floor(totalSeconds / 60);
    const s = Math.round(totalSeconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const order = { administrator: 0, manager: 1, user: 2 };
      list.sort((a, b) => {
        const ro = (order[a.role] ?? 2) - (order[b.role] ?? 2);
        if (ro !== 0) return ro;
        return (a.fullName || a.email || "").localeCompare(b.fullName || b.email || "");
      });
      setUsers(list);
    } catch { notify("Failed to load users.", "err"); }
    setLoadingUsers(false);
  };

  const fetchWaitlist = async () => {
    setLoadingWaitlist(true);
    try {
      let snap;
      try {
        snap = await getDocs(query(collection(db, "waitlist"), orderBy("submittedAt", "desc")));
      } catch {
        snap = await getDocs(collection(db, "waitlist"));
      }
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
      setWaitlist(list);
    } catch (err) {
      console.error("Waitlist fetch error:", err);
      setWaitlist([]);
    }
    setLoadingWaitlist(false);
  };

  const handleRoleChange = async (uid, newRole) => {
    setSaving(uid);
    try {
      await updateDoc(doc(db, "users", uid), { role: newRole });
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, role: newRole } : u));
      notify("Role updated.");
    } catch { notify("Failed to update role.", "err"); }
    setSaving(null);
  };

  // Same-day rate-limit override (Handoff #15, decision #9). Adds to today's
  // override if one was already granted today, otherwise starts fresh —
  // either way it's scoped to today's date so it can't quietly persist.
  const handleAddOverride = async (uid, amount) => {
    setSaving(uid);
    try {
      const today = todayUTC();
      const u = users.find(x => x.id === uid);
      const nextOverride = overrideToday(u, today) + amount;
      await updateDoc(doc(db, "users", uid), { dailyLimitOverride: nextOverride, dailyLimitOverrideDate: today });
      setUsers(prev => prev.map(x => x.id === uid ? { ...x, dailyLimitOverride: nextOverride, dailyLimitOverrideDate: today } : x));
      notify(`+${amount} calls added for today.`);
    } catch { notify("Failed to add override.", "err"); }
    setSaving(null);
  };

  // ── Edit (name + social accounts) — pure Firestore, no server function needed ──
  const startEdit = (u) => {
    setEditingUid(u.id);
    const existing = (u.socialAccounts?.length ? u.socialAccounts : [u.primarySocial, u.secondarySocial].filter(Boolean))
      .filter(s => s && (s.platform || s.handle));
    setEditForm({
      fullName: u.fullName || "",
      email: u.email || "",
      socials: existing.length ? existing.map(s => ({ platform: s.platform || "", handle: s.handle || "" })) : [{ platform: "", handle: "" }],
      // researchOrgIds (Aug 2026 addition) — grants a user visibility into
      // more than one org's Research candidates via the "Viewing: [org] ▾"
      // switcher already built in CandidateQuery.jsx/RaceComparison.jsx.
      // The field and its read-side filtering have existed since Handoff
      // #32; this admin UI to actually SET it was the missing piece.
      researchOrgIds: Array.isArray(u.researchOrgIds) ? u.researchOrgIds : [],
      // orgId + dailyLimitStanding (August 2026 addition) — which org this
      // user actually belongs to (billing/credit-pool membership, distinct
      // from researchOrgIds above, which only affects Research visibility)
      // and their persistent daily-call-limit addition, if any. Both were
      // previously only settable via a direct Firestore edit or the
      // migration script; this is the missing Admin-panel UI for them.
      orgId: u.orgId || "",
      dailyLimitStanding: u.dailyLimitStanding ? String(u.dailyLimitStanding) : "",
      // Same-day override, editable directly here now (not just via the
      // "+N today" quick buttons, which only appear once a user is already
      // AT their limit). overrideToday() already handles the date check —
      // a stale prior-day value reads as 0/empty here, same as everywhere
      // else this field is used.
      dailyLimitToday: overrideToday(u, todayUTC()) ? String(overrideToday(u, todayUTC())) : "",
      // orgAdmin (August 2026, TODO #1) — grants the org-admin flag itself.
      // Deliberately gated Administrator-only in saveEdit below, same as
      // orgId/dailyLimitStanding — a Manager can see this checkbox but it's
      // disabled for them, matching the pattern already used for the org
      // fields above.
      orgAdmin: u.orgAdmin === true,
    });
    // The Orgs tab normally loads its org list lazily, only when that tab
    // is opened — but the researchOrgIds multi-select and the orgId picker
    // below both need the same org list regardless of which tab the admin
    // is currently on, so fetch it here too if it hasn't been loaded yet
    // this session.
    if (!orgsLoaded && !orgsLoading) fetchOrgs();
  };

  const cancelEdit = () => { setEditingUid(null); setEditForm({ fullName: "", email: "", socials: [{ platform: "", handle: "" }], researchOrgIds: [], orgId: "", dailyLimitStanding: "", dailyLimitToday: "", orgAdmin: false }); };

  const updateSocialField = (i, field, value) => {
    setEditForm(f => ({ ...f, socials: f.socials.map((s, idx) => idx === i ? { ...s, [field]: value } : s) }));
  };
  const addSocialField = () => {
    setEditForm(f => ({ ...f, socials: [...f.socials, { platform: "", handle: "" }] }));
  };
  const removeSocialField = (i) => {
    setEditForm(f => ({ ...f, socials: f.socials.filter((_, idx) => idx !== i) }));
  };
  const toggleResearchOrgId = (orgId) => {
    setEditForm(f => ({
      ...f,
      researchOrgIds: f.researchOrgIds.includes(orgId)
        ? f.researchOrgIds.filter(id => id !== orgId)
        : [...f.researchOrgIds, orgId],
    }));
  };

  const saveEdit = async (uid) => {
    setSaving(uid);
    try {
      const cleaned = editForm.socials
        .map(s => ({ platform: s.platform.trim(), handle: s.handle.trim() }))
        .filter(s => s.platform || s.handle);
      const socialAccounts = cleaned.length ? cleaned : [];
      const primarySocial = socialAccounts[0] || { platform: "", handle: "" };
      const payload = {
        fullName: editForm.fullName.trim(),
        socialAccounts,
        primarySocial,
        // researchOrgIds (Aug 2026 addition) — always written as a real
        // array, even when empty, rather than omitted — an admin
        // deliberately clearing every checkbox should actually clear the
        // field, not leave a stale array sitting on the doc from before.
        researchOrgIds: editForm.researchOrgIds,
      };
      // Keep legacy secondarySocial in sync for any older display code that still reads it.
      if (socialAccounts[1]) payload.secondarySocial = socialAccounts[1];

      // Single lookup, reused below for org/limit fields and for the email
      // comparison further down.
      const originalUser = users.find(u => u.id === uid);

      // orgId + dailyLimitStanding (August 2026 addition) — Administrator
      // only (firestore.rules protects both on the owner-edit path, and the
      // form fields themselves are disabled for a non-admin — this is a
      // second check, not the only one). Only included in the write when
      // they actually changed, so every ordinary name/social edit doesn't
      // also re-write org membership or the standing limit as a no-op.
      if (isAdmin) {
        const nextOrgId = editForm.orgId.trim();
        if (nextOrgId !== (originalUser?.orgId || "")) {
          // Empty selection clears org membership entirely (moves the user
          // off any shared credit pool) — deliberate, not a default we want
          // to silently skip, so this always writes a real value; an empty
          // string reads the same as unset everywhere this app checks
          // `data.orgId || null`, so deleteField() isn't needed here.
          payload.orgId = nextOrgId || "";
        }
        const nextStanding = editForm.dailyLimitStanding.trim() === "" ? 0 : Number(editForm.dailyLimitStanding);
        const prevStanding = Number(originalUser?.dailyLimitStanding) || 0;
        if (Number.isFinite(nextStanding) && nextStanding >= 0 && nextStanding !== prevStanding) {
          payload.dailyLimitStanding = nextStanding;
        }
        // Same-day override, settable directly here now — writes the exact
        // same two fields (dailyLimitOverride, dailyLimitOverrideDate) the
        // "+N today" quick buttons and rateLimitHelper.mjs already use, so
        // this is a second way to reach an existing mechanism, not a new
        // one. Only writes when it actually changed from what's in effect
        // right now (today() only — a stale prior-day value doesn't count
        // as "unchanged from 0", matching overrideToday()'s own logic).
        const today = todayUTC();
        const nextToday = editForm.dailyLimitToday.trim() === "" ? 0 : Number(editForm.dailyLimitToday);
        const prevToday = overrideToday(originalUser || {}, today);
        if (Number.isFinite(nextToday) && nextToday >= 0 && nextToday !== prevToday) {
          payload.dailyLimitOverride = nextToday;
          payload.dailyLimitOverrideDate = today;
        }
        // orgAdmin (August 2026, TODO #1) — grants/revokes the flag itself.
        // Only meaningful when the target actually has an orgId; not
        // enforced here (a flag with no org just does nothing, per
        // isOrgAdmin()'s own scoped-update checks all requiring a real
        // orgId match), but worth knowing if this looks like a no-op after
        // saving.
        const nextOrgAdmin = !!editForm.orgAdmin;
        if (nextOrgAdmin !== (originalUser?.orgAdmin === true)) {
          payload.orgAdmin = nextOrgAdmin;
        }
      }

      await updateDoc(doc(db, "users", uid), payload);

      // Email lives in Firebase Auth, not just Firestore — changing it
      // requires the Admin SDK (a signed-in client can only ever change
      // ITS OWN email, never another account's), so this goes through
      // manage-user.mjs rather than a direct Firestore write. Only fires
      // if the email field was actually changed in this edit. Added
      // July 2026, Priority 5 cleanup.
      const newEmail = editForm.email.trim().toLowerCase();
      let emailUpdated = false;
      if (newEmail && originalUser && newEmail !== (originalUser.email || "").toLowerCase()) {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch("/.netlify/functions/manage-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, action: "update_email", targetUid: uid, newEmail }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Failed to update email.");
        payload.email = newEmail;
        payload.emailVerified = false;
        emailUpdated = true;
      }

      setUsers(prev => prev.map(u => u.id === uid ? { ...u, ...payload } : u));
      notify(emailUpdated ? "Profile updated — new email will need to be re-verified." : "Profile updated.");
      cancelEdit();
    } catch (err) { notify(err.message || "Failed to save changes.", "err"); }
    setSaving(null);
  };

  // ── Disable / Enable / Delete — server-side, requires Firebase Admin SDK ──
  const callManageUser = async (targetUid, action) => {
    setActionUid(targetUid);
    setActionError(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/.netlify/functions/manage-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, action, targetUid }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Action failed.");
      }
      if (action === "delete") {
        setUsers(prev => prev.filter(u => u.id !== targetUid));
        notify("User deleted.");
      } else {
        setUsers(prev => prev.map(u => u.id === targetUid ? { ...u, disabled: action === "disable" } : u));
        notify(action === "disable" ? "User disabled — they can no longer sign in." : "User re-enabled.");
      }
    } catch (err) {
      setActionError({ uid: targetUid, message: err.message || "Action failed. Please try again." });
      notify(err.message || "Action failed.", "err");
    } finally {
      setActionUid(null);
      setConfirmDeleteUid(null);
    }
  };

  // ── Export registered users to CSV ──────────────────────────────────────
  const exportUsersCSV = (userList) => {
    // Determine max number of social accounts across all users so we know
    // how many platform/handle column pairs to create.
    const maxSocials = Math.max(1, ...userList.map(u => {
      const s = u.socialAccounts?.length
        ? u.socialAccounts
        : [u.primarySocial, u.secondarySocial].filter(Boolean);
      return s.filter(x => x && (x.platform || x.handle)).length;
    }));

    const socialHeaders = Array.from({ length: maxSocials }, (_, i) =>
      i === 0 ? ["Platform", "Handle"] : [`Platform ${i + 1}`, `Handle ${i + 1}`]
    ).flat();

    const headers = [
      "Full Name", "Email", "Role", "Organization",
      "Email Verified", "Sign-in Method", "Disabled",
      "Joined", "User ID",
      ...socialHeaders,
    ];

    const rows = userList.map(u => {
      const socials = (u.socialAccounts?.length
        ? u.socialAccounts
        : [u.primarySocial, u.secondarySocial].filter(Boolean)
      ).filter(s => s && (s.platform || s.handle));

      const socialCells = Array.from({ length: maxSocials }, (_, i) => [
        socials[i]?.platform || "",
        socials[i]?.handle   || "",
      ]).flat();

      const joined = u.createdAt
        ? (u.createdAt?.toDate ? u.createdAt.toDate() : new Date(u.createdAt?.seconds ? u.createdAt.seconds * 1000 : u.createdAt))
            .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "";

      return [
        u.fullName     || "",
        u.email        || "",
        u.role         || "user",
        u.organization || "",
        u.googleSignIn         ? "Yes (Google)" :
          u.emailVerified === true  ? "Yes" :
          u.emailVerified === false ? "No"  : "",
        u.googleSignIn ? "Google" : "Email / password",
        u.disabled ? "Yes" : "No",
        joined,
        u.id           || "",
        ...socialCells,
      ];
    });

    // Escape a CSV cell value — wrap in quotes if it contains commas, quotes,
    // or newlines; double up any internal quotes per RFC 4180.
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csv = [headers, ...rows].map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `az-coalition-users-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  // Unlike disable/enable/delete, this calls a dedicated function since it
  // needs the Admin SDK's generateEmailVerificationLink(), not anything
  // manage-user.mjs already does.
  const resendVerification = async (uids) => {
    setResendingVerification(true);
    setVerificationResult(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/.netlify/functions/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, uids }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to resend verification emails.");
      }
      setVerificationResult({ sent: data.sent, failed: data.failed, results: data.results });
      notify(
        data.failed > 0
          ? `Sent ${data.sent} verification email${data.sent === 1 ? "" : "s"}, ${data.failed} failed.`
          : `Sent ${data.sent} verification email${data.sent === 1 ? "" : "s"}.`,
        data.failed > 0 ? "err" : "ok"
      );
    } catch (err) {
      notify(err.message || "Failed to resend verification emails.", "err");
    }
    setResendingVerification(false);
  };

  const handleSendInvite = async (entry) => {
    // Org-track entries need a real orgId chosen first — resolved by the
    // Admin from the free-text `organization` field, after actually
    // confirming with that org (see WaitlistPage.jsx / this file's header
    // note on inviteOrgChoice). Never inferred automatically.
    const accountType = entry.accountType === "org" ? "org" : "individual";
    const chosenOrgId = inviteOrgChoice[entry.id];
    if (accountType === "org" && !chosenOrgId) {
      notify("Pick which organization to add them to before sending the invite.", "err");
      return;
    }

    setInviting(entry.id);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/.netlify/functions/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          waitlistId: entry.id,
          email:      entry.email,
          fullName:   entry.fullName,
          accountType,
          ...(accountType === "org" ? { orgId: chosenOrgId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify("Failed to send invite. Try again.", "err");
      } else {
        // Update Firestore waitlist entry client-side
        try {
          await updateDoc(doc(db, "waitlist", entry.id), {
            status: "invited",
            invitedAt: new Date(),
          });
        } catch (e) {
          console.warn("Waitlist status update failed:", e.message);
        }
        setWaitlist(prev => prev.map(w => w.id === entry.id ? { ...w, status: "invited", invitedAt: new Date() } : w));
        notify(`Invite sent to ${entry.email}!`);
      }
    } catch { notify("Failed to send invite. Try again.", "err"); }
    setInviting(null);
  };

  // Removes a waitlist entry entirely — e.g. a test signup, or someone who
  // asked to withdraw their request. Client-side deleteDoc, same trust model
  // as the updateDoc call in handleSendInvite above (Firestore rules already
  // gate waitlist writes to admins). If this ever comes back with a
  // permission-denied error, the waitlist rule needs an explicit delete grant
  // alongside its existing update grant.
  const handleRemoveWaitlistEntry = async (entry) => {
    setRemovingWaitlistId(entry.id);
    try {
      await deleteDoc(doc(db, "waitlist", entry.id));
      setWaitlist(prev => prev.filter(w => w.id !== entry.id));
      notify(`Removed ${entry.email} from the waitlist.`);
    } catch (err) {
      notify(err.message || "Failed to remove entry. Try again.", "err");
    }
    setRemovingWaitlistId(null);
    setConfirmRemoveWaitlistId(null);
  };

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return !q ||
      (u.fullName || "").toLowerCase().includes(q) ||
      (u.email    || "").toLowerCase().includes(q) ||
      (u.role     || "").toLowerCase().includes(q);
  });

  const filteredWaitlist = waitlist.filter(w => {
    if (!showRegistered && w.status === "registered") return false;
    const q = search.toLowerCase();
    return !q ||
      (w.fullName     || "").toLowerCase().includes(q) ||
      (w.email        || "").toLowerCase().includes(q) ||
      (w.organization || "").toLowerCase().includes(q) ||
      (w.status       || "").toLowerCase().includes(q);
  });

  const counts = {
    total:          users.length,
    administrators: users.filter(u => u.role === "administrator").length,
    managers:       users.filter(u => u.role === "manager").length,
    members:        users.filter(u => u.role === "user" || !u.role).length,
    pending:        waitlist.filter(w => w.status === "pending").length,
    invited:        waitlist.filter(w => w.status === "invited").length,
    registered:     waitlist.filter(w => w.status === "registered").length,
  };

  function formatDate(ts) {
    try {
      if (!ts) return "";
      const d = ts?.toDate ? ts.toDate()
        : ts instanceof Date ? ts
        : typeof ts === "number" ? new Date(ts)
        : ts?.seconds ? new Date(ts.seconds * 1000)
        : new Date(ts);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return ""; }
  }

  // ── Community Notes TSV parsing (mirrors server-side logic) ──────────────
  const REP_KEYWORDS = ["republican","gop","trump","maga","desantis","rubio","lake","masters","hamadeh","finchem","conservative","right-wing","right wing","america first","2nd amendment","second amendment","border wall","illegal alien","critical race","deep state","election fraud","stolen election","patriot","woke","socialist","defund police","antifa","hunter biden","liberal","leftist"];
  const DEM_KEYWORDS = ["democrat","democratic","biden","harris","obama","pelosi","schumer","gallego","stanton","progressive","left-wing","left wing","abortion ban","roe","medicaid","social security cut","obamacare","aca","minimum wage","lgbtq ban","book ban","voter suppression","gerrymandering","insurrection","january 6","disinformation","dark money"];
  const NARRATIVE_PATTERNS = [
    { label: "Election Integrity Claims",  keywords: ["election","ballot","vote","fraud","rigged","stolen","mail-in","dominion"] },
    { label: "Immigration Misinformation", keywords: ["border","migrant","illegal","invasion","caravan","fentanyl","trafficking"] },
    { label: "Economic Falsehoods",        keywords: ["inflation","economy","recession","gas price","unemploy","tax","deficit"] },
    { label: "Health & Science Denial",    keywords: ["vaccine","covid","climate","fauci","mask","hydroxychloroquine","ivermectin"] },
    { label: "Crime & Safety Distortions", keywords: ["crime","murder","violent","defund","police","criminal"] },
    { label: "Identity & Social Issues",   keywords: ["transgender","gender","groomer","woke","crt","critical race","lgbtq","drag"] },
  ];

  function classifyText(text) {
    const lower = text.toLowerCase();
    const r = REP_KEYWORDS.filter(k => lower.includes(k)).length;
    const d = DEM_KEYWORDS.filter(k => lower.includes(k)).length;
    if (!r && !d) return null;
    if (r > d) return "R";
    if (d > r) return "D";
    return "both";
  }

  function detectNarratives(text) {
    const lower = text.toLowerCase();
    return NARRATIVE_PATTERNS.filter(p => p.keywords.some(k => lower.includes(k))).map(p => p.label);
  }

  function weekLabel(millis) {
    const d = new Date(millis);
    const wk = new Date(d);
    wk.setDate(d.getDate() - d.getDay());
    return `${wk.getMonth() + 1}/${wk.getDate()}`;
  }

  function formatMillisDate(millis) {
    if (!millis) return "";
    const d = new Date(millis);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function parseTSV(raw) {
    const lines = raw.split("\n").filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split("\t");
    const idx = {
      noteId:    headers.indexOf("noteId"),
      summary:   headers.indexOf("summary"),
      createdAt: headers.indexOf("createdAtMillis"),
    };
    if (idx.summary === -1) return [];
    const notes = [];
    const limit = Math.min(lines.length, 10001);
    for (let i = 1; i < limit; i++) {
      const cols    = lines[i].split("\t");
      const summary = (cols[idx.summary] || "").trim();
      if (!summary) continue;
      const side = classifyText(summary);
      if (!side) continue;
      const millis  = Math.round(parseFloat(cols[idx.createdAt])) || 0;
      const date    = millis ? new Date(millis).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
      const weekLbl = millis ? weekLabel(millis) : "Unknown";
      notes.push({
        noteId: cols[idx.noteId] || String(i),
        summary, side, date, weekLbl,
        narratives: detectNarratives(summary),
      });
    }
    return notes;
  }

  function buildStats(notes) {
    const wkMap = {};   // key: weekStartMillis (Sunday), value: { label, r, d, millis }
    let totalR = 0, totalD = 0;
    const repNar = {}, demNar = {};
    notes.forEach(n => {
      const millis = n.millis || 0;
      // Get Sunday of the week as the key (milliseconds)
      const d = new Date(millis);
      const dayOfWeek = d.getUTCDay(); // 0 = Sunday
      const weekStart = new Date(millis - dayOfWeek * 86400000);
      weekStart.setUTCHours(0, 0, 0, 0);
      const wkKey = weekStart.getTime();
      const wkLabel = `${weekStart.getUTCMonth() + 1}/${weekStart.getUTCDate()}/${String(weekStart.getUTCFullYear()).slice(2)}`;
      if (!wkMap[wkKey]) wkMap[wkKey] = { label: wkLabel, r: 0, d: 0, millis: wkKey };
      if (n.side === "R" || n.side === "both") { wkMap[wkKey].r++; totalR++; }
      if (n.side === "D" || n.side === "both") { wkMap[wkKey].d++; totalD++; }
      n.narratives.forEach(nar => {
        if (n.side === "R" || n.side === "both") repNar[nar] = (repNar[nar] || 0) + 1;
        if (n.side === "D" || n.side === "both") demNar[nar] = (demNar[nar] || 0) + 1;
      });
    });
    // Sort by actual timestamp, take the 8 most recent weeks
    const weeklyData = Object.values(wkMap)
      .sort((a, b) => a.millis - b.millis)
      .slice(-8)
      .map(({ label, r, d }) => ({ label, r, d })); // strip millis from output
    return { weeklyData, totalR, totalD, repNar, demNar };
  }

  async function streamClassifyZip(file, notes, isFirstFile) {
    // True streaming decompression — never holds full content in memory
    // ZIP format: we need to find the local file header and skip it,
    // then stream-decompress the deflate stream using fflate Inflate.
    return new Promise((resolve, reject) => {
      const CHUNK = 1024 * 1024; // 1MB read chunks
      const decoder = new TextDecoder("utf-8");
      const headers = {};
      let headerSkipped = !isFirstFile;
      let leftover = "";
      let inflate = null;
      let dataStartOffset = -1;
      let bytesRead = 0;
      const fileSize = file.size;

      function processTextChunk(chunk) {
        const lines = (leftover + chunk).split("\n");
        leftover = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          if (!headerSkipped && Object.keys(headers).length === 0) {
            const cols = line.split("\t");
            headers.noteId    = cols.indexOf("noteId");
            headers.summary   = cols.indexOf("summary");
            headers.createdAt = cols.indexOf("createdAtMillis");
            headerSkipped = true;
            continue;
          }
          if (!headerSkipped) { headerSkipped = true; continue; }
          if (headers.summary === undefined || headers.summary === -1) continue;
          const cols    = line.split("\t");
          const summary = (cols[headers.summary] || "").trim();
          if (!summary) continue;
          const side = classifyText(summary);
          if (!side) continue;
          const millis = Math.round(parseFloat(cols[headers.createdAt])) || 0;
          notes.push({
            noteId: cols[headers.noteId] || String(notes.length),
            summary, side,
            date: millis ? new Date(millis).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
            weekLbl: millis ? weekLabel(millis) : "Unknown",
            narratives: detectNarratives(summary),
            millis,
          });
        }
      }

      function findLocalFileData(buf) {
        // ZIP local file header: PK\x03\x04, skip to find compressed data
        // Local file header structure:
        // 4 signature + 2 version + 2 flags + 2 compression + 2 modtime + 2 moddate
        // + 4 crc + 4 compressed + 4 uncompressed + 2 filename_len + 2 extra_len
        // = 30 bytes + filename_len + extra_len
        const sig = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        for (let i = 0; i < buf.length - 30; i++) {
          if (buf[i] === sig[0] && buf[i+1] === sig[1] && buf[i+2] === sig[2] && buf[i+3] === sig[3]) {
            const fnLen    = buf[i+26] | (buf[i+27] << 8);
            const extraLen = buf[i+28] | (buf[i+29] << 8);
            return i + 30 + fnLen + extraLen;
          }
        }
        return -1;
      }

      const reader = file.stream().getReader();
      let headerBuf = new Uint8Array(0);
      let headerFound = false;

      inflate = new Inflate((data, final) => {
        const text = decoder.decode(data, { stream: !final });
        processTextChunk(text);
        if (final) resolve();
      });

      function pump() {
        reader.read().then(({ done, value }) => {
          if (done) {
            // Flush remaining leftover
            if (leftover.trim()) processTextChunk("\n");
            resolve();
            return;
          }

          if (!headerFound) {
            // Accumulate enough bytes to find the local file header
            const combined = new Uint8Array(headerBuf.length + value.length);
            combined.set(headerBuf);
            combined.set(value, headerBuf.length);
            headerBuf = combined;

            const offset = findLocalFileData(headerBuf);
            if (offset !== -1) {
              headerFound = true;
              const rest = headerBuf.slice(offset);
              if (rest.length > 0) inflate.push(rest, false);
            }
          } else {
            inflate.push(value, false);
          }
          pump();
        }).catch(reject);
      }
      pump();
    });
  }

  async function streamClassifyTsv(file, notes, isFirstFile) {
    const reader = file.stream().getReader();
    const decoder = new TextDecoder("utf-8");
    const headers = {};
    let leftover = "";
    let headerSkipped = !isFirstFile;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = (leftover + chunk).split("\n");
      leftover = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        if (!headerSkipped && Object.keys(headers).length === 0) {
          const cols = line.split("\t");
          headers.noteId    = cols.indexOf("noteId");
          headers.summary   = cols.indexOf("summary");
          headers.createdAt = cols.indexOf("createdAtMillis");
          headerSkipped = true;
          continue;
        }
        if (!headerSkipped) { headerSkipped = true; continue; }
        if (headers.summary === undefined || headers.summary === -1) continue;
        const cols    = line.split("\t");
        const summary = (cols[headers.summary] || "").trim();
        if (!summary) continue;
        const side = classifyText(summary);
        if (!side) continue;
        const millis = Math.round(parseFloat(cols[headers.createdAt])) || 0;
        notes.push({
          noteId: cols[headers.noteId] || String(notes.length),
          summary, side,
          date: millis ? new Date(millis).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
          weekLbl: millis ? weekLabel(millis) : "Unknown",
          narratives: detectNarratives(summary),
          millis,
        });
      }
    }
  }

  async function handleCnFile(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    // Sort: largest file first (that's file 1, which has almost all the data)
    const sorted = [...files].sort((a, b) => b.size - a.size);
    setCnFiles(sorted);
    setCnPreview(null);
    setCnParsed(null);
    setCnDone(false);
    setCnParsing(true);
    try {
      const allNotes = [];
      for (let i = 0; i < sorted.length; i++) {
        const file = sorted[i];
        if (file.name.endsWith(".zip")) {
          await streamClassifyZip(file, allNotes, i === 0);
        } else {
          await streamClassifyTsv(file, allNotes, i === 0);
        }
      }
      if (allNotes.length === 0) {
        notify("No political notes found. Make sure you selected Notes data files.", "err");
        setCnParsing(false);
        return;
      }
      const stats = buildStats(allNotes);
      setCnPreview({ count: allNotes.length, totalR: stats.totalR, totalD: stats.totalD });
      setCnParsed({ notes: allNotes, stats, count: allNotes.length });
    } catch (err) {
      notify("Failed to parse files: " + err.message, "err");
    }
    setCnParsing(false);
  }

  async function handleCnUpload() {
    if (!cnParsed) return;
    setCnUploading(true);
    try {
      // Stats calculated from ALL notes (full accuracy).
      // Display cards: 500 most recent notes for the card feed.
      // Weekly chart data: built from the stats which cover all notes.
      const notes = cnParsed.notes;

      // Sort by recency for display cards
      const sorted = [...notes].sort((a, b) => (b.millis || 0) - (a.millis || 0));
      const displayNotes = sorted.slice(0, 500);

      // Trim each note to essential fields
      const trimmedNotes = displayNotes.map(n => ({
        noteId:     n.noteId,
        summary:    n.summary,
        side:       n.side,
        date:       n.date,
        weekLbl:    n.weekLbl,
        narratives: n.narratives,
      }));

      const idToken = await auth.currentUser.getIdToken();
      const payload = JSON.stringify({
        idToken,
        notes: trimmedNotes,
        stats: cnParsed.stats,
        count: cnParsed.count,
        uploadedAt: new Date().toISOString(),
      });

      console.log(`[upload] Payload size: ${(payload.length / 1024 / 1024).toFixed(2)}MB`);

      const res = await fetch("/.netlify/functions/upload-community-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        notify("Upload failed. Try again.", "err");
      } else {
        setCnDone(true);
        notify(`✓ ${data.count.toLocaleString()} notes uploaded to dashboard!`);
      }
    } catch (err) {
      notify("Upload failed: " + err.message, "err");
    }
    setCnUploading(false);
  }

  if (!isManager && !isOrgAdmin) return null;

  // org-admin addition (August 2026): early return before any of the
  // Manager/Administrator tabbed UI below — an org admin gets a
  // self-contained, deliberately much smaller panel (own-org members,
  // invite, disable/enable) rather than a cut-down version of this giant
  // component. Keeps the org-admin surface easy to reason about/audit on
  // its own, and means nothing below this line needs an isOrgAdmin check
  // scattered through it — everything below is still exactly what it was,
  // reachable only by a real Manager or Administrator.
  if (isOrgAdmin && !isManager) return <OrgAdminPanel />;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f6", fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: CHARCOAL }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap'); @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>

      {notif && (
        <div style={{ position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)", zIndex: 100, padding: "14px 28px", borderRadius: 10, fontSize: 17, fontWeight: 700, background: notif.type === "err" ? RED : TEAL, color: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.25)", whiteSpace: "nowrap", animation: "fadeUp 0.2s ease" }}>
          {notif.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ background: TEAL, borderBottom: `4px solid ${GOLD}`, padding: "32px 24px 28px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, marginBottom: 8 }}>Coalition Comms Hub · Admin</div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: "#fff", marginBottom: 8 }}>User Management</h1>
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.8)", marginBottom: 20 }}>
            Manage registered users and review access requests.
          </p>

          {/* Stats */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              { label: "Total Users",    value: counts.total,          color: "#fff" },
              { label: "Administrators", value: counts.administrators, color: GOLD },
              { label: "Managers",       value: counts.managers,       color: TURQUOISE },
              { label: "Members",        value: counts.members,        color: "rgba(255,255,255,0.7)" },
              { label: "Pending",        value: counts.pending,        color: TERRACOTTA },
              { label: "Invited",        value: counts.invited,        color: TURQUOISE },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "10px 18px", minWidth: 80, textAlign: "center" }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.65)", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px" }}>

        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, marginBottom: 24, borderBottom: `2px solid #ddd`, paddingBottom: 0 }}>
          <div style={{ display: "flex", gap: 4, flex: 1 }}>
          {[
            { id: "users",    label: `Registered Users (${counts.total})` },
            { id: "waitlist", label: `Waitlist (${waitlist.length - counts.registered})${counts.pending > 0 ? ` · ${counts.pending} pending` : ""}` },
          { id: "community-notes", label: "Community Notes Upload" },
          { id: "headshots", label: "Candidate Headshots" },
          { id: "settings", label: "Settings" },
          { id: "orgs", label: "Orgs" },
          { id: "candidates", label: "Candidates" },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSearch(""); }}
              style={{
                padding: "10px 20px", fontSize: 15, fontWeight: 700, fontFamily: "inherit",
                border: "none", borderBottom: activeTab === tab.id ? `3px solid ${TEAL}` : "3px solid transparent",
                background: "none", color: activeTab === tab.id ? TEAL : "#888",
                cursor: "pointer", marginBottom: -2, transition: "color 0.15s",
              }}>
              {tab.label}
            </button>
          ))}
          </div>
          {activeTab === "users" && (
            <button
              onClick={() => exportUsersCSV(users)}
              title="Download all registered users as a CSV file"
              style={{
                marginBottom: 4, padding: "7px 14px", fontSize: 12, fontWeight: 700,
                fontFamily: "inherit", background: "none", border: `1.5px solid ${TEAL}`,
                borderRadius: 7, color: TEAL, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              ⬇ Export CSV
            </button>
          )}
        </div>

        {/* Search */}
        {activeTab !== "headshots" && activeTab !== "orgs" && activeTab !== "candidates" && (
          <input
            type="search"
            placeholder={activeTab === "users" ? "Search by name, email, or role…" : "Search by name, email, or organization…"}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "13px 18px", fontSize: 16, border: "2px solid #ccc", borderRadius: 10, marginBottom: 24, fontFamily: "inherit", color: CHARCOAL, background: BG }}
          />
        )}

        {/* ── HEADSHOTS TAB ── */}
        {activeTab === "headshots" && <AdminHeadshots />}

        {/* ── USERS TAB ── */}
        {activeTab === "users" && (
          <>
            {loadingUsers && <p style={{ textAlign: "center", padding: "60px 0", color: CHARCOAL }}>Loading users…</p>}
            {!loadingUsers && filteredUsers.length === 0 && (
              <p style={{ textAlign: "center", padding: "60px 0", color: "#888" }}>No users found.</p>
            )}
            {!loadingUsers && (() => {
              const unverified = filteredUsers.filter(u => u.emailVerified === false && !u.disabled);
              if (unverified.length === 0) return null;
              const failures = verificationResult?.results?.filter(r => !r.success) || [];
              return (
                <div style={{
                  background: "var(--gold-light)", border: `1.5px solid ${GOLD}`, borderRadius: 10,
                  padding: "14px 20px", marginBottom: 16, fontSize: 14, color: CHARCOAL,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <span>
                      📬 <strong>{unverified.length}</strong> user{unverified.length === 1 ? "" : "s"} {unverified.length === 1 ? "hasn't" : "haven't"} verified their email yet — they can't sign in until they do.
                    </span>
                    <button
                      onClick={() => resendVerification(unverified.map(u => u.id))}
                      disabled={resendingVerification}
                      style={{
                        background: TEAL, color: "#fff", border: "none", borderRadius: 8,
                        padding: "8px 18px", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                        cursor: resendingVerification ? "not-allowed" : "pointer",
                        opacity: resendingVerification ? 0.6 : 1, whiteSpace: "nowrap",
                      }}
                    >
                      {resendingVerification ? "Sending…" : `Resend to all ${unverified.length}`}
                    </button>
                    {verificationResult && (
                      <span style={{ fontSize: 13, color: verificationResult.failed > 0 ? "#c41e1e" : "#1a6640" }}>
                        Last run: {verificationResult.sent} sent{verificationResult.failed > 0 ? `, ${verificationResult.failed} failed` : ""}.
                      </span>
                    )}
                  </div>
                  {failures.length > 0 && (
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: "pointer", fontSize: 13, color: "#9a7b00", fontWeight: 700 }}>
                        Show {failures.length} failure{failures.length === 1 ? "" : "s"}
                      </summary>
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        {failures.map(f => {
                          const u = users.find(x => x.id === f.uid);
                          const reasonText = {
                            "already-verified": "already verified (no action needed — list will refresh)",
                            "no-email-on-account": "account has no email on file",
                            "auth/too-many-requests": "Firebase rate-limited this — wait a few minutes and retry just this user",
                          }[f.reason] || f.reason || "unknown error";
                          return (
                            <div key={f.uid} style={{ fontSize: 13, color: "#c41e1e" }}>
                              {(u?.fullName || f.email || f.uid)} — {reasonText}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>
              );
            })()}
            {/* Daily-limit legend (added Aug 2026 alongside the standing/
                same-day override controls) — the base numbers a Manager or
                Admin has to hold in their head every time they look at a
                user's card. DAILY_LIMITS is the same constant used for the
                at-limit badge calc above; shown once here instead of
                requiring a lookup elsewhere or per-file digging. */}
            {!loadingUsers && filteredUsers.length > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
                background: "#f7f7f7", border: "1.5px solid #e5e5e5", borderRadius: 8,
                padding: "10px 16px", marginBottom: 16, fontSize: 12.5, color: "#666",
              }}>
                <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 11, color: "#888" }}>
                  Daily AI-call limits (base, by role)
                </span>
                <span><strong style={{ color: CHARCOAL }}>Member</strong> {DAILY_LIMITS.user}</span>
                <span><strong style={{ color: CHARCOAL }}>Manager</strong> {DAILY_LIMITS.manager}</span>
                <span><strong style={{ color: CHARCOAL }}>Administrator</strong> {DAILY_LIMITS.administrator}</span>
                <span style={{ color: "#999" }}>— plus any standing addition or today-only bump set per user below</span>
              </div>
            )}
            {!loadingUsers && filteredUsers.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredUsers.map(u => {
                  const rc   = ROLE_COLORS[u.role] || ROLE_COLORS.user;
                  const isMe = u.id === currentUser?.uid;
                  const isEditing = editingUid === u.id;
                  const isBusy = actionUid === u.id || saving === u.id;
                  const isDisabled = !!u.disabled;
                  const cardErr = actionError?.uid === u.id ? actionError.message : null;
                  return (
                    <div key={u.id} style={{
                      background: isDisabled ? "#fafafa" : BG,
                      border: `1.5px solid ${isMe ? GOLD : "#ddd"}`,
                      borderLeft: `5px solid ${isMe ? GOLD : isDisabled ? "#bbb" : rc.border}`,
                      borderRadius: 10, padding: "18px 22px",
                      display: "flex", alignItems: isEditing ? "flex-start" : "center", gap: 16, flexWrap: "wrap",
                      boxShadow: isMe ? `0 0 0 2px ${GOLD}33` : "none",
                      opacity: isDisabled ? 0.7 : 1,
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: isDisabled ? "#999" : TEAL, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0, border: `2px solid ${GOLD}` }}>
                        {(u.fullName || u.email || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
                            <input
                              type="text" value={editForm.fullName}
                              onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))}
                              placeholder="Full name"
                              style={{ padding: "8px 12px", fontSize: 15, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", color: CHARCOAL }}
                            />
                            <input
                              type="email" value={editForm.email}
                              onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                              placeholder="Email address"
                              style={{ padding: "8px 12px", fontSize: 15, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", color: CHARCOAL }}
                            />
                            {editForm.socials.map((s, i) => (
                              <div key={i} style={{ display: "flex", gap: 8 }}>
                                <input
                                  type="text" value={s.platform}
                                  onChange={e => updateSocialField(i, "platform", e.target.value)}
                                  placeholder="Platform"
                                  style={{ flex: "0 0 120px", padding: "8px 12px", fontSize: 14, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", color: CHARCOAL }}
                                />
                                <input
                                  type="text" value={s.handle}
                                  onChange={e => updateSocialField(i, "handle", e.target.value)}
                                  placeholder="@handle"
                                  style={{ flex: 1, padding: "8px 12px", fontSize: 14, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", color: CHARCOAL }}
                                />
                                {editForm.socials.length > 1 && (
                                  <button onClick={() => removeSocialField(i)} title="Remove this social"
                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#aaa", padding: "0 4px" }}>
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                            <button onClick={addSocialField} type="button"
                              style={{ alignSelf: "flex-start", background: "none", border: "none", color: TEAL, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: "2px 0" }}>
                              + Add another social
                            </button>
                            {/* orgId + dailyLimitStanding + dailyLimitToday
                                (August 2026 addition) — Administrator-only.
                                orgId is which org this user actually belongs
                                to (billing/credit-pool membership) —
                                previously only settable via a direct
                                Firestore edit or the migration script.
                                dailyLimitStanding is a PERSISTENT addition to
                                their role-based daily call limit.
                                dailyLimitToday sets the SAME same-day
                                override the "+N today" quick buttons already
                                write (dailyLimitOverride +
                                dailyLimitOverrideDate) — added here directly
                                because those quick buttons only render once a
                                user is already AT their limit, and a same-day
                                bump was needed as a normal, always-available
                                action, not just an emergency one. All three
                                write fields firestore.rules protects on the
                                owner-edit path, so only an Administrator
                                editing someone ELSE's doc can set them —
                                matches the isAdmin-gated pattern already used
                                for the org addon toggles below on this page.
                                Managers see these fields but can't edit them,
                                so it's clear the capability exists without
                                implying it will silently work if they try. */}
                            <div style={{ marginTop: 4, padding: "10px 12px", background: isAdmin ? "#fff8f0" : "#f7f7f7", borderRadius: 8, border: `1.5px solid ${isAdmin ? GOLD : "#e5e5e5"}` }}>
                              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>
                                Organization &amp; standing limit {!isAdmin && "(Administrator only)"}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: CHARCOAL, fontWeight: 600 }}>
                                  Org membership (billing/credits)
                                  <select
                                    value={editForm.orgId}
                                    onChange={e => setEditForm(f => ({ ...f, orgId: e.target.value }))}
                                    disabled={!isAdmin || (orgsLoading && !coalitionOrgs.length)}
                                    style={{ padding: "7px 10px", fontSize: 13.5, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", color: CHARCOAL, background: "#fff" }}
                                  >
                                    <option value="">— no org —</option>
                                    {coalitionOrgs.map(org => (
                                      <option key={org.id} value={org.id}>{org.name || org.id}</option>
                                    ))}
                                  </select>
                                </label>
                                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: CHARCOAL, fontWeight: 600 }}>
                                  Standing daily-limit addition (persists every day, on top of role limit)
                                  <input
                                    type="number" min="0" step="1"
                                    value={editForm.dailyLimitStanding}
                                    onChange={e => setEditForm(f => ({ ...f, dailyLimitStanding: e.target.value }))}
                                    disabled={!isAdmin}
                                    placeholder="0"
                                    style={{ padding: "7px 10px", fontSize: 13.5, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", color: CHARCOAL, width: 120 }}
                                  />
                                </label>
                                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: CHARCOAL, fontWeight: 600 }}>
                                  Today-only addition (clears at midnight UTC — same mechanism as "+N today")
                                  <input
                                    type="number" min="0" step="1"
                                    value={editForm.dailyLimitToday}
                                    onChange={e => setEditForm(f => ({ ...f, dailyLimitToday: e.target.value }))}
                                    disabled={!isAdmin}
                                    placeholder="0"
                                    style={{ padding: "7px 10px", fontSize: 13.5, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", color: CHARCOAL, width: 120 }}
                                  />
                                </label>
                                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: CHARCOAL, fontWeight: 600, cursor: isAdmin ? "pointer" : "default" }}>
                                  <input
                                    type="checkbox"
                                    checked={editForm.orgAdmin}
                                    onChange={e => setEditForm(f => ({ ...f, orgAdmin: e.target.checked }))}
                                    disabled={!isAdmin}
                                    style={{ width: 15, height: 15, accentColor: GOLD, cursor: isAdmin ? "pointer" : "default" }}
                                  />
                                  Org admin — can manage plain members of their own org (never Managers/Admins, never other org admins)
                                </label>
                              </div>
                              <div style={{ fontSize: 11.5, color: "#999", marginTop: 8, lineHeight: 1.5 }}>
                                Changing org membership moves this user onto a different org's shared credit pool — confirm before saving. Standing stays in effect until changed here; today-only resets to 0 at midnight UTC regardless of what's set here. Org admin only does anything once this user also has an org set above.
                              </div>
                            </div>
                            {/* researchOrgIds (Aug 2026 addition) — grants this
                                user visibility into more than one org's Research
                                candidates, via the "Viewing: [org] ▾" switcher
                                already built in CandidateQuery.jsx/RaceComparison.jsx.
                                Leaving every box unchecked is the normal case —
                                a user just sees their own org, same as today. */}
                            <div style={{ marginTop: 4, padding: "10px 12px", background: "#f7f7f7", borderRadius: 8, border: "1.5px solid #e5e5e5" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>
                                Research: extra org visibility
                              </div>
                              {orgsLoading && !coalitionOrgs.length ? (
                                <div style={{ fontSize: 13, color: "#999" }}>Loading orgs…</div>
                              ) : coalitionOrgs.length === 0 ? (
                                <div style={{ fontSize: 13, color: "#999" }}>No orgs found.</div>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {coalitionOrgs.map(org => (
                                    <label key={org.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: CHARCOAL, cursor: "pointer" }}>
                                      <input
                                        type="checkbox"
                                        checked={editForm.researchOrgIds.includes(org.id)}
                                        onChange={() => toggleResearchOrgId(org.id)}
                                        style={{ width: 15, height: 15, accentColor: TEAL, cursor: "pointer" }}
                                      />
                                      {org.name || org.id}
                                    </label>
                                  ))}
                                </div>
                              )}
                              <div style={{ fontSize: 11.5, color: "#999", marginTop: 8, lineHeight: 1.5 }}>
                                Doesn't change this user's own org, role, or credits — only what they can additionally VIEW in Research.
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                              <button onClick={() => saveEdit(u.id)} disabled={isBusy} style={{ background: TEAL, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: isBusy ? "not-allowed" : "pointer" }}>
                                {isBusy ? "Saving…" : "Save"}
                              </button>
                              <button onClick={cancelEdit} disabled={isBusy} style={{ background: "none", color: "#888", border: "2px solid #ccc", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: isBusy ? "not-allowed" : "pointer" }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 17, fontWeight: 700, color: CHARCOAL }}>{u.fullName || "—"}</span>
                              {isMe && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: GOLD, color: TEAL, padding: "2px 8px", borderRadius: 4 }}>You</span>}
                              {isDisabled && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: "#eee", color: "#777", border: "1px solid #ccc", padding: "2px 8px", borderRadius: 4 }}>Disabled</span>}
                              {u.orgAdmin === true && <span title="Can manage this org's plain members (add/remove, own org only)" style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: "var(--gold-light)", color: "#9a7b00", border: `1px solid ${GOLD}`, padding: "2px 8px", borderRadius: 4 }}>Org Admin</span>}
                              {u.emailVerified === false && !isDisabled && (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: "var(--gold-light)", color: "#9a7b00", border: `1px solid ${GOLD}`, padding: "2px 8px", borderRadius: 4 }}>
                                  Unverified
                                  <button
                                    onClick={() => resendVerification([u.id])}
                                    disabled={resendingVerification}
                                    title="Resend verification email"
                                    style={{ background: "none", border: "none", cursor: resendingVerification ? "not-allowed" : "pointer", color: TEAL, fontWeight: 700, fontSize: 11, padding: 0, textDecoration: "underline", textTransform: "none", letterSpacing: "normal" }}>
                                    Resend
                                  </button>
                                </span>
                              )}
                              {Array.isArray(u.researchOrgIds) && u.researchOrgIds.length > 0 && (
                                <span title={`Extra Research visibility: ${u.researchOrgIds.join(", ")}`} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: "#eef4ff", color: "#3454b4", border: "1px solid #b8cdf5", padding: "2px 8px", borderRadius: 4 }}>
                                  +{u.researchOrgIds.length} org{u.researchOrgIds.length !== 1 ? "s" : ""}
                                </span>
                              )}
                              <button onClick={() => setDetailsUid(u.id)} title="View full details"
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: TEAL, padding: "2px 4px", textDecoration: "underline" }}>
                                Details
                              </button>
                              {!isMe && (
                                <button onClick={() => startEdit(u)} title="Edit name / social"
                                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#aaa", padding: 2 }}>
                                  ✏️
                                </button>
                              )}
                            </div>
                            <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>{u.email}</div>
                            {/* Show all social accounts */}
                            {(u.socialAccounts?.length > 0 || u.primarySocial?.handle) && (
                              <div style={{ fontSize: 12, color: TEAL, marginTop: 4, fontWeight: 600 }}>
                                {(u.socialAccounts || [u.primarySocial, u.secondarySocial].filter(Boolean))
                                  .filter(s => s?.handle)
                                  .map((s, i) => <span key={i}>{i > 0 ? " · " : ""}{s.platform}: {s.handle}</span>)
                                }
                              </div>
                            )}
                            {u.createdAt && (
                              <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                                Joined {formatDate(u.createdAt)}
                                {u.googleSignIn && " · Google sign-in"}
                              </div>
                            )}
                            {cardErr && (
                              <div style={{ fontSize: 12, color: RED, marginTop: 6 }}>{cardErr}</div>
                            )}
                          </>
                        )}
                      </div>
                      {!isEditing && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Role</div>
                            <select
                              value={u.role || "user"}
                              onChange={e => handleRoleChange(u.id, e.target.value)}
                              disabled={saving === u.id || isMe}
                              style={{ padding: "8px 12px", fontSize: 14, fontWeight: 700, fontFamily: "inherit", border: `2px solid ${rc.border}`, borderRadius: 8, background: rc.bg, color: rc.color, cursor: (saving === u.id || isMe) ? "not-allowed" : "pointer", minWidth: 150, appearance: "auto" }}
                            >
                              {ROLE_OPTIONS.map(r => (
                                <option key={r} value={r}>{r === "administrator" ? "Administrator" : r === "manager" ? "Manager" : "Member"}</option>
                              ))}
                            </select>
                            {saving === u.id && <span style={{ fontSize: 12, color: "#888" }}>Saving…</span>}
                          </div>

                          {/* Effective daily limit — added Aug 2026 alongside
                              the standing/today override controls, so this
                              never has to be looked up separately: base role
                              limit plus whatever's currently added, computed
                              the same way isAtDailyLimit()/rateLimitHelper.mjs
                              do. Shown for every user, not just ones at their
                              limit. */}
                          {(() => {
                            const base = DAILY_LIMITS[u.role] ?? DAILY_LIMITS.user;
                            const standing = standingLimit(u);
                            const todayAdd = overrideToday(u, todayUTC());
                            const effective = base + standing + todayAdd;
                            const hasAdditions = standing > 0 || todayAdd > 0;
                            return (
                              <div title={hasAdditions ? `${base} base + ${standing} standing + ${todayAdd} today` : "Base role limit, no additions"}
                                style={{ fontSize: 12, color: hasAdditions ? TEAL : "#888", fontWeight: hasAdditions ? 700 : 400, whiteSpace: "nowrap" }}>
                                Limit: {effective}/day{hasAdditions && " *"}
                              </div>
                            );
                          })()}

                          {isAtDailyLimit(u) && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--terracotta-light)", border: `1.5px solid ${TERRACOTTA}`, borderRadius: 8, padding: "6px 10px" }}>
                              <span style={{ fontSize: 11.5, fontWeight: 700, color: TERRACOTTA, whiteSpace: "nowrap" }}>🚦 At limit today</span>
                              {[10, 25].map(amount => (
                                <button
                                  key={amount}
                                  onClick={() => handleAddOverride(u.id, amount)}
                                  disabled={saving === u.id}
                                  title={`Give ${u.fullName || u.email} ${amount} extra AI calls for the rest of today`}
                                  style={{
                                    background: "#fff", border: `1.5px solid ${TERRACOTTA}`, color: TERRACOTTA,
                                    borderRadius: 6, padding: "4px 9px", fontSize: 12, fontWeight: 700,
                                    fontFamily: "inherit", cursor: saving === u.id ? "not-allowed" : "pointer",
                                  }}
                                >
                                  +{amount} today
                                </button>
                              ))}
                            </div>
                          )}

                          {!isMe && (
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => callManageUser(u.id, isDisabled ? "enable" : "disable")}
                                disabled={isBusy}
                                title={isDisabled ? "Re-enable this account" : "Block this account from signing in"}
                                style={{
                                  background: "none", border: `2px solid ${isDisabled ? TEAL : TERRACOTTA}`,
                                  color: isDisabled ? TEAL : TERRACOTTA, borderRadius: 8, padding: "8px 14px",
                                  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                                  cursor: isBusy ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                                  opacity: isBusy ? 0.6 : 1,
                                }}
                              >
                                {actionUid === u.id ? "…" : isDisabled ? "Enable" : "Disable"}
                              </button>

                              {confirmDeleteUid === u.id ? (
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <span style={{ fontSize: 12, color: RED, fontWeight: 700 }}>Delete permanently?</span>
                                  <button
                                    onClick={() => callManageUser(u.id, "delete")}
                                    disabled={isBusy}
                                    style={{ background: RED, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: isBusy ? "not-allowed" : "pointer" }}
                                  >
                                    {isBusy ? "Deleting…" : "Yes, delete"}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteUid(null)}
                                    disabled={isBusy}
                                    style={{ background: "none", border: "2px solid #ccc", color: "#888", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: isBusy ? "not-allowed" : "pointer" }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteUid(u.id)}
                                  disabled={isBusy}
                                  title="Permanently delete this account"
                                  style={{
                                    background: "none", border: `2px solid #ddd`, color: "#aaa",
                                    borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700,
                                    fontFamily: "inherit", cursor: isBusy ? "not-allowed" : "pointer",
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Role legend */}
            <div style={{ marginTop: 40, background: BG, border: "1.5px solid #ddd", borderRadius: 10, padding: "20px 24px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL, marginBottom: 14 }}>Role Permissions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { role: "Member",        color: "#888",    desc: "Can use all tools. Can save and delete their own Library entries only." },
                  { role: "Manager",       color: TURQUOISE, desc: "All Member permissions. Can delete any Library entry from any user." },
                  { role: "Administrator", color: GOLD,      desc: "All Manager permissions. Can access this Admin page, change user roles, and send invites." },
                ].map(r => (
                  <div key={r.role} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: r.color, minWidth: 110, flexShrink: 0 }}>{r.role}</span>
                    <span style={{ fontSize: 13, color: CHARCOAL, lineHeight: 1.5 }}>{r.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── COMMUNITY NOTES TAB ── */}
        {activeTab === "community-notes" && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ background: BG, border: `1.5px solid #ddd`, borderRadius: 12, padding: "28px 32px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL, marginBottom: 6 }}>Daily Data Upload</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: CHARCOAL, margin: "0 0 12px" }}>Community Notes TSV Upload</h2>
              <p style={{ fontSize: 14, color: "#666", lineHeight: 1.7, marginBottom: 24 }}>
                Download <strong>notes-00000.tsv</strong> from{" "}
                <a href="https://x.com/i/communitynotes/download-data" target="_blank" rel="noreferrer" style={{ color: TEAL, fontWeight: 700 }}>
                  x.com/i/communitynotes/download-data
                </a>{" "}
                while logged in to X, then upload it here. The dashboard updates immediately for all users.
              </p>

              {/* Step 1: File picker */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CHARCOAL, marginBottom: 8 }}>Step 1 — Select file</div>
                <label style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
                  border: `2px dashed ${cnFiles.length ? TEAL : "#ccc"}`, borderRadius: 10,
                  background: cnFiles.length ? "#f0faf5" : "#fafafa", cursor: "pointer",
                  transition: "all 0.15s",
                }}>
                  <span style={{ fontSize: 24 }}>📂</span>
                  <div style={{ flex: 1 }}>
                    {cnFiles.length > 0 ? (
                      <div>
                        {cnFiles.map((f, i) => (
                          <div key={i} style={{ fontSize: 14, color: TEAL, fontWeight: 700 }}>{f.name}</div>
                        ))}
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 14, color: "#888" }}>Click to select Notes data files</div>
                        <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>File no. 1 of 3 contains almost all the data — you can upload just that one, or all 3</div>
                      </div>
                    )}
                  </div>
                  <input type="file" accept=".tsv,.txt,.zip" multiple onChange={handleCnFile} style={{ display: "none" }} />
                </label>
              </div>

              {/* Parsing indicator */}
              {cnParsing && (
                <div style={{ fontSize: 14, color: "#888", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
                  Parsing and classifying notes…
                </div>
              )}

              {/* Step 2: Preview */}
              {cnPreview && !cnDone && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CHARCOAL, marginBottom: 8 }}>Step 2 — Review & upload</div>
                  <div style={{ background: "#f0faf5", border: `1.5px solid #b2d9cc`, borderRadius: 10, padding: "16px 20px", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: TEAL, marginBottom: 10 }}>✓ File parsed successfully</div>
                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                      <div><div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>Political Notes Found</div><div style={{ fontSize: 24, fontWeight: 800, color: CHARCOAL }}>{cnPreview.count.toLocaleString()}</div></div>
                      <div><div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>GOP-Targeting</div><div style={{ fontSize: 24, fontWeight: 800, color: TERRACOTTA }}>{cnPreview.totalR.toLocaleString()}</div></div>
                      <div><div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>Dem-Targeting</div><div style={{ fontSize: 24, fontWeight: 800, color: TEAL }}>{cnPreview.totalD.toLocaleString()}</div></div>
                    </div>
                  </div>
                  <button
                    onClick={handleCnUpload}
                    disabled={cnUploading}
                    style={{
                      background: cnUploading ? "#ccc" : TEAL, color: "#fff",
                      border: "none", borderRadius: 8, padding: "13px 28px",
                      fontSize: 15, fontWeight: 700, fontFamily: "inherit",
                      cursor: cnUploading ? "not-allowed" : "pointer", width: "100%",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {cnUploading ? "Uploading…" : `Upload ${cnPreview.count.toLocaleString()} Notes to Dashboard →`}
                  </button>
                </div>
              )}

              {/* Success state */}
              {cnDone && (
                <div style={{ background: "#f0faf5", border: `1.5px solid #b2d9cc`, borderRadius: 10, padding: "20px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: TEAL, marginBottom: 6 }}>Dashboard updated!</div>
                  <div style={{ fontSize: 13, color: "#666" }}>{cnPreview?.count.toLocaleString()} notes are now live on the BS Monitor.</div>
                  <button onClick={() => { setCnFiles([]); setCnPreview(null); setCnParsed(null); setCnDone(false); }}
                    style={{ marginTop: 16, background: "none", border: `2px solid ${TEAL}`, color: TEAL, borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
                    Upload another file
                  </button>
                </div>
              )}

              {/* Instructions */}
              <div style={{ marginTop: 24, padding: "14px 18px", background: "#f8f8f6", borderRadius: 8, fontSize: 13, color: "#666", lineHeight: 1.7 }}>
                <strong style={{ color: CHARCOAL }}>Daily workflow:</strong>
                <ol style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  <li>Go to <a href="https://x.com/i/communitynotes/download-data" target="_blank" rel="noreferrer" style={{ color: TEAL }}>x.com/i/communitynotes/download-data</a> (must be logged in to X)</li>
                  <li>Click the download icon for <strong>File no. 1 of 3</strong> under Notes data (contains ~99% of all notes)</li>
                  <li>Select it in the file picker above (or select all 3 for complete coverage)</li>
                  <li>Done — the BS Monitor dashboard updates instantly</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === "settings" && (
          <div style={{ background: BG, border: "2px solid #eee", borderRadius: 12, padding: "24px 28px" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: CHARCOAL, margin: "0 0 6px" }}>Public Regenerate</h2>
            <p style={{ fontSize: 14, color: "#777", margin: "0 0 18px", lineHeight: 1.6 }}>
              Controls the "🔁 Regenerate" button visitors see on public storm pages (no login required). Turning this off disables the button everywhere immediately — no deploy needed. This does not affect Regenerate for signed-in members, which uses a separate, authenticated path.
            </p>
            {!pubRegenLoaded ? (
              <p style={{ color: "#999", fontSize: 14 }}>Loading…</p>
            ) : (
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: pubRegenSaving ? "default" : "pointer" }}>
                <input type="checkbox" checked={pubRegenEnabled} disabled={pubRegenSaving} onChange={togglePubRegen} style={{ width: 20, height: 20, cursor: pubRegenSaving ? "default" : "pointer" }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: pubRegenEnabled ? TEAL : TERRACOTTA }}>
                  {pubRegenEnabled ? "Enabled" : "Disabled"}
                </span>
              </label>
            )}
            <p style={{ fontSize: 12.5, color: "#999", marginTop: 18, lineHeight: 1.6 }}>
              Separately, this also auto-disables per visitor for the rest of the day if it hits 20 regenerations from one IP, 200 from one storm, or 1,000 sitewide — each resets at UTC midnight. Shari gets an email the first time any of those limits trips each day.
            </p>
          </div>
        )}

        {/* ── ORGS TAB ── */}
        {activeTab === "orgs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {orgsLoading && !orgsLoaded ? (
              <p style={{ color: "#999", fontSize: 14 }}>Loading…</p>
            ) : orgs.length === 0 ? (
              <p style={{ color: "#999", fontSize: 14 }}>
                No orgs found. Run scripts/migrate-users-to-orgs.mjs (GitHub Actions → Migrate Users to Orgs) to seed them.
              </p>
            ) : orgs.map(org => {
              const form = grantForms[org.id] || { creditType: "generation", amount: "", reason: "", submitting: false };
              const genBalance = org.credits?.generationBalance ?? 0;
              const transBalance = org.credits?.transcriptionBalance ?? 0;
              return (
                <div key={org.id} style={{ background: BG, border: "2px solid #eee", borderRadius: 12, padding: "24px 28px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 800, color: CHARCOAL, margin: "0 0 2px" }}>{org.name || org.id}</h2>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#999" }}>{org.id}</span>
                    </div>
                    <div style={{ display: "flex", gap: 20 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: TEAL, lineHeight: 1 }}>{genBalance}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#999", marginTop: 3 }}>Generation credits</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: TURQUOISE, lineHeight: 1 }}>{transBalance}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#999", marginTop: 3 }}>Transcription credits</div>
                      </div>
                    </div>
                  </div>

                  {/* Sandbox transcription addon toggle — admin-only, matches
                      firestore.rules' orgs/{orgId} write gate */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: isAdmin && addonSaving !== org.id ? "pointer" : "default", opacity: isAdmin ? 1 : 0.6 }}>
                      <input
                        type="checkbox"
                        checked={!!org.addons?.sandboxTranscription}
                        disabled={!isAdmin || addonSaving === org.id}
                        onChange={() => toggleOrgAddon(org)}
                        style={{ width: 18, height: 18, cursor: isAdmin ? "pointer" : "default" }}
                      />
                      <span style={{ fontSize: 14, fontWeight: 700, color: org.addons?.sandboxTranscription ? TEAL : "#999" }}>
                        Sandbox transcription {org.addons?.sandboxTranscription ? "enabled" : "disabled"}
                      </span>
                    </label>
                    {!isAdmin && (
                      <p style={{ fontSize: 12, color: "#aaa", margin: "6px 0 0 28px" }}>Administrator access required to change this.</p>
                    )}
                  </div>

                  {/* Grant credits — admin-only. Never a Stripe purchase;
                      always logged to orgs/{orgId}/creditGrants for audit. */}
                  <div style={{ borderTop: "1px solid #eee", paddingTop: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#999", margin: "0 0 12px" }}>
                      Grant comp credits
                    </h3>
                    {!isAdmin ? (
                      <p style={{ fontSize: 13, color: "#aaa" }}>Administrator access required to grant credits.</p>
                    ) : (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#999", marginBottom: 4 }}>Credit type</label>
                          <select
                            value={form.creditType}
                            disabled={form.submitting}
                            onChange={e => updateGrantForm(org.id, { creditType: e.target.value })}
                            style={{ padding: "9px 12px", fontSize: 14, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", background: BG, color: CHARCOAL }}
                          >
                            <option value="generation">Generation</option>
                            <option value="transcription">Transcription</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#999", marginBottom: 4 }}>Amount</label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={form.amount}
                            disabled={form.submitting}
                            onChange={e => updateGrantForm(org.id, { amount: e.target.value })}
                            style={{ width: 100, padding: "8px 12px", fontSize: 14, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", background: BG, color: CHARCOAL }}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#999", marginBottom: 4 }}>Reason (required — shows in the audit trail)</label>
                          <input
                            type="text"
                            placeholder="e.g. beta testing comp, Aug–Sep 2026"
                            value={form.reason}
                            disabled={form.submitting}
                            onChange={e => updateGrantForm(org.id, { reason: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 14, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", background: BG, color: CHARCOAL }}
                          />
                        </div>
                        <button
                          onClick={() => handleGrantCredits(org)}
                          disabled={form.submitting}
                          style={{
                            background: form.submitting ? "#ccc" : TEAL, color: "#fff",
                            border: "none", borderRadius: 8, padding: "10px 20px",
                            fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                            cursor: form.submitting ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          {form.submitting ? "Granting…" : "Grant"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* History — credit grants + billed transcription usage.
                      Lazy-loaded on first expand. */}
                  <div style={{ borderTop: "1px solid #eee", marginTop: 20, paddingTop: 16 }}>
                    <button
                      onClick={() => toggleHistory(org.id)}
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: 0,
                        fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
                        color: TEAL, display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {historyOpenIds.has(org.id) ? "▾" : "▸"} History
                    </button>

                    {historyOpenIds.has(org.id) && (
                      <div style={{ marginTop: 14 }}>
                        {historyData[org.id]?.loading ? (
                          <p style={{ color: "#999", fontSize: 13 }}>Loading…</p>
                        ) : (
                          <>
                            <div style={{ marginBottom: 18 }}>
                              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 8px" }}>
                                Credit grants
                              </h4>
                              {!historyData[org.id]?.grants?.length ? (
                                <p style={{ fontSize: 13, color: "#bbb", fontStyle: "italic" }}>No grants yet.</p>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                  {historyData[org.id].grants.map(g => (
                                    <div key={g.id} style={{ fontSize: 13, color: CHARCOAL, background: "#f9f9f9", borderRadius: 8, padding: "8px 12px" }}>
                                      <span style={{ fontWeight: 700, color: TEAL }}>+{g.amount} {g.creditType}</span>
                                      {" — "}{g.reason || "—"}
                                      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                                        {g.grantedByEmail || g.grantedBy} · {formatDate(g.createdAt)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <h4 style={{ fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 8px" }}>
                                Transcription usage
                              </h4>
                              {!historyData[org.id]?.jobs?.length ? (
                                <p style={{ fontSize: 13, color: "#bbb", fontStyle: "italic" }}>No billed transcription jobs yet.</p>
                              ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                  {historyData[org.id].jobs.map(j => (
                                    <div key={j.id} style={{ fontSize: 13, color: CHARCOAL, background: "#f9f9f9", borderRadius: 8, padding: "8px 12px" }}>
                                      <span style={{ fontWeight: 700, color: TURQUOISE }}>-{j.billedCredits} credit{j.billedCredits === 1 ? "" : "s"}</span>
                                      {" — "}{formatMinutesSeconds(j.audioDurationSeconds)} of audio
                                      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                                        {formatDate(j.billedAt)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CANDIDATES TAB ── */}
        {/* Bulk active/inactive toggle — primary-night cleanup. Never
            deletes; sets `active: false`, which query-candidates.mjs
            filters out of default Research results. Fully reversible. */}
        {activeTab === "candidates" && (
          <div>
            {candidatesLoading && !candidatesLoaded ? (
              <p style={{ color: "#888", textAlign: "center", padding: 40 }}>Loading candidates…</p>
            ) : (
              <>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
                  <input
                    type="search"
                    placeholder="Search by name, office, or district…"
                    value={candidateSearch}
                    onChange={e => setCandidateSearch(e.target.value)}
                    style={{ flex: 1, minWidth: 220, boxSizing: "border-box", padding: "12px 16px", fontSize: 15, border: "2px solid #ccc", borderRadius: 10, fontFamily: "inherit", color: CHARCOAL, background: BG }}
                  />
                  <select
                    value={candidateStateFilter}
                    onChange={e => setCandidateStateFilter(e.target.value)}
                    style={{ padding: "12px 14px", fontSize: 14, border: "2px solid #ccc", borderRadius: 10, fontFamily: "inherit", color: CHARCOAL, background: BG, cursor: "pointer" }}
                  >
                    <option value="">All states</option>
                    {[...new Set(candidates.map(c => c.state).filter(Boolean))].sort().map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <select
                    value={candidateOrgFilter}
                    onChange={e => setCandidateOrgFilter(e.target.value)}
                    style={{ padding: "12px 14px", fontSize: 14, border: "2px solid #ccc", borderRadius: 10, fontFamily: "inherit", color: CHARCOAL, background: BG, cursor: "pointer" }}
                  >
                    <option value="">All orgs</option>
                    {coalitionOrgs.map(org => (
                      <option key={org.id} value={org.id}>{org.name || org.id}</option>
                    ))}
                  </select>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#666", cursor: "pointer", whiteSpace: "nowrap" }}>
                    <input
                      type="checkbox"
                      checked={showInactive}
                      onChange={e => setShowInactive(e.target.checked)}
                      style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    Show closed
                  </label>
                </div>

                {(() => {
                  const q = candidateSearch.toLowerCase().trim();
                  const visible = candidates.filter(c => {
                    const isActive = c.active !== false;
                    if (!showInactive && !isActive) return false;
                    // Exact match, not substring — a two-letter state code
                    // inside the old combined free-text search produced
                    // real false positives (see the comment on
                    // candidateStateFilter's declaration above).
                    if (candidateStateFilter && c.state !== candidateStateFilter) return false;
                    // Org filter: matches this app's existing fail-open
                    // convention for focusOrgIds everywhere else (an
                    // untagged candidate shows to every org as
                    // "Unassigned" rather than being hidden) — selecting an
                    // org shows candidates explicitly tagged with it PLUS
                    // every still-untagged candidate, not ONLY the tagged
                    // ones, so this filter matches what that org's own
                    // Research view actually looks like.
                    if (candidateOrgFilter) {
                      const tags = Array.isArray(c.focusOrgIds) ? c.focusOrgIds : [];
                      if (tags.length > 0 && !tags.includes(candidateOrgFilter)) return false;
                    }
                    if (!q) return true;
                    return [c.name, c.office, c.district].join(" ").toLowerCase().includes(q);
                  });

                  if (visible.length === 0) {
                    return <p style={{ color: "#888", textAlign: "center", padding: 40 }}>No candidates match.</p>;
                  }

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 90 }}>
                      {visible.map(c => {
                        const isActive = c.active !== false;
                        const isSelected = selectedCandidateIds.has(c.id);
                        const partyColors = c.party === "D"
                          ? { bg: "#e8f0fe", color: "#1a56b0" }
                          : c.party === "R"
                            ? { bg: "#fdecea", color: "#b91c1c" }
                            : { bg: "#f3f4f6", color: CHARCOAL };
                        return (
                          <div
                            key={c.id}
                            onClick={() => toggleCandidateSelected(c.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                              background: isSelected ? "#E6FAF7" : BG,
                              border: `1.5px solid ${isSelected ? TURQUOISE : "#e0e0e0"}`,
                              borderRadius: 10, cursor: "pointer", opacity: isActive ? 1 : 0.6,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onClick={e => e.stopPropagation()}
                              onChange={() => toggleCandidateSelected(c.id)}
                              style={{ width: 18, height: 18, cursor: "pointer", flexShrink: 0 }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 700, fontSize: 15, color: CHARCOAL }}>{c.name || "(no name)"}</span>
                                {c.party && (
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: partyColors.bg, color: partyColors.color }}>{c.party}</span>
                                )}
                                {!isActive && (
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: "#f3f4f6", color: "#888", border: "1px solid #ddd" }}>Closed</span>
                                )}
                              </div>
                              <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
                                {c.office}{c.district ? ` · ${c.district}` : ""}{c.state ? ` · ${c.state}` : ""}
                              </div>
                            </div>
                            {Array.isArray(c.focusOrgIds) && c.focusOrgIds.length > 0 && (
                              <span title={`Focus orgs: ${c.focusOrgIds.join(", ")}`} style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: "#eef4ff", color: "#3454b4", border: "1px solid #b8cdf5", padding: "2px 8px", borderRadius: 4, flexShrink: 0 }}>
                                {c.focusOrgIds.length} org{c.focusOrgIds.length !== 1 ? "s" : ""}
                              </span>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); startEditCandidate(c); }}
                              style={{ flexShrink: 0, background: "none", border: `1.5px solid ${TEAL}`, color: TEAL, fontWeight: 700, fontSize: 12, padding: "6px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}
                            >
                              Edit
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Floating bulk-action bar — mirrors CandidateQuery.jsx's
                    floating selection bar pattern for visual consistency. */}
                {selectedCandidateIds.size > 0 && (
                  <div style={{
                    position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
                    background: TEAL, color: "#fff", borderRadius: 12,
                    padding: "14px 24px", display: "flex", alignItems: "center", gap: 16,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.25)", zIndex: 50, flexWrap: "wrap", maxWidth: "90vw",
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>
                      {selectedCandidateIds.size} selected
                    </span>
                    <button
                      onClick={() => setCandidatesActiveState(false)}
                      disabled={candidatesSaving}
                      style={{ background: TERRACOTTA, color: "#fff", fontWeight: 700, padding: "9px 20px", borderRadius: 8, border: "2px solid rgba(255,255,255,0.3)", cursor: candidatesSaving ? "not-allowed" : "pointer", fontSize: 14, fontFamily: "inherit" }}
                    >
                      {candidatesSaving ? "Saving…" : "Mark Inactive"}
                    </button>
                    <button
                      onClick={() => setCandidatesActiveState(true)}
                      disabled={candidatesSaving}
                      style={{ background: "rgba(255,255,255,0.15)", color: "#fff", fontWeight: 700, padding: "9px 20px", borderRadius: 8, border: "2px solid rgba(255,255,255,0.3)", cursor: candidatesSaving ? "not-allowed" : "pointer", fontSize: 14, fontFamily: "inherit" }}
                    >
                      Mark Active
                    </button>
                    <button
                      onClick={() => setSelectedCandidateIds(new Set())}
                      style={{ background: "transparent", color: "rgba(255,255,255,0.7)", border: "none", cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1 }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── WAITLIST TAB ── */}
        {activeTab === "waitlist" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: CHARCOAL, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={showRegistered}
                  onChange={e => setShowRegistered(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                Show completed registrations ({counts.registered})
              </label>
            </div>

            {loadingWaitlist && <p style={{ textAlign: "center", padding: "60px 0", color: CHARCOAL }}>Loading waitlist…</p>}
            {!loadingWaitlist && filteredWaitlist.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <p style={{ color: "#888", fontSize: 17 }}>
                  {!showRegistered && counts.registered > 0 ? "No outstanding waitlist entries." : "No waitlist entries yet."}
                </p>
                <p style={{ color: "#aaa", fontSize: 14, marginTop: 8 }}>
                  {!showRegistered && counts.registered > 0
                    ? "Everyone who applied has either registered or is still pending review."
                    : <>Entries appear when someone submits the public waitlist form at <strong>/waitlist</strong>.</>}
                </p>
              </div>
            )}
            {!loadingWaitlist && filteredWaitlist.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredWaitlist.map(entry => {
                  const sc = WAITLIST_STATUS_COLORS[entry.status] || WAITLIST_STATUS_COLORS.pending;
                  const isPending  = entry.status === "pending";
                  const isInvited  = entry.status === "invited";
                  const canSend    = isPending || isInvited;
                  const isInviting = inviting === entry.id;
                  return (
                    <div key={entry.id} style={{
                      background: BG,
                      border: `1.5px solid #ddd`,
                      borderLeft: `5px solid ${sc.border}`,
                      borderRadius: 10, padding: "18px 22px",
                      display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap",
                    }}>
                      {/* Avatar */}
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: isPending ? TERRACOTTA : TEAL, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
                        {(entry.fullName || entry.email || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 17, fontWeight: 700, color: CHARCOAL }}>{entry.fullName || "—"}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, padding: "2px 8px", borderRadius: 4 }}>
                            {entry.status === "pending" ? "Pending" : entry.status === "invited" ? "Invited" : entry.status === "registered" ? "Registered" : "Rejected"}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>{entry.email}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", background: entry.accountType === "org" ? "#eef4ff" : "#f3f0ff", color: entry.accountType === "org" ? "#3454b4" : "#6b3fa0", border: `1px solid ${entry.accountType === "org" ? "#b8cdf5" : "#d6c5f0"}`, padding: "1px 7px", borderRadius: 4 }}>
                            {entry.accountType === "org" ? "Org request" : "Individual"}
                          </span>
                        </div>
                        {entry.organization && (
                          <div style={{ fontSize: 13, color: CHARCOAL, marginBottom: 4 }}>🏢 {entry.organization}</div>
                        )}
                        {entry.primarySocial?.handle && (
                          <div style={{ fontSize: 12, color: TEAL, fontWeight: 600, marginBottom: 4 }}>
                            {entry.primarySocial.platform}: {entry.primarySocial.handle}
                          </div>
                        )}
                        {entry.reason && (
                          <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5, marginBottom: 4, fontStyle: "italic" }}>
                            "{entry.reason.length > 140 ? entry.reason.slice(0, 140) + "…" : entry.reason}"
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                          Submitted {formatDate(entry.submittedAt)}
                          {entry.invitedAt && ` · Invited ${formatDate(entry.invitedAt)}`}
                          {entry.registeredAt && ` · Registered ${formatDate(entry.registeredAt)}`}
                        </div>
                      </div>

                      {/* Action */}
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                        {canSend && entry.accountType === "org" && (
                          <select
                            value={inviteOrgChoice[entry.id] || ""}
                            onChange={e => setInviteOrgChoice(prev => ({ ...prev, [entry.id]: e.target.value }))}
                            style={{ padding: "8px 10px", fontSize: 13, border: "1.5px solid #ccc", borderRadius: 6, fontFamily: "inherit", color: CHARCOAL, background: BG, cursor: "pointer" }}
                          >
                            <option value="">Add to which org?</option>
                            {coalitionOrgs.map(org => (
                              <option key={org.id} value={org.id}>{org.name || org.id}</option>
                            ))}
                          </select>
                        )}
                        {canSend ? (
                          <button
                            onClick={() => handleSendInvite(entry)}
                            disabled={isInviting || (entry.accountType === "org" && !inviteOrgChoice[entry.id])}
                            style={{
                              background: isInviting ? "#ccc" : TEAL, color: "#fff",
                              border: "none", borderRadius: 8, padding: "10px 20px",
                              fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                              cursor: isInviting ? "not-allowed" : "pointer",
                              opacity: (entry.accountType === "org" && !inviteOrgChoice[entry.id]) ? 0.5 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isInviting ? "Sending…" : isInvited ? "Resend Invite ✉️" : "Send Invite ✉️"}
                          </button>
                        ) : (
                          <span style={{ fontSize: 13, color: "#aaa", fontStyle: "italic" }}>
                            {entry.status === "registered" ? "✓ Account created" : "—"}
                          </span>
                        )}

                        {confirmRemoveWaitlistId === entry.id ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: RED, fontWeight: 700 }}>Remove permanently?</span>
                            <button
                              onClick={() => handleRemoveWaitlistEntry(entry)}
                              disabled={removingWaitlistId === entry.id}
                              style={{ background: RED, color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: removingWaitlistId === entry.id ? "not-allowed" : "pointer" }}
                            >
                              {removingWaitlistId === entry.id ? "Removing…" : "Yes, remove"}
                            </button>
                            <button
                              onClick={() => setConfirmRemoveWaitlistId(null)}
                              disabled={removingWaitlistId === entry.id}
                              style={{ background: "none", border: "2px solid #ccc", color: "#888", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: removingWaitlistId === entry.id ? "not-allowed" : "pointer" }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRemoveWaitlistId(entry.id)}
                            title="Permanently remove this waitlist entry"
                            style={{
                              background: "none", border: "2px solid #ddd", color: "#aaa",
                              borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700,
                              fontFamily: "inherit", cursor: "pointer",
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Read-only user details modal ─────────────────────────────── */}
      {detailsUid && (() => {
        const u = users.find(x => x.id === detailsUid);
        if (!u) return null;
        const socials = (u.socialAccounts?.length ? u.socialAccounts : [u.primarySocial, u.secondarySocial].filter(Boolean))
          .filter(s => s && (s.platform || s.handle));
        const rc = ROLE_COLORS[u.role] || ROLE_COLORS.user;
        return (
          <div
            onClick={() => setDetailsUid(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: BG, borderRadius: 16, padding: "32px 32px", maxWidth: 480, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: 20, color: TEAL, fontFamily: "inherit" }}>{u.fullName || "—"}</h2>
                <button onClick={() => setDetailsUid(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#aaa", lineHeight: 1 }}>×</button>
              </div>

              <DetailRow label="Email" value={u.email || "—"} />
              <DetailRow label="Role" value={
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", background: rc.bg, color: rc.color, border: `1px solid ${rc.border}`, borderRadius: 6, padding: "3px 10px" }}>
                  {u.role || "user"}
                </span>
              } />
              <DetailRow label="Organization" value={u.organization || "—"} />
              <DetailRow label="Sign-in method" value={u.googleSignIn ? "Google" : "Email / password"} />
              <DetailRow label="Email verified" value={
                u.googleSignIn ? "Yes (via Google)" :
                u.emailVerified === false ? (
                  <span style={{ color: "#9a7b00" }}>
                    No —{" "}
                    <button onClick={() => resendVerification([u.id])} disabled={resendingVerification}
                      style={{ background: "none", border: "none", cursor: resendingVerification ? "not-allowed" : "pointer", color: TEAL, fontWeight: 700, padding: 0, textDecoration: "underline", fontSize: 14 }}>
                      resend verification email
                    </button>
                  </span>
                ) : "Yes"
              } />
              <DetailRow label="Joined" value={u.createdAt ? formatDate(u.createdAt) : "—"} />
              <DetailRow
                label={`Social account${socials.length === 1 ? "" : "s"}`}
                value={
                  socials.length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {socials.map((s, i) => (
                        <span key={i}>{s.platform || "—"}: {s.handle || "—"}</span>
                      ))}
                    </div>
                  ) : "—"
                }
              />
              <DetailRow label="User ID" value={<span style={{ fontFamily: "monospace", fontSize: 12, color: "#999", wordBreak: "break-all" }}>{u.id}</span>} />

              <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
                <button
                  onClick={() => { setDetailsUid(null); startEdit(u); }}
                  style={{ background: TEAL, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
                >
                  Edit
                </button>
                <button
                  onClick={() => setDetailsUid(null)}
                  style={{ background: "none", color: "#888", border: "2px solid #ccc", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Candidate field editor (Block 5 item 4) ── */}
      {editingCandidate && (
        <div
          onClick={cancelEditCandidate}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: BG, borderRadius: 16, padding: "32px 32px", maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: TEAL, fontFamily: "inherit" }}>{editingCandidate.name || "(no name)"}</h2>
              <button onClick={cancelEditCandidate} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#aaa", lineHeight: 1 }}>×</button>
            </div>
            <p style={{ margin: "0 0 20px", fontSize: 12, color: "#999", fontFamily: "monospace" }}>{editingCandidate.id}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {CANDIDATE_EDIT_FIELDS.map(f => {
                const isExpanded = expandedCandidateFields.has(f.key);
                const value = candidateEditForm[f.key] || "";
                return (
                  <div key={f.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#888" }}>
                        {f.label}
                      </label>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {/* Ballotpedia link — shows the current value as a
                            clickable link next to the field, rather than
                            replacing the editable input with one, per
                            person's request. Only shows when there's a real
                            value; doesn't try to validate it's a real URL
                            beyond a non-empty check, since staff paste these
                            by hand and a wrong value should still be
                            editable, not silently hidden. */}
                        {f.key === "ballotpediaUrl" && value.trim() && (
                          <a href={value.trim().startsWith("http") ? value.trim() : `https://${value.trim()}`} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, fontWeight: 700, color: TEAL, textDecoration: "underline" }}>
                            Open ↗
                          </a>
                        )}
                        {f.expandable && (
                          <button
                            type="button"
                            onClick={() => toggleExpandCandidateField(f.key)}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: TEAL, padding: 0 }}
                          >
                            {isExpanded ? "⤡ Collapse" : "⤢ Expand"}
                          </button>
                        )}
                      </div>
                    </div>
                    {f.type === "textarea" ? (
                      <textarea
                        value={value}
                        onChange={e => updateCandidateField(f.key, e.target.value)}
                        rows={isExpanded ? 14 : 3}
                        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", color: CHARCOAL, background: "#fff", resize: "vertical" }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={value}
                        onChange={e => updateCandidateField(f.key, e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", color: CHARCOAL, background: "#fff" }}
                      />
                    )}
                  </div>
                );
              })}

              {/* focusOrgIds toggle — enforced client-side to match
                  firestore.rules' focusOrgIdsChangeIsOwnOrgOnly(): a
                  Manager's checkbox is disabled for every org except their
                  own, so a rejected write is never the way they find out
                  they can't do something. */}
              <div style={{ marginTop: 4, padding: "12px 14px", background: "#f7f7f7", borderRadius: 8, border: "1.5px solid #e5e5e5" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#888", marginBottom: 8 }}>
                  Focus Org IDs — which orgs prioritize this candidate
                </div>
                {orgsLoading && !coalitionOrgs.length ? (
                  <div style={{ fontSize: 13, color: "#999" }}>Loading orgs…</div>
                ) : coalitionOrgs.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#999" }}>No orgs found.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {coalitionOrgs.map(org => {
                      const checked = Array.isArray(editingCandidate.focusOrgIds) && editingCandidate.focusOrgIds.includes(org.id);
                      const canToggle = canToggleFocusOrg(org.id);
                      return (
                        <label key={org.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: canToggle ? CHARCOAL : "#aaa", cursor: canToggle ? "pointer" : "not-allowed" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canToggle}
                            onChange={() => toggleCandidateFocusOrg(editingCandidate, org.id)}
                            style={{ width: 15, height: 15, accentColor: TEAL, cursor: canToggle ? "pointer" : "not-allowed" }}
                          />
                          {org.name || org.id}
                          {!canToggle && <span style={{ fontSize: 11, color: "#bbb" }}>(not your org)</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: "#999", marginTop: 8, lineHeight: 1.5 }}>
                  Blank = shows to every org as "Unassigned." A Manager can only toggle their own org; an Administrator can toggle any. Saves immediately per checkbox — not part of the Save button below.
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 22, position: "sticky", bottom: 0, background: BG, paddingTop: 12 }}>
              <button
                onClick={saveCandidateEdit}
                disabled={candidateFieldSaving}
                style={{ background: TEAL, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: candidateFieldSaving ? "not-allowed" : "pointer", opacity: candidateFieldSaving ? 0.6 : 1 }}
              >
                {candidateFieldSaving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={cancelEditCandidate}
                disabled={candidateFieldSaving}
                style={{ background: "none", color: "#888", border: "2px solid #ccc", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: candidateFieldSaving ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#999", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: CHARCOAL }}>{value}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// OrgAdminPanel — August 2026, TODO #1.
// ══════════════════════════════════════════════════════════════════════
// Deliberately a separate, self-contained component rather than a cut-down
// branch of AdminPage above. An org admin's real scope is small (their own
// org's plain members: invite one in, disable/enable one out) — building
// that as its own component keeps it auditable on its own terms instead of
// threading isOrgAdmin checks through 2,700 lines of Manager/Admin-only UI
// that was never designed with a third, more-restricted role in mind.
//
// firestore.rules is the real enforcement (scoped get/list/update on
// users/{uid}, plus manage-user.mjs and send-invite.mjs's own independent
// authorize() checks) — everything here is UX on top of that, not a
// second security boundary. A determined org admin poking the network
// tab directly still can't do anything the rules don't already allow.
//
// Explicitly NOT included here, on purpose:
//   - Research extra-org-visibility (researchOrgIds against a full org
//     picker) — the picker needs to enumerate every coalition org, but
//     orgs/{orgId}'s read rule only lets a member read THEIR OWN org's
//     doc. Building that picker for an org admin would mean either
//     loosening the orgs collection's read rule (a real cross-org
//     information-disclosure risk — other orgs' addons/credit balances
//     would become readable) or hardcoding a name list that goes stale.
//     Deferred rather than rushed; Administrators still grant this today.
//   - Role changes, org reassignment, standing/today limit overrides,
//     granting the org-admin flag itself — all remain Administrator-only,
//     both here (no controls exist) and at the rules layer (explicitly
//     excluded from the org-admin update branch).
//   - Real deletion — "remove" is disable only, matching the TODO's own
//     scoping decision.
function OrgAdminPanel() {
  const { profile: currentProfile, user: currentUser } = useAuth();
  const myOrgId = currentProfile?.orgId || null;

  const [orgName, setOrgName] = useState("");
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionUid, setActionUid] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notif, setNotif] = useState(null);
  const [inviteForm, setInviteForm] = useState({ fullName: "", email: "" });
  const [inviting, setInviting] = useState(false);

  const notify = (msg, kind = "ok") => {
    setNotif({ msg, kind });
    setTimeout(() => setNotif(null), 4000);
  };

  const fetchOrgAndMembers = async () => {
    if (!myOrgId) { setLoading(false); return; }
    setLoading(true);
    try {
      const orgSnap = await getDoc(doc(db, "orgs", myOrgId));
      setOrgName(orgSnap.exists() ? (orgSnap.data().name || myOrgId) : myOrgId);
      // Scoped query — firestore.rules' list rule for an org admin only
      // resolves when the query itself is filtered to their own orgId;
      // an unscoped query here would simply fail closed. See the rules
      // file's comment on users/{uid}'s list rule.
      const snap = await getDocs(query(collection(db, "users"), where("orgId", "==", myOrgId)));
      setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("[OrgAdminPanel] fetch failed:", err.message);
      notify("Couldn't load your org's members.", "err");
    }
    setLoading(false);
  };

  useEffect(() => { fetchOrgAndMembers(); }, [myOrgId]);

  // Disable/enable — "remove"/"re-add" a member, per the TODO's own
  // scoping decision (never real deletion). Goes through manage-user.mjs,
  // which independently re-checks the same "own org, plain member only"
  // boundary server-side — this UI only shows the button for members that
  // boundary would actually allow, so a rejected call here would mean the
  // two checks disagree, not that this is the only thing stopping misuse.
  const toggleDisabled = async (m) => {
    setActionUid(m.id);
    setActionError(null);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/.netlify/functions/manage-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, action: m.disabled ? "enable" : "disable", targetUid: m.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Action failed.");
      setMembers(prev => prev.map(x => x.id === m.id ? { ...x, disabled: !m.disabled } : x));
      notify(m.disabled ? "Member re-enabled." : "Member disabled.");
    } catch (err) {
      setActionError({ uid: m.id, message: err.message || "Action failed." });
    }
    setActionUid(null);
  };

  // "Add" a member — creates a fresh, minimal waitlist doc (status
  // "pending", same shape the public WaitlistPage.jsx form itself
  // produces, minus the social-handle fields that only matter for that
  // public-facing flow) and immediately sends the invite. send-invite.mjs
  // forces accountType:"org" and this org's own orgId server-side
  // regardless of what's sent here — this two-step create-then-invite is
  // the same real flow the Administrator Waitlist tab uses, just
  // collapsed into one action since the org is already implied.
  const inviteMember = async () => {
    const fullName = inviteForm.fullName.trim();
    const email = inviteForm.email.trim().toLowerCase();
    if (!fullName || !email) { notify("Enter a name and email first.", "err"); return; }
    setInviting(true);
    try {
      const waitlistRef = doc(collection(db, "waitlist"));
      await setDoc(waitlistRef, {
        fullName, email,
        accountType: "org",
        organization: orgName,
        status: "pending",
        submittedAt: serverTimestamp(),
      });
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/.netlify/functions/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, waitlistId: waitlistRef.id, email, fullName, accountType: "org" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to send invite.");
      await updateDoc(waitlistRef, { status: "invited", invitedAt: new Date() });
      notify(`Invite sent to ${email}.`);
      setInviteForm({ fullName: "", email: "" });
    } catch (err) {
      notify(err.message || "Failed to send invite.", "err");
    }
    setInviting(false);
  };

  if (!myOrgId) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f8f6", fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: CHARCOAL, padding: 40 }}>
        <p>Your account isn't assigned to an organization yet — an Administrator needs to set that before you can manage members.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f6", fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: CHARCOAL }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 26, marginBottom: 4 }}>Managing: {orgName}</h1>
        <p style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>
          You can invite new members into this org and disable/re-enable existing plain members. Role changes, other orgs, and Manager/Administrator accounts aren't part of this view.
        </p>

        {notif && (
          <div style={{
            marginBottom: 20, padding: "10px 16px", borderRadius: 8, fontSize: 14,
            background: notif.kind === "err" ? "#fdf2f2" : "var(--gold-light)",
            color: notif.kind === "err" ? RED : "#9a7b00",
            border: `1.5px solid ${notif.kind === "err" ? "#f5c6c6" : GOLD}`,
          }}>
            {notif.msg}
          </div>
        )}

        <div style={{ background: BG, border: "1.5px solid #ddd", borderRadius: 10, padding: "18px 22px", marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#888", marginBottom: 12 }}>
            Invite a new member
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              type="text" placeholder="Full name" value={inviteForm.fullName}
              onChange={e => setInviteForm(f => ({ ...f, fullName: e.target.value }))}
              style={{ flex: "1 1 180px", padding: "9px 12px", fontSize: 14, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", color: CHARCOAL }}
            />
            <input
              type="email" placeholder="Email address" value={inviteForm.email}
              onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
              style={{ flex: "1 1 220px", padding: "9px 12px", fontSize: 14, border: "2px solid #ccc", borderRadius: 8, fontFamily: "inherit", color: CHARCOAL }}
            />
            <button
              onClick={inviteMember}
              disabled={inviting}
              style={{ background: TEAL, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: inviting ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
            >
              {inviting ? "Sending…" : "Send Invite"}
            </button>
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#888", marginBottom: 12 }}>
          Members ({members.length})
        </div>
        {loading && <p style={{ color: "#888" }}>Loading…</p>}
        {!loading && members.length === 0 && <p style={{ color: "#888" }}>No members yet.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {members.map(m => {
            const isMe = m.id === currentUser?.uid;
            const isPlainMember = m.role === "user" && m.orgAdmin !== true;
            const isBusy = actionUid === m.id;
            const err = actionError?.uid === m.id ? actionError.message : null;
            return (
              <div key={m.id} style={{
                background: m.disabled ? "#fafafa" : BG, border: "1.5px solid #ddd", borderRadius: 8,
                padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                opacity: m.disabled ? 0.7 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                    {m.fullName || "—"} {isMe && <span style={{ fontSize: 11, color: "#999" }}>(you)</span>}
                    {m.disabled && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", background: "#eee", color: "#777", padding: "1px 6px", borderRadius: 4 }}>Disabled</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#888" }}>{m.email} · {m.role || "user"}{m.orgAdmin === true ? " · org admin" : ""}</div>
                  {err && <div style={{ fontSize: 12, color: RED, marginTop: 4 }}>{err}</div>}
                </div>
                {!isMe && isPlainMember ? (
                  <button
                    onClick={() => toggleDisabled(m)}
                    disabled={isBusy}
                    style={{
                      background: "none", border: `2px solid ${m.disabled ? TEAL : TERRACOTTA}`,
                      color: m.disabled ? TEAL : TERRACOTTA, borderRadius: 8, padding: "7px 14px",
                      fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                      cursor: isBusy ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {isBusy ? "…" : m.disabled ? "Re-enable" : "Disable"}
                  </button>
                ) : (
                  !isMe && <span style={{ fontSize: 12, color: "#aaa" }} title="Managers, Administrators, and other org admins aren't managed from this view">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
