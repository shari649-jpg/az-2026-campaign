import { useState, useEffect } from "react";
import { Inflate } from "fflate";
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
  const [cnFiles, setCnFiles]        = useState([]);
  const [cnParsing, setCnParsing]   = useState(false);
  const [cnPreview, setCnPreview]   = useState(null); // { count, totalR, totalD }
  const [cnParsed, setCnParsed]     = useState(null); // full parsed payload
  const [cnUploading, setCnUploading] = useState(false);
  const [cnDone, setCnDone]         = useState(false);
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
      const millis  = parseInt(cols[idx.createdAt]) || 0;
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
    const wkMap = {};
    let totalR = 0, totalD = 0;
    const repNar = {}, demNar = {};
    notes.forEach(n => {
      if (!wkMap[n.weekLbl]) wkMap[n.weekLbl] = { label: n.weekLbl, r: 0, d: 0 };
      if (n.side === "R" || n.side === "both") { wkMap[n.weekLbl].r++; totalR++; }
      if (n.side === "D" || n.side === "both") { wkMap[n.weekLbl].d++; totalD++; }
      n.narratives.forEach(nar => {
        if (n.side === "R" || n.side === "both") repNar[nar] = (repNar[nar] || 0) + 1;
        if (n.side === "D" || n.side === "both") demNar[nar] = (demNar[nar] || 0) + 1;
      });
    });
    const weeklyData = Object.values(wkMap)
      .sort((a, b) => { const p = s => { const x = s.split("/"); return parseInt(x[0]) * 100 + parseInt(x[1]); }; return p(a.label) - p(b.label); })
      .slice(-8);
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
          const millis = parseInt(cols[headers.createdAt]) || 0;
          notes.push({
            noteId: cols[headers.noteId] || String(notes.length),
            summary, side,
            date: millis ? new Date(millis).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
            weekLbl: millis ? weekLabel(millis) : "Unknown",
            narratives: detectNarratives(summary),
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
        const millis = parseInt(cols[headers.createdAt]) || 0;
        notes.push({
          noteId: cols[headers.noteId] || String(notes.length),
          summary, side,
          date: millis ? new Date(millis).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
          weekLbl: millis ? weekLabel(millis) : "Unknown",
          narratives: detectNarratives(summary),
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
      // Stats are calculated from ALL notes (full accuracy).
      // For the browseable card list we sample 2500 notes evenly across the dataset
      // to stay under Netlify's 6MB function body limit.
      const MAX_DISPLAY = 2500;
      const notes = cnParsed.notes;
      let displayNotes;
      if (notes.length <= MAX_DISPLAY) {
        displayNotes = notes;
      } else {
        // Sample evenly — take every Nth note
        const step = Math.floor(notes.length / MAX_DISPLAY);
        displayNotes = notes.filter((_, i) => i % step === 0).slice(0, MAX_DISPLAY);
      }

      const res = await fetch("/.netlify/functions/upload-community-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: displayNotes,
          stats: cnParsed.stats,
          count: cnParsed.count, // real total count, not just display sample
          uploadedAt: new Date().toISOString(),
        }),
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
          { id: "community-notes", label: "Community Notes Upload" },
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
                  <div style={{ fontSize: 13, color: "#666" }}>{cnPreview?.count.toLocaleString()} notes are now live on the Misinfo Monitor.</div>
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
                  <li>Done — the Misinfo Monitor dashboard updates instantly</li>
                </ol>
              </div>
            </div>
          </div>
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
