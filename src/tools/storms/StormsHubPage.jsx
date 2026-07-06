// src/tools/storms/StormsHubPage.jsx
//
// Storm Chasers Hub — the admin/manager/member workspace for creating and
// managing social-storm campaigns (the container object: title, dates,
// alarm rating, review workflow). The member-facing consumption view (the
// Storm Chaser's Vault — download video, copy platform text) is a separate
// page built against the entries subcollection in the next build phase.

import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  loadAllStorms, createStorm, updateStorm, setStormStatus, deleteStorm,
  canReview, canArchive, canDelete, canEdit, alarmLabel,
  STORM_STATUS, SUBJECT_TYPES,
} from "../../lib/stormLibrary";

const GOLD       = "#F5C842";
const TEAL       = "#1D5C4A";
const CHARCOAL   = "#4A4558";
const TURQUOISE  = "#3ECFB2";
const TERRACOTTA = "#C1673A";
const BORDER     = "#C8C4BC";
const SURFACE_ALT = "#F3F4F0";

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

function fmtDate(v) {
  if (!v) return "—";
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (isNaN(d)) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
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

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META[STORM_STATUS.DRAFT];
  return (
    <span style={{
      fontSize: 11, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
      color: m.color, background: m.bg, borderRadius: 6, padding: "3px 9px",
    }}>
      {m.label}
    </span>
  );
}

export default function StormsHubPage() {
  const { profile, user } = useAuth();
  const role = profile?.role || "user";
  const uid = user?.uid;

  const [storms, setStorms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [notif, setNotif]     = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [filter, setFilter] = useState("all"); // all | draft | pending_review | active | archived

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      setStorms(await loadAllStorms());
    } catch (e) {
      setError("Couldn't load storms. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function notify(msg, type = "ok") { setNotif({ msg, type }); setTimeout(() => setNotif(null), 3200); }

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormOpen(true);
  }

  function openEdit(storm) {
    setForm({
      title: storm.title || "",
      summary: storm.summary || "",
      description: storm.description || "",
      hashtag: storm.hashtag || "",
      subjectType: storm.subjectType || "Coalition-wide",
      subjectName: storm.subjectName || "",
      alarmLevel: storm.alarmLevel || 1,
      startAt: storm.startAt || "",
      expiresAt: storm.expiresAt || "",
    });
    setEditingId(storm.id);
    setFormOpen(true);
  }

  function upd(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { notify("A title is required.", "error"); return; }
    if (form.startAt && form.expiresAt && new Date(form.expiresAt) <= new Date(form.startAt)) {
      notify("Expiration must be after the start date/time.", "error"); return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateStorm(editingId, form);
        notify("Storm updated.");
      } else {
        await createStorm(form, role);
        notify(role === "user" ? "Draft created — a Manager or Admin will review it." : "Storm created.");
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      notify("Save failed — please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(storm, status) {
    try {
      await setStormStatus(storm.id, status, role);
      notify(
        status === STORM_STATUS.ACTIVE ? "Storm approved and activated." :
        status === STORM_STATUS.ARCHIVED ? "Storm archived." :
        status === STORM_STATUS.PENDING_REVIEW ? "Sent back for review." : "Status updated."
      );
      await load();
    } catch (e) {
      notify(e.message || "Couldn't update status.", "error");
    }
  }

  async function handleDelete(storm) {
    if (!window.confirm(`Permanently delete "${storm.title}"? This cannot be undone.`)) return;
    try {
      await deleteStorm(storm.id);
      notify("Storm deleted.");
      await load();
    } catch (e) {
      notify("Delete failed — please try again.", "error");
    }
  }

  const visibleStorms = storms.filter(s => filter === "all" ? true : s.status === filter);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 20px 64px", fontFamily: "var(--font-body)" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, color: TEAL, margin: 0 }}>⛈️ Storm Chasers Hub</h1>
          <p style={{ color: "#666", fontSize: 15, marginTop: 6, maxWidth: 560 }}>
            Create and manage coordinated social storm campaigns. Approved storms appear to members in the Storm Chaser's Vault.
          </p>
        </div>
        <button onClick={openCreate} style={{
          background: TEAL, color: "#fff", border: "none", borderRadius: 10, padding: "12px 22px",
          fontWeight: 800, fontSize: 15, cursor: "pointer", whiteSpace: "nowrap",
        }}>
          + New Storm
        </button>
      </div>

      {/* Notification toast */}
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

      {/* Filter tabs */}
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

      {/* List */}
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
            <div key={storm.id} style={{
              background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: "18px 22px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                    <h3 style={{ margin: 0, fontSize: 19, color: TEAL, fontFamily: "var(--font-display)" }}>{storm.title}</h3>
                    <StatusBadge status={storm.status} />
                    <AlarmBadge level={storm.alarmLevel || 1} />
                  </div>
                  {storm.summary && <p style={{ margin: "0 0 8px", fontSize: 14.5, color: "#444", lineHeight: 1.5 }}>{storm.summary}</p>}
                  <div style={{ fontSize: 12.5, color: "#888", display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <span>By {storm.createdBy?.displayName || storm.createdBy?.email || "Unknown"}</span>
                    <span>Created {fmtDate(storm.createdAt)}</span>
                    {storm.subjectType && storm.subjectType !== "Coalition-wide" && (
                      <span>{storm.subjectType}: {storm.subjectName || "—"}</span>
                    )}
                    {storm.startAt && <span>Starts {fmtDate(storm.startAt)}</span>}
                    {storm.expiresAt && <span>Expires {fmtDate(storm.expiresAt)}</span>}
                    {storm.hashtag && <span style={{ color: TURQUOISE, fontWeight: 700 }}>#{storm.hashtag}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                  {canEdit(role, storm, uid) && (
                    <ActionBtn onClick={() => openEdit(storm)} label="Edit" />
                  )}
                  {storm.status === STORM_STATUS.DRAFT && role === "user" && storm.createdBy?.uid === uid && (
                    <ActionBtn onClick={() => handleStatusChange(storm, STORM_STATUS.PENDING_REVIEW)} label="Submit for Review" primary />
                  )}
                  {storm.status === STORM_STATUS.PENDING_REVIEW && canReview(role) && (
                    <>
                      <ActionBtn onClick={() => handleStatusChange(storm, STORM_STATUS.ACTIVE)} label="Approve & Activate" primary />
                      <ActionBtn onClick={() => handleStatusChange(storm, STORM_STATUS.DRAFT)} label="Send Back" />
                    </>
                  )}
                  {storm.status === STORM_STATUS.ACTIVE && canArchive(role) && (
                    <ActionBtn onClick={() => handleStatusChange(storm, STORM_STATUS.ARCHIVED)} label="Archive" />
                  )}
                  {storm.status === STORM_STATUS.ARCHIVED && canReview(role) && (
                    <ActionBtn onClick={() => handleStatusChange(storm, STORM_STATUS.ACTIVE)} label="Reactivate" />
                  )}
                  {canDelete(role) && (
                    <ActionBtn onClick={() => handleDelete(storm)} label="Delete" danger />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit form panel */}
      {formOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 90,
          display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto",
        }} onClick={(e) => { if (e.target === e.currentTarget) setFormOpen(false); }}>
          <form onSubmit={handleSubmit} style={{
            background: "#fff", borderRadius: 14, padding: 28, maxWidth: 560, width: "100%",
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 22, color: TEAL, fontFamily: "var(--font-display)" }}>
                {editingId ? "Edit Storm" : "New Storm"}
              </h2>
              <button type="button" onClick={() => setFormOpen(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999" }}>✕</button>
            </div>

            {role === "user" && !editingId && (
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

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <button type="button" onClick={() => setFormOpen(false)} style={{ background: "none", border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: "pointer", color: "#666" }}>
                Cancel
              </button>
              <button type="submit" disabled={saving} style={{
                background: TEAL, color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px",
                fontWeight: 800, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1,
              }}>
                {saving ? "Saving…" : editingId ? "Save Changes" : "Create Storm"}
              </button>
            </div>
          </form>
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
