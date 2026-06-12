import { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const GOLD      = "#F5C842";
const TEAL      = "#1D5C4A";
const TURQUOISE = "#3ECFB2";
const CHARCOAL  = "#4A4558";
const RED       = "#c41e1e";
const TERRACOTTA= "#C1673A";
const BG        = "#ffffff";

const ROLE_OPTIONS = ["user", "manager", "administrator"];

const ROLE_COLORS = {
  administrator: { bg: "#FFF8DC", color: TEAL,      border: GOLD },
  manager:       { bg: "#E6FAF7", color: TEAL,      border: TURQUOISE },
  user:          { bg: "#f5f5f5", color: CHARCOAL,  border: "#ccc" },
};

export default function AdminPage() {
  const { isAdmin, user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [saving, setSaving]     = useState(null); // uid being saved
  const [notif, setNotif]       = useState(null);

  // Gate: only admins can see this page
  useEffect(() => {
    if (!isAdmin) { navigate("/"); }
  }, [isAdmin]);

  useEffect(() => { if (isAdmin) fetchUsers(); }, [isAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort: admins first, then managers, then users; alphabetically within each
      const order = { administrator: 0, manager: 1, user: 2 };
      list.sort((a, b) => {
        const ro = (order[a.role] ?? 2) - (order[b.role] ?? 2);
        if (ro !== 0) return ro;
        return (a.fullName || a.email || "").localeCompare(b.fullName || b.email || "");
      });
      setUsers(list);
    } catch (err) {
      notify("Failed to load users.", "err");
    }
    setLoading(false);
  };

  const notify = (msg, type = "ok") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

  const handleRoleChange = async (uid, newRole) => {
    setSaving(uid);
    try {
      await updateDoc(doc(db, "users", uid), { role: newRole });
      setUsers(prev => prev.map(u => u.id === uid ? { ...u, role: newRole } : u));
      notify("Role updated.");
    } catch {
      notify("Failed to update role.", "err");
    }
    setSaving(null);
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q ||
      (u.fullName || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q);
  });

  const counts = {
    total:         users.length,
    administrators: users.filter(u => u.role === "administrator").length,
    managers:       users.filter(u => u.role === "manager").length,
    users:          users.filter(u => u.role === "user" || !u.role).length,
  };

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
          <p style={{ fontSize: 17, color: "rgba(255,255,255,0.8)" }}>
            View all registered users and manage their roles.
          </p>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 20 }}>
            {[
              { label: "Total Users",     value: counts.total,          color: "#fff" },
              { label: "Administrators",  value: counts.administrators, color: GOLD },
              { label: "Managers",        value: counts.managers,       color: TURQUOISE },
              { label: "Members",         value: counts.users,          color: "rgba(255,255,255,0.7)" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "12px 20px", minWidth: 100, textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>

        {/* Search */}
        <input
          type="search"
          placeholder="Search by name, email, or role…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "13px 18px", fontSize: 16, border: `2px solid #ccc`, borderRadius: 10, marginBottom: 24, fontFamily: "inherit", color: CHARCOAL, background: BG }}
        />

        {loading && <p style={{ textAlign: "center", padding: "60px 0", color: CHARCOAL }}>Loading users…</p>}

        {!loading && filtered.length === 0 && (
          <p style={{ textAlign: "center", padding: "60px 0", color: "#888" }}>No users found.</p>
        )}

        {/* User table */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(u => {
              const rc = ROLE_COLORS[u.role] || ROLE_COLORS.user;
              const isMe = u.id === currentUser?.uid;
              return (
                <div key={u.id} style={{
                  background: BG,
                  border: `1.5px solid ${isMe ? GOLD : "#ddd"}`,
                  borderLeft: `5px solid ${isMe ? GOLD : rc.border}`,
                  borderRadius: 10,
                  padding: "18px 22px",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "wrap",
                  boxShadow: isMe ? `0 0 0 2px ${GOLD}33` : "none",
                }}>

                  {/* Avatar */}
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: TEAL, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 700, flexShrink: 0,
                    border: `2px solid ${GOLD}`,
                  }}>
                    {(u.fullName || u.email || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 17, fontWeight: 700, color: CHARCOAL }}>{u.fullName || "—"}</span>
                      {isMe && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: GOLD, color: TEAL, padding: "2px 8px", borderRadius: 4 }}>You</span>}
                    </div>
                    <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>{u.email}</div>
                    {(u.primarySocial?.handle) && (
                      <div style={{ fontSize: 12, color: TEAL, marginTop: 4, fontWeight: 600 }}>
                        {u.primarySocial.platform}: {u.primarySocial.handle}
                        {u.secondarySocial?.handle && ` · ${u.secondarySocial.platform}: ${u.secondarySocial.handle}`}
                      </div>
                    )}
                    {u.createdAt && (
                      <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                        Joined {(() => { try { const t = u.createdAt; if (t?.seconds) return new Date(t.seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); return String(t); } catch { return ""; } })()}
                        {u.googleSignIn && " · Google sign-in"}
                      </div>
                    )}
                  </div>

                  {/* Role selector */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#888" }}>Role</div>
                    <select
                      value={u.role || "user"}
                      onChange={e => handleRoleChange(u.id, e.target.value)}
                      disabled={saving === u.id}
                      style={{
                        padding: "8px 12px",
                        fontSize: 14, fontWeight: 700,
                        fontFamily: "inherit",
                        border: `2px solid ${rc.border}`,
                        borderRadius: 8,
                        background: rc.bg,
                        color: rc.color,
                        cursor: saving === u.id ? "not-allowed" : "pointer",
                        minWidth: 150,
                        appearance: "auto",
                      }}
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r} value={r}>
                          {r === "administrator" ? "Administrator" : r === "manager" ? "Manager" : "Member"}
                        </option>
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
              { role: "Member",        color: "#888",      desc: "Can use all tools. Can save and delete their own Library entries only." },
              { role: "Manager",       color: TURQUOISE,   desc: "All Member permissions. Can delete any Library entry from any user." },
              { role: "Administrator", color: GOLD,        desc: "All Manager permissions. Can access this Admin page and change user roles." },
            ].map(r => (
              <div key={r.role} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: r.color, minWidth: 110, flexShrink: 0 }}>{r.role}</span>
                <span style={{ fontSize: 13, color: CHARCOAL, lineHeight: 1.5 }}>{r.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
