// src/tools/storms/StormsHubPage.jsx
//
// Storm Chaser's Hub — ONE page for everyone.
//
// Managers/Admins land on Manager View: every storm, a "Manage Storm"
// dropdown (Storm Card / Storm Posts), a Status dropdown (Draft / Pending
// Review / Active / Archived), and a Delete button (Admin only). They can
// flip to User View to preview exactly what a Member sees.
//
// Everyone (Members, and staff previewing) sees User View: active storms
// to browse/download, PLUS a "My Storms" section for any storms they
// personally created that aren't Active yet — with a "+ New Storm" button,
// an Edit action, and a small Draft/Submit-for-Review status control. This
// is the only place a plain Member can create or manage a storm, since
// Members never see Manager View.

import { useState, useEffect } from "react";
import PostDisplayCard from "./PostDisplayCard";
import { useAuth } from "../../context/AuthContext";
import {
  loadAllStorms, loadActiveStorms, loadPosts, createStorm, updateStorm,
  setStormStatus, deleteStorm, canReview, canDelete, canManagePosts, backfillPostCount,
  alarmLabel, isStormExpired, STORM_STATUS, SUBJECT_TYPES, MEDIA_TYPES, PLATFORMS,
  PUSH_TO_STORM_KEY, PUSH_TO_STORM_TTL_MS,
} from "../../lib/stormLibrary";
import StormPostsPanel from "./StormPostsPanel";

const GOLD       = "var(--gold)";
const TEAL       = "var(--teal)";
const CHARCOAL   = "var(--charcoal)";
const TURQUOISE  = "var(--turquoise)";
const TERRACOTTA = "var(--terracotta)";
const BORDER     = "var(--border)";
const SURFACE_ALT = "var(--surface-alt)";

const STATUS_META = {
  [STORM_STATUS.DRAFT]:           { label: "Draft",           bg: "#eee",              color: "#666" },
  [STORM_STATUS.PENDING_REVIEW]:  { label: "Pending Review",  bg: "#fff3cd",           color: "#8a6d00" },
  [STORM_STATUS.ACTIVE]:          { label: "Active",          bg: "rgba(62,207,178,0.18)", color: TEAL },
  [STORM_STATUS.ARCHIVED]:        { label: "Archived",        bg: "#eee",              color: "#888" },
};

const EMPTY_FORM = {
  title: "", summary: "", description: "", hashtag: "",
  subjectType: "Coalition-wide", subjectName: "",
  alarmLevel: 1, startAt: "", expiresAt: "",
};

function fmtDateTime(v) {
  if (!v) return "—";
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (isNaN(d)) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtDateShort(v) {
  if (!v) return null;
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (isNaN(d)) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Peek-only check for a pending Message Machine push — does NOT consume the
// key. Consumption happens exactly once, later, in StormPostsPanel right
// after the new storm this form creates triggers the auto-jump-to-Posts.
// This just decides whether to open the New Storm form automatically instead
// of leaving the person to notice and click "+ New Storm" themselves.
function hasPendingStormPush() {
  try {
    const raw = localStorage.getItem(PUSH_TO_STORM_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    const age = Date.now() - new Date(payload.pushedAt).getTime();
    return age >= 0 && age <= PUSH_TO_STORM_TTL_MS;
  } catch {
    return false;
  }
}

function AlarmBadge({ level }) {
  const color = level >= 3 ? TERRACOTTA : level === 2 ? "#c99a1f" : TEAL;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 800,
      color, background: level >= 3 ? "rgba(193,103,58,0.12)" : level === 2 ? "#fff8e0" : "rgba(62,207,178,0.15)",
      border: `1.5px solid ${color}`, borderRadius: 999, padding: "3px 10px",
    }}>
      {"🔔".repeat(level)} {alarmLabel(level)}
    </span>
  );
}

// ── Status dropdown — colored to match the current status, options vary
// by role. Handles the confirm-before-unpublishing-from-Active case. ──
// Shows the post count from the denormalized field when available; falls
// back to a one-time fetch (which also backfills the field) for storms
// created before postCount existed.
function PostCountBadge({ storm }) {
  const [count, setCount] = useState(storm.postCount);
  useEffect(() => {
    if (count === undefined) backfillPostCount(storm.id).then(setCount).catch(() => setCount(0));
  }, []);
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: CHARCOAL, background: SURFACE_ALT, border: `1px solid ${BORDER}`, borderRadius: 999, padding: "3px 10px" }}>
      {count === undefined ? "…" : count} post{count === 1 ? "" : "s"}
    </span>
  );
}

function StatusControl({ storm, role, onChange }) {
  const meta = STATUS_META[storm.status] || STATUS_META[STORM_STATUS.DRAFT];
  const staffOptions = [STORM_STATUS.DRAFT, STORM_STATUS.PENDING_REVIEW, STORM_STATUS.ACTIVE, STORM_STATUS.ARCHIVED];
  const memberOptions = [STORM_STATUS.DRAFT, STORM_STATUS.PENDING_REVIEW];
  const options = canReview(role) ? staffOptions : memberOptions;

  function handleChange(e) {
    const next = e.target.value;
    if (next === storm.status) return;
    if (storm.status === STORM_STATUS.ACTIVE && next !== STORM_STATUS.ACTIVE) {
      if (!window.confirm("This will remove the storm from the live Hub members are using. Continue?")) return;
    }
    onChange(next);
  }

  return (
    <select value={storm.status} onChange={handleChange} style={{
      fontSize: 12.5, fontWeight: 800, letterSpacing: "0.03em",
      color: meta.color, background: meta.bg, border: `1.5px solid ${meta.color}`,
      borderRadius: 999, padding: "5px 10px", cursor: "pointer",
    }}>
      {options.map(s => (
        <option key={s} value={s}>
          {s === STORM_STATUS.PENDING_REVIEW ? (canReview(role) ? "Pending Review" : "Submit for Review") : STATUS_META[s].label}
        </option>
      ))}
    </select>
  );
}

// ── "Manage Storm" dropdown — Storm Card / Storm Posts, staff only. ──
function ManageStormMenu({ onCard, onPosts }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: TEAL, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px",
        fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
      }}>
        Manage Storm ▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
          <div style={{
            position: "absolute", top: "110%", right: 0, background: "#fff", border: `1.5px solid ${BORDER}`,
            borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 11, minWidth: 160, overflow: "hidden",
          }}>
            <button onClick={() => { setOpen(false); onCard(); }} style={menuItemStyle}>📋 Storm Card</button>
            <button onClick={() => { setOpen(false); onPosts(); }} style={menuItemStyle}>🖼️ Storm Posts</button>
          </div>
        </>
      )}
    </div>
  );
}
const menuItemStyle = {
  display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
  padding: "10px 16px", fontSize: 13.5, fontWeight: 600, color: CHARCOAL, cursor: "pointer",
};

// ── Shared create/edit form, used by both Manager View and a Member's
// "My Storms" section in User View. ──
function StormFormModal({ storm, role, onClose, onSaved }) {
  const isEdit = !!storm;
  const [form, setForm] = useState(storm ? {
    title: storm.title || "", summary: storm.summary || "", description: storm.description || "",
    hashtag: storm.hashtag || "", subjectType: storm.subjectType || "Coalition-wide", subjectName: storm.subjectName || "",
    alarmLevel: storm.alarmLevel || 1, startAt: storm.startAt || "", expiresAt: storm.expiresAt || "",
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function upd(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setError("A title is required."); return; }
    if (form.startAt && form.expiresAt && new Date(form.expiresAt) <= new Date(form.startAt)) {
      setError("Expiration must be after the start date/time."); return;
    }
    setSaving(true);
    try {
      let newId = null;
      if (isEdit) await updateStorm(storm.id, form);
      else newId = await createStorm(form, role);
      onSaved(newId);
    } catch (e) {
      setError("Save failed — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    // z-index bumped from 90 to 1000 (July 2026) — see StormPostsPanel.jsx
    // for why: the AppShell header (zIndex:100, including the announcement
    // ticker when active) was rendering on top of this modal's close button.
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", borderRadius: 14, padding: 28, maxWidth: 560, width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 22, color: TEAL, fontFamily: "var(--font-display)" }}>{isEdit ? "Edit Storm" : "New Storm"}</h2>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999" }}>✕</button>
        </div>

        {role === "user" && !isEdit && (
          <div style={{ background: SURFACE_ALT, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#666" }}>
            This will be created as a <strong>draft</strong>. A Manager or Administrator will review it before it goes live.
          </div>
        )}

        <Field label="Title" required>
          <input value={form.title} onChange={e => upd("title", e.target.value)} required style={inputStyle} placeholder="e.g. July 15 Water Rights Storm" />
        </Field>
        <Field label="Brief Summary" hint="Shown in the storm list — keep it to one sentence.">
          <input value={form.summary} onChange={e => upd("summary", e.target.value)} style={inputStyle} maxLength={160} placeholder="One-line description for the list view" />
        </Field>
        <Field label="Longer Description" hint="Full context and instructions — shown when a storm is opened.">
          <textarea value={form.description} onChange={e => upd("description", e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }} placeholder="Background, goals, talking points, anything members should know before posting…" />
        </Field>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Subject Type" style={{ flex: 1 }}>
            <select value={form.subjectType} onChange={e => upd("subjectType", e.target.value)} style={inputStyle}>
              {SUBJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          {form.subjectType !== "Coalition-wide" && (
            <Field label={`${form.subjectType} Name`} style={{ flex: 1 }}>
              <input value={form.subjectName} onChange={e => upd("subjectName", e.target.value)} style={inputStyle} placeholder="e.g. Katie Hobbs" />
            </Field>
          )}
        </div>
        <Field label="Hashtag" hint="Optional. No # needed — appended automatically when a member copies a post.">
          <input value={form.hashtag} onChange={e => upd("hashtag", e.target.value.replace(/^#/, ""))} style={inputStyle} placeholder="AZWaterRights" />
        </Field>
        <Field label="Urgency">
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 2, 3].map(lvl => (
              <button key={lvl} type="button" onClick={() => upd("alarmLevel", lvl)} style={{
                flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer", fontWeight: 800, fontSize: 13,
                border: `2px solid ${form.alarmLevel === lvl ? (lvl >= 3 ? TERRACOTTA : lvl === 2 ? "#c99a1f" : TEAL) : BORDER}`,
                background: form.alarmLevel === lvl ? (lvl >= 3 ? "rgba(193,103,58,0.12)" : lvl === 2 ? "#fff8e0" : "rgba(62,207,178,0.15)") : "#fff",
                color: form.alarmLevel === lvl ? (lvl >= 3 ? TERRACOTTA : lvl === 2 ? "#8a6d00" : TEAL) : "#888",
              }}>
                {"🔔".repeat(lvl)}<br />{alarmLabel(lvl)}
              </button>
            ))}
          </div>
        </Field>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Start Date & Time" style={{ flex: 1 }}>
            <input type="datetime-local" value={form.startAt} onChange={e => upd("startAt", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Expiration Date & Time" style={{ flex: 1 }}>
            <input type="datetime-local" value={form.expiresAt} onChange={e => upd("expiresAt", e.target.value)} style={inputStyle} />
          </Field>
        </div>

        {error && (
          <div style={{ background: "#fee2e2", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "10px 14px", color: "#991b1b", fontSize: 13.5 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
          <button type="button" onClick={onClose} style={{ background: "none", border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: "pointer", color: "#666" }}>Cancel</button>
          <button type="submit" disabled={saving} style={{ background: TEAL, color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", fontWeight: 800, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Storm"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function StormsHubPage() {
  const { profile, user } = useAuth();
  const role = profile?.role || "user";
  const uid = user?.uid;
  const isStaff = role === "administrator" || role === "manager";

  const [viewMode, setViewMode] = useState(isStaff ? "manager" : "user");

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px 64px", fontFamily: "var(--font-body)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, color: TEAL, margin: 0 }}>⛈️ Storm Chaser's Hub</h1>
          <p style={{ color: "#666", fontSize: 15, marginTop: 6, maxWidth: 560 }}>
            {viewMode === "manager"
              ? "Create and manage coordinated social storm campaigns."
              : "Download media and copy post text for active social storms."}
          </p>
        </div>

        {isStaff && (
          <div style={{ display: "flex", background: SURFACE_ALT, borderRadius: 999, padding: 4, flexShrink: 0 }}>
            {["manager", "user"].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                background: viewMode === mode ? TEAL : "transparent", color: viewMode === mode ? "#fff" : CHARCOAL,
                border: "none", borderRadius: 999, padding: "8px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer",
              }}>
                {mode === "manager" ? "Manager View" : "User View"}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewMode === "manager" ? <ManagerView role={role} uid={uid} /> : <UserView role={role} uid={uid} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Manager View — every storm, Manage Storm dropdown, Status dropdown, Delete
// ══════════════════════════════════════════════════════════════════════
function ManagerView({ role, uid }) {
  const [storms, setStorms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [notif, setNotif]     = useState(null);

  const [formStorm, setFormStorm] = useState(undefined); // undefined = closed, null = new, object = editing
  const [postsStorm, setPostsStorm] = useState(null);
  const [postsJustCreated, setPostsJustCreated] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => { load(); }, []);

  // Arrived here via Push-to-Storm's "Create New Storm" path — open the New
  // Storm form immediately instead of leaving the person to click it
  // themselves. The staged content stays untouched in localStorage; it's
  // only consumed later, once, by StormPostsPanel after this form's save
  // triggers the auto-jump-to-Posts.
  useEffect(() => {
    if (hasPendingStormPush()) {
      setFormStorm(null);
      notify("Picking up your pushed content — fill in the storm details below to continue.");
    }
  }, []);

  async function load() {
    setLoading(true); setError("");
    try { setStorms(await loadAllStorms()); }
    catch (e) { setError("Couldn't load storms. Check your connection and try again."); }
    finally { setLoading(false); }
  }

  function notify(msg, type = "ok") { setNotif({ msg, type }); setTimeout(() => setNotif(null), 3200); }

  async function handleStatusChange(storm, status) {
    try {
      await setStormStatus(storm.id, status, role);
      notify(
        status === STORM_STATUS.ACTIVE ? "Storm activated." :
        status === STORM_STATUS.ARCHIVED ? "Storm archived." :
        status === STORM_STATUS.PENDING_REVIEW ? "Moved to Pending Review." : "Moved to Draft."
      );
      await load();
    } catch (e) { notify(e.message || "Couldn't update status.", "error"); }
  }

  async function handleDelete(storm) {
    if (!window.confirm(`Permanently delete "${storm.title}" and all of its posts/media? This cannot be undone.`)) return;
    try { await deleteStorm(storm.id); notify("Storm deleted."); await load(); }
    catch (e) { notify("Delete failed — please try again.", "error"); }
  }

  const visibleStorms = storms.filter(s => filter === "all" ? true : s.status === filter);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={() => setFormStorm(null)} style={{
          background: TEAL, color: "#fff", border: "none", borderRadius: 10, padding: "12px 22px",
          fontWeight: 800, fontSize: 15, cursor: "pointer", whiteSpace: "nowrap",
        }}>
          + New Storm
        </button>
      </div>

      {notif && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 100,
          background: notif.type === "error" ? "#fee2e2" : "rgba(62,207,178,0.18)",
          color: notif.type === "error" ? "#991b1b" : TEAL,
          border: `1.5px solid ${notif.type === "error" ? "#fca5a5" : TURQUOISE}`,
          borderRadius: 10, padding: "12px 18px", fontSize: 14, fontWeight: 700, maxWidth: 320,
        }}>
          {notif.msg}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0 24px" }}>
        {["all", STORM_STATUS.PENDING_REVIEW, STORM_STATUS.ACTIVE, STORM_STATUS.DRAFT, STORM_STATUS.ARCHIVED].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? TEAL : "#fff", color: filter === f ? "#fff" : CHARCOAL,
            border: `1.5px solid ${filter === f ? TEAL : BORDER}`, borderRadius: 999,
            padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", textTransform: "capitalize",
          }}>
            {f === "all" ? "All" : (STATUS_META[f]?.label || f)}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>Loading storms…</p>
      ) : error ? (
        <div style={{ background: "#fee2e2", border: "1.5px solid #fca5a5", borderRadius: 10, padding: "16px 20px", color: "#991b1b" }}>{error}</div>
      ) : visibleStorms.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#999" }}>
          <p style={{ fontSize: 16 }}>No storms {filter === "all" ? "yet" : `in "${STATUS_META[filter]?.label || filter}"`}.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {visibleStorms.map(storm => (
            <div key={storm.id} style={{ background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: "18px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                    <h3 style={{ margin: 0, fontSize: 19, color: TEAL, fontFamily: "var(--font-display)" }}>{storm.title}</h3>
                    <AlarmBadge level={storm.alarmLevel || 1} />
                  </div>
                  {storm.summary && <p style={{ margin: "0 0 8px", fontSize: 14.5, color: "#444", lineHeight: 1.5 }}>{storm.summary}</p>}
                  <div style={{ fontSize: 12.5, color: "#888", display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <span>By {storm.createdBy?.displayName || storm.createdBy?.email || "Unknown"}</span>
                    <span>Created {fmtDateTime(storm.createdAt)}</span>
                    {storm.subjectType && storm.subjectType !== "Coalition-wide" && <span>{storm.subjectType}: {storm.subjectName || "—"}</span>}
                    {storm.startAt && <span>Starts {fmtDateTime(storm.startAt)}</span>}
                    {storm.expiresAt && <span>Expires {fmtDateTime(storm.expiresAt)}</span>}
                    {storm.hashtag && <span style={{ color: TURQUOISE, fontWeight: 700 }}>#{storm.hashtag}</span>}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <PostCountBadge storm={storm} />
                  <StatusControl storm={storm} role={role} onChange={(status) => handleStatusChange(storm, status)} />
                  <ManageStormMenu onCard={() => setFormStorm(storm)} onPosts={() => { setPostsJustCreated(false); setPostsStorm(storm); }} />
                  {canDelete(role) && <ActionBtn onClick={() => handleDelete(storm)} label="Delete" danger />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {formStorm !== undefined && (
        <StormFormModal
          storm={formStorm}
          role={role}
          onClose={() => setFormStorm(undefined)}
          onSaved={async (newStormId) => {
            const wasNew = formStorm === null;
            setFormStorm(undefined);
            const fresh = await loadAllStorms();
            setStorms(fresh);
            // First save of a brand-new storm — jump straight into building
            // its posts rather than leaving the admin to hunt for the button.
            if (wasNew && newStormId) {
              const created = fresh.find(s => s.id === newStormId);
              if (created) { setPostsJustCreated(true); setPostsStorm(created); }
            }
          }}
        />
      )}
      {postsStorm && <StormPostsPanel storm={postsStorm} justCreated={postsJustCreated} onClose={() => { setPostsStorm(null); setPostsJustCreated(false); }} />}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// User View — browse Active storms, download posts, copy platform texts,
// PLUS "My Storms": the only place a plain Member can create/manage a draft.
// ══════════════════════════════════════════════════════════════════════
function UserView({ role, uid }) {
  const [allStorms, setAllStorms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openStormId, setOpenStormId] = useState(null);
  const [formStorm, setFormStorm] = useState(undefined);
  const [postsStorm, setPostsStorm] = useState(null);
  const [postsJustCreated, setPostsJustCreated] = useState(false);
  const [notif, setNotif] = useState(null);

  useEffect(() => { load(); }, []);

  // Same Push-to-Storm pickup as ManagerView, for staff who happen to be in
  // User View (or a Member's own storm, in principle) when the redirect lands.
  useEffect(() => {
    if (hasPendingStormPush()) {
      setFormStorm(null);
      notify("Picking up your pushed content — fill in the storm details below to continue.");
    }
  }, []);

  async function load() {
    setLoading(true);
    try { setAllStorms(await loadAllStorms()); }
    finally { setLoading(false); }
  }

  function notify(msg, type = "ok") { setNotif({ msg, type }); setTimeout(() => setNotif(null), 3200); }

  async function handleStatusChange(storm, status) {
    try {
      await setStormStatus(storm.id, status, role);
      notify(status === STORM_STATUS.PENDING_REVIEW ? "Submitted for review." : "Moved to Draft.");
      await load();
    } catch (e) { notify(e.message || "Couldn't update status.", "error"); }
  }

  // Defensive check alongside the hourly scheduled-archive-storms.mjs sweep:
  // without this, a storm sitting past its expiresAt would still show as
  // Active to members for up to an hour until the next cron run catches it.
  const activeStorms = allStorms.filter(s => s.status === STORM_STATUS.ACTIVE && !isStormExpired(s.expiresAt));
  const myStorms = uid ? allStorms.filter(s => s.createdBy?.uid === uid && s.status !== STORM_STATUS.ACTIVE) : [];

  if (loading) return <p style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>Loading storms…</p>;

  return (
    <>
      {notif && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 100,
          background: notif.type === "error" ? "#fee2e2" : "rgba(62,207,178,0.18)",
          color: notif.type === "error" ? "#991b1b" : TEAL,
          border: `1.5px solid ${notif.type === "error" ? "#fca5a5" : TURQUOISE}`,
          borderRadius: 10, padding: "12px 18px", fontSize: 14, fontWeight: 700, maxWidth: 320,
        }}>
          {notif.msg}
        </div>
      )}

      {/* My Storms — the only place a Member can create/manage their own drafts */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, color: TEAL, margin: 0 }}>My Storms</h2>
        <button onClick={() => setFormStorm(null)} style={{
          background: TEAL, color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px",
          fontWeight: 800, fontSize: 13.5, cursor: "pointer",
        }}>
          + New Storm
        </button>
      </div>

      {myStorms.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {myStorms.map(storm => (
            <div key={storm.id} style={{ background: SURFACE_ALT, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: CHARCOAL, fontSize: 15 }}>{storm.title}</div>
                {storm.summary && <div style={{ fontSize: 13, color: "#666" }}>{storm.summary}</div>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <PostCountBadge storm={storm} />
                <StatusControl storm={storm} role={role} onChange={(status) => handleStatusChange(storm, status)} />
                <ManageStormMenu onCard={() => setFormStorm(storm)} onPosts={() => { setPostsJustCreated(false); setPostsStorm(storm); }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, color: TEAL, marginBottom: 12 }}>Active Storms</h2>

      {activeStorms.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#999" }}>
          <p style={{ fontSize: 16 }}>No active storms right now — check back soon.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {activeStorms.map(storm => (
            <UserStormCard key={storm.id} storm={storm} isOpen={openStormId === storm.id} onToggle={() => setOpenStormId(openStormId === storm.id ? null : storm.id)} />
          ))}
        </div>
      )}

      {formStorm !== undefined && (
        <StormFormModal
          storm={formStorm}
          role={role}
          onClose={() => setFormStorm(undefined)}
          onSaved={async (newStormId) => {
            const wasNew = formStorm === null;
            setFormStorm(undefined);
            const fresh = await loadAllStorms();
            setAllStorms(fresh);
            if (wasNew && newStormId) {
              const created = fresh.find(s => s.id === newStormId);
              if (created) { setPostsJustCreated(true); setPostsStorm(created); }
            }
          }}
        />
      )}
      {postsStorm && <StormPostsPanel storm={postsStorm} justCreated={postsJustCreated} onClose={() => { setPostsStorm(null); setPostsJustCreated(false); }} />}
    </>
  );
}

function UserStormCard({ storm, isOpen, onToggle }) {
  const [posts, setPosts] = useState([]);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    if (isOpen && !loadedOnce) {
      loadPosts(storm.id).then(p => { setPosts(p); setLoadedOnce(true); });
    }
  }, [isOpen]);

  const alarmColor = storm.alarmLevel >= 3 ? TERRACOTTA : storm.alarmLevel === 2 ? "#c99a1f" : TEAL;

  return (
    <div style={{ background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
      <button onClick={onToggle} style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "18px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 19, color: TEAL, fontFamily: "var(--font-display)" }}>{storm.title}</h3>
            <span style={{ fontSize: 12, fontWeight: 800, color: alarmColor, background: storm.alarmLevel >= 3 ? "rgba(193,103,58,0.12)" : storm.alarmLevel === 2 ? "#fff8e0" : "rgba(62,207,178,0.15)", border: `1.5px solid ${alarmColor}`, borderRadius: 999, padding: "2px 9px" }}>
              {"🔔".repeat(storm.alarmLevel || 1)} {alarmLabel(storm.alarmLevel)}
            </span>
            <PostCountBadge storm={storm} />
          </div>
          {storm.summary && <p style={{ margin: 0, fontSize: 14, color: "#555" }}>{storm.summary}</p>}
          {storm.expiresAt && fmtDateShort(storm.expiresAt) && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#999" }}>Expires {fmtDateShort(storm.expiresAt)}</p>}
        </div>
        <span style={{ fontSize: 20, color: "#aaa", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div style={{ borderTop: `1px solid ${BORDER}`, padding: "18px 22px", background: SURFACE_ALT }}>
          {storm.description && <p style={{ fontSize: 14, color: "#444", marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>{storm.description}</p>}
          {!loadedOnce ? (
            <p style={{ color: "#888", fontSize: 14 }}>Loading posts…</p>
          ) : posts.length === 0 ? (
            <p style={{ color: "#999", fontSize: 14 }}>No posts in this storm yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {posts.map(post => <PostDisplayCard key={post.id} post={post} hashtag={storm.hashtag} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, required, children, style }) {
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: CHARCOAL, marginBottom: 5, letterSpacing: "0.02em" }}>
        {label}{required && <span style={{ color: TERRACOTTA }}> *</span>}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11.5, color: "#999", margin: "4px 0 0" }}>{hint}</p>}
    </div>
  );
}

function ActionBtn({ onClick, label, primary, danger }) {
  const color = danger ? TERRACOTTA : primary ? TEAL : "#888";
  return (
    <button onClick={onClick} style={{
      background: primary ? TEAL : "#fff", color: primary ? "#fff" : color,
      border: `1.5px solid ${color}`, borderRadius: 8, padding: "7px 14px",
      fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    }}>
      {label}
    </button>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${BORDER}`,
  fontSize: 14.5, fontFamily: "inherit", boxSizing: "border-box",
};
