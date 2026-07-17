import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  loadAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  findOverlapping,
  canManageAnnouncements,
} from "../lib/announcementLibrary";

const TEAL       = "var(--teal)";
const GOLD       = "var(--gold)";
const TURQUOISE  = "var(--turquoise)";
const CHARCOAL   = "var(--charcoal)";
const TERRACOTTA = "var(--terracotta)";
const RED        = "#c41e1e";
const BG         = "var(--bg)";

const MAX_LEN = 220; // keeps the header ticker readable — it scrolls, but shouldn't take forever to loop

// Firestore Timestamp | Date | undefined -> millis, safely
function toMillis(v) {
  if (!v) return 0;
  return v.toMillis ? v.toMillis() : new Date(v).getTime();
}

// <input type="datetime-local"> works in the browser's local time and has
// no timezone info of its own — new Date(str) below interprets that string
// in the browser's local zone, which is what we want since staff scheduling
// these are thinking in their own local clock, not UTC.
function toDatetimeLocalValue(millis) {
  if (!millis) return "";
  const d = new Date(millis);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusOf(a, now) {
  const start = toMillis(a.startAt);
  const end = toMillis(a.endAt);
  if (now < start) return "upcoming";
  if (now > end) return "past";
  return "active";
}

const STATUS_STYLES = {
  active:   { label: "Active now", bg: "#E6FAF7", color: TEAL, border: TURQUOISE },
  upcoming: { label: "Upcoming",   bg: "#FFF8DC", color: TEAL, border: GOLD },
  past:     { label: "Past",       bg: "#f5f5f5", color: CHARCOAL, border: "#ccc" },
};

export default function AnnouncementsPage() {
  const { role, isManager } = useAuth();
  const navigate = useNavigate();

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [text, setText] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [overlapWarning, setOverlapWarning] = useState(null); // array of overlapping announcements, or null
  const [notif, setNotif] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    if (!isManager) navigate("/");
  }, [isManager]);

  useEffect(() => {
    if (isManager) loadAll();
  }, [isManager]);

  const notify = (msg, type = "ok") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

  async function loadAll() {
    setLoading(true);
    try {
      const all = await loadAllAnnouncements();
      setAnnouncements(all);
    } catch {
      notify("Couldn't load announcements.", "err");
    }
    setLoading(false);
  }

  function openNewForm() {
    setEditingId(null);
    setText("");
    setStartLocal("");
    setEndLocal("");
    setFormError("");
    setOverlapWarning(null);
    setFormOpen(true);
  }

  function openEditForm(a) {
    setEditingId(a.id);
    setText(a.text || "");
    setStartLocal(toDatetimeLocalValue(toMillis(a.startAt)));
    setEndLocal(toDatetimeLocalValue(toMillis(a.endAt)));
    setFormError("");
    setOverlapWarning(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
  }

  // Re-check for overlaps live as the person edits the form, rather than
  // only at submit time — cheaper to see the warning before you hit Save.
  useEffect(() => {
    if (!formOpen || !startLocal || !endLocal) { setOverlapWarning(null); return; }
    const s = new Date(startLocal);
    const e = new Date(endLocal);
    if (isNaN(s) || isNaN(e) || e <= s) { setOverlapWarning(null); return; }
    const overlaps = findOverlapping(announcements, s, e, editingId);
    setOverlapWarning(overlaps.length ? overlaps : null);
  }, [startLocal, endLocal, formOpen, announcements, editingId]);

  async function handleSave(e) {
    e.preventDefault();
    setFormError("");

    if (!text.trim()) { setFormError("Please enter the message text."); return; }
    if (text.trim().length > MAX_LEN) { setFormError(`Keep it under ${MAX_LEN} characters — it scrolls across the header.`); return; }
    if (!startLocal || !endLocal) { setFormError("Please set both a start and end date/time."); return; }

    const startAt = new Date(startLocal);
    const endAt = new Date(endLocal);
    if (isNaN(startAt) || isNaN(endAt)) { setFormError("Invalid date/time."); return; }
    if (endAt <= startAt) { setFormError("End must be after start."); return; }

    setSaving(true);
    try {
      if (editingId) {
        await updateAnnouncement(editingId, { text, startAt, endAt });
        notify("Announcement updated.");
      } else {
        await createAnnouncement({ text, startAt, endAt });
        notify("Announcement scheduled.");
      }
      closeForm();
      await loadAll();
    } catch {
      setFormError("Couldn't save — please try again.");
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    try {
      await deleteAnnouncement(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      notify("Announcement deleted.");
    } catch {
      notify("Couldn't delete — please try again.", "err");
    }
    setConfirmDeleteId(null);
  }

  if (!isManager) return null;

  const now = Date.now();
  const sections = [
    { key: "active", title: "Active Now" },
    { key: "upcoming", title: "Upcoming" },
    { key: "past", title: "Past" },
  ].map((s) => ({
    ...s,
    items: announcements.filter((a) => statusOf(a, now) === s.key),
  }));

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f6", fontFamily: "var(--font-body)", color: CHARCOAL }}>
      {notif && (
        <div style={{
          position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)", zIndex: 100,
          padding: "14px 28px", borderRadius: 10, fontSize: 15, fontWeight: 700,
          background: notif.type === "err" ? RED : TEAL, color: "#fff",
          boxShadow: "0 4px 24px rgba(0,0,0,0.25)", whiteSpace: "nowrap",
        }}>
          {notif.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ background: TEAL, borderBottom: `4px solid ${GOLD}`, padding: "32px 24px 28px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, marginBottom: 8 }}>
            Coalition Comms Hub
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 900, color: "#fff", marginBottom: 8 }}>
            Announcements
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.8)" }}>
            Schedule a message to scroll across the site header between a start and end date/time. Only one shows at a time.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 24px 60px" }}>

        {!formOpen && (
          <button
            onClick={openNewForm}
            style={{ ...primaryBtnStyle, width: "auto", padding: "12px 24px", marginBottom: 24 }}
          >
            + New Announcement
          </button>
        )}

        {formOpen && (
          <section style={{ ...cardStyle, marginBottom: 24 }}>
            <h2 style={sectionTitleStyle}>{editingId ? "Edit Announcement" : "New Announcement"}</h2>
            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle}>Message</label>
                <textarea
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="e.g. Early voting begins Monday — check your polling location before then."
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <p style={hintStyle}>{text.length}/{MAX_LEN} characters</p>
              </div>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <label style={labelStyle}>Starts</label>
                  <input
                    type="datetime-local"
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <label style={labelStyle}>Ends</label>
                  <input
                    type="datetime-local"
                    value={endLocal}
                    onChange={(e) => setEndLocal(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              {overlapWarning && (
                <div style={warnBoxStyle}>
                  ⚠️ Overlaps {overlapWarning.length} other scheduled announcement{overlapWarning.length > 1 ? "s" : ""} — whichever was created most recently will be the one that actually displays during the overlap.
                </div>
              )}

              {formError && <div style={errBoxStyle}>{formError}</div>}

              <div style={{ display: "flex", gap: 12 }}>
                <button type="submit" disabled={saving}
                  style={{ ...primaryBtnStyle, opacity: saving ? 0.7 : 1, cursor: saving ? "not-allowed" : "pointer" }}>
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Schedule It"}
                </button>
                <button type="button" onClick={closeForm}
                  style={{ ...secondaryBtnStyle }}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        {loading && <p style={{ textAlign: "center", padding: "40px 0", color: "#888" }}>Loading…</p>}

        {!loading && sections.map((s) => (
          s.items.length === 0 ? null : (
            <section key={s.key} style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL, marginBottom: 12 }}>
                {s.title} ({s.items.length})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {s.items.map((a) => {
                  const st = STATUS_STYLES[statusOf(a, now)];
                  return (
                    <div key={a.id} style={cardStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <span style={{
                            display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                            textTransform: "uppercase", background: st.bg, color: st.color,
                            border: `1.5px solid ${st.border}`, borderRadius: 6, padding: "3px 10px", marginBottom: 8,
                          }}>
                            {st.label}
                          </span>
                          <p style={{ fontSize: 16, color: CHARCOAL, marginBottom: 8, lineHeight: 1.5 }}>{a.text}</p>
                          <p style={{ fontSize: 13, color: "#888" }}>
                            {new Date(toMillis(a.startAt)).toLocaleString()} → {new Date(toMillis(a.endAt)).toLocaleString()}
                          </p>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                          <button onClick={() => openEditForm(a)} style={smallBtnStyle}>Edit</button>
                          {confirmDeleteId === a.id ? (
                            <>
                              <button onClick={() => handleDelete(a.id)} style={{ ...smallBtnStyle, color: RED, borderColor: RED }}>Confirm</button>
                              <button onClick={() => setConfirmDeleteId(null)} style={smallBtnStyle}>Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setConfirmDeleteId(a.id)} style={{ ...smallBtnStyle, color: RED, borderColor: "#f5c6c6" }}>Delete</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )
        ))}

        {!loading && announcements.length === 0 && (
          <p style={{ textAlign: "center", padding: "40px 0", color: "#888" }}>No announcements yet.</p>
        )}
      </div>
    </div>
  );
}

const cardStyle = {
  background: BG, border: "2px solid #e8e8e4", borderRadius: 12,
  padding: "20px 24px",
};

const sectionTitleStyle = {
  fontFamily: "var(--font-display)", fontSize: 19, color: TEAL,
  marginTop: 0, marginBottom: 18,
};

const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase",
  color: CHARCOAL, marginBottom: 6,
};

const hintStyle = { fontSize: 12, color: "#888", marginTop: 6, marginBottom: 0 };

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "11px 14px",
  fontSize: 15, fontFamily: "var(--font-body)",
  border: "2px solid var(--border)", borderRadius: 8,
  background: BG, color: CHARCOAL,
  outline: "none",
};

const primaryBtnStyle = {
  background: TEAL, color: "#fff",
  border: "none", borderRadius: 8, padding: "13px 0",
  fontSize: 15, fontWeight: 700, fontFamily: "var(--font-body)",
  letterSpacing: "0.04em", width: "100%", cursor: "pointer",
};

const secondaryBtnStyle = {
  background: "#fff", color: CHARCOAL,
  border: "2px solid var(--border)", borderRadius: 8, padding: "12px 24px",
  fontSize: 15, fontWeight: 700, fontFamily: "var(--font-body)",
  cursor: "pointer",
};

const smallBtnStyle = {
  background: "none", border: `1.5px solid ${TEAL}`, color: TEAL,
  borderRadius: 6, padding: "6px 14px", fontSize: 13, fontWeight: 700,
  fontFamily: "var(--font-body)", cursor: "pointer",
};

const warnBoxStyle = {
  background: "#FFF8DC", border: "1px solid #F5C842",
  borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#8a6800",
};

const errBoxStyle = {
  background: "#fdf2f2", border: "1px solid #f5c6c6",
  borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c41e1e",
};
