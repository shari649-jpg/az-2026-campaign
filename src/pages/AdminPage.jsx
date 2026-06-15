import { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const GOLD       = "#F5C842";
const TEAL       = "#1D5C4A";
const TURQUOISE  = "#3ECFB2";
const CHARCOAL   = "#4A4558";
const RED        = "#c41e1e";
const TERRACOTTA = "#C1673A";
const BG         = "#ffffff";

const ROLE_OPTIONS = ["user", "manager", "administrator"];
const ROLE_COLORS  = {
  administrator: { bg: "#FFF8DC", color: TEAL,     border: GOLD },
  manager:       { bg: "#E6FAF7", color: TEAL,     border: TURQUOISE },
  user:          { bg: "#f5f5f5", color: CHARCOAL, border: "#ccc" },
};

const WAITLIST_STATUS_COLORS = {
  pending:  { bg: "#FFF8DC", color: "#8a6800", border: GOLD },
  invited:  { bg: "#E6FAF7", color: TEAL,      border: TURQUOISE },
  rejected: { bg: "#fdf2f2", color: RED,        border: "#f5c6c6" },
};

export default function AdminPage() {
  const { isAdmin, user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab]   = useState("users"); // "users" | "waitlist"
  const [users, setUsers]           = useState([]);
  const [waitlist, setWaitlist]     = useState([]);
  const [loadingUsers, setLoadingUsers]     = useState(true);
  const [loadingWaitlist, setLoadingWaitlist] = useState(true);
  const [search, setSearch]         = useState("");
  const [saving, setSaving]         = useState(null);
  const [inviting, setInviting]     = useState(null); // waitlistId being invited
  const [notif, setNotif]           = useState(null);

  useEffect(() => { if (!isAdmin) navigate("/"); }, [isAdmin]);
  useEffect(() => { if (isAdmin) { fetchUsers(); fetchWaitlist(); } }, [isAdmin]);

  const notify = (msg, type = "ok") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

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

  const handleSendInvite = async (entry) => {
    setInviting(entry.id);
    try {
      const res = await fetch("/.netlify/functions/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waitlistId: entry.id,
          email:      entry.email,
          fullName:   entry.fullName,
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

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return !q ||
      (u.fullName || "").toLowerCase().includes(q) ||
      (u.email    || "").toLowerCase().includes(q) ||
      (u.role     || "").toLowerCase().includes(q);
  });

  const filteredWaitlist = waitlist.filter(w => {
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
  };

  function formatDate(ts) {
    try {
      const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts?.seconds ? ts.seconds * 1000 : ts);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return ""; }
  }

  if (!isAdmin) return null;

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
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `2px solid #ddd`, paddingBottom: 0 }}>
          {[
            { id: "users",    label: `Registered Users (${counts.total})` },
            { id: "waitlist", label: `Waitlist (${waitlist.length})${counts.pending > 0 ? ` · ${counts.pending} pending` : ""}` },
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

        {/* Search */}
        <input
          type="search"
          placeholder={activeTab === "users" ? "Search by name, email, or role…" : "Search by name, email, or organization…"}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "13px 18px", fontSize: 16, border: "2px solid #ccc", borderRadius: 10, marginBottom: 24, fontFamily: "inherit", color: CHARCOAL, background: BG }}
        />

        {/* ── USERS TAB ── */}
        {activeTab === "users" && (
          <>
            {loadingUsers && <p style={{ textAlign: "center", padding: "60px 0", color: CHARCOAL }}>Loading users…</p>}
            {!loadingUsers && filteredUsers.length === 0 && (
              <p style={{ textAlign: "center", padding: "60px 0", color: "#888" }}>No users found.</p>
            )}
            {!loadingUsers && filteredUsers.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredUsers.map(u => {
                  const rc   = ROLE_COLORS[u.role] || ROLE_COLORS.user;
                  const isMe = u.id === currentUser?.uid;
                  return (
                    <div key={u.id} style={{
                      background: BG, border: `1.5px solid ${isMe ? GOLD : "#ddd"}`,
                      borderLeft: `5px solid ${isMe ? GOLD : rc.border}`,
                      borderRadius: 10, padding: "18px 22px",
                      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                      boxShadow: isMe ? `0 0 0 2px ${GOLD}33` : "none",
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: TEAL, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0, border: `2px solid ${GOLD}` }}>
                        {(u.fullName || u.email || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 17, fontWeight: 700, color: CHARCOAL }}>{u.fullName || "—"}</span>
                          {isMe && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: GOLD, color: TEAL, padding: "2px 8px", borderRadius: 4 }}>You</span>}

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
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
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

        {/* ── WAITLIST TAB ── */}
        {activeTab === "waitlist" && (
          <>
            {loadingWaitlist && <p style={{ textAlign: "center", padding: "60px 0", color: CHARCOAL }}>Loading waitlist…</p>}
            {!loadingWaitlist && filteredWaitlist.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <p style={{ color: "#888", fontSize: 17 }}>No waitlist entries yet.</p>
                <p style={{ color: "#aaa", fontSize: 14, marginTop: 8 }}>Entries appear when someone submits the public waitlist form at <strong>/waitlist</strong>.</p>
              </div>
            )}
            {!loadingWaitlist && filteredWaitlist.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredWaitlist.map(entry => {
                  const sc = WAITLIST_STATUS_COLORS[entry.status] || WAITLIST_STATUS_COLORS.pending;
                  const isPending  = entry.status === "pending";
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
                            {entry.status === "pending" ? "Pending" : entry.status === "invited" ? "Invited" : "Rejected"}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>{entry.email}</div>
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
                        </div>
                      </div>

                      {/* Action */}
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                        {isPending ? (
                          <button
                            onClick={() => handleSendInvite(entry)}
                            disabled={isInviting}
                            style={{
                              background: isInviting ? "#ccc" : TEAL, color: "#fff",
                              border: "none", borderRadius: 8, padding: "10px 20px",
                              fontSize: 14, fontWeight: 700, fontFamily: "inherit",
                              cursor: isInviting ? "not-allowed" : "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isInviting ? "Sending…" : "Send Invite ✉️"}
                          </button>
                        ) : (
                          <span style={{ fontSize: 13, color: "#aaa", fontStyle: "italic" }}>
                            {entry.status === "invited" ? "Invite sent" : "—"}
                          </span>
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
    </div>
  );
}
