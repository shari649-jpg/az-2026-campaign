import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadAllCampaigns, deleteCampaign } from "../../lib/campaignLibrary";

const GOLD = "#F5C842";
const GOLD_DARK = "#c9a000";
const TEAL = "#1D5C4A";
const CHARCOAL = "#4A4558";
const BG = "#ffffff";
const SURFACE = "#fffdf0";
const BORDER = "#555555";

export default function LibraryPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState("all");
  const [search, setSearch]       = useState("");
  const [notif, setNotif]         = useState(null);
  const navigate = useNavigate();

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const all = await loadAllCampaigns();
      setCampaigns(all);
    } catch {
      notify("Could not load library — please refresh.", "err");
    } finally {
      setLoading(false);
    }
  };

  const notify = (msg, type = "ok") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

  const handleDelete = async (id) => {
    try {
      await deleteCampaign(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      notify("Deleted successfully.");
    } catch {
      notify("Delete failed — please try again.", "err");
    }
  };

  const handleLoad = (c) => {
    if (c.tool === "message-machine") {
      navigate("/messaging", { state: { loadCampaign: c } });
    } else if (c.tool === "rebuttal") {
      navigate("/rebuttal", { state: { loadCampaign: c } });
    }
  };

  const fmtDate = (val) => {
    if (!val) return "";
    if (val?.toDate) return val.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return new Date(val).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const toolLabel = (tool) => tool === "message-machine" ? "Message Machine" : tool === "rebuttal" ? "Rebuttal" : tool;
  const toolColor = (tool) => tool === "message-machine" ? "#3ECFB2" : tool === "rebuttal" ? "#c41e1e" : GOLD;

  const filtered = campaigns.filter(c => {
    const matchTool = filter === "all" || c.tool === filter;
    const searchLower = search.toLowerCase();
    const matchSearch = !search ||
      (c.name || "").toLowerCase().includes(searchLower) ||
      (c.narrative || "").toLowerCase().includes(searchLower) ||
      (c.formData?.issue || "").toLowerCase().includes(searchLower);
    return matchTool && matchSearch;
  });

  const pillStyle = (active) => ({
    padding: "8px 18px",
    borderRadius: 20,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    border: `2px solid ${active ? TEAL : BORDER}`,
    background: active ? TEAL : BG,
    color: active ? "#fff" : CHARCOAL,
    fontFamily: "inherit",
    transition: "all 0.15s",
  });

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: CHARCOAL }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap');`}</style>

      {/* Toast */}
      {notif && (
        <div style={{ position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)", zIndex: 100, padding: "14px 28px", borderRadius: 10, fontSize: 17, fontWeight: 700, background: notif.type === "err" ? "#b91c1c" : TEAL, color: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.25)", whiteSpace: "nowrap" }}>
          {notif.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ background: TEAL, borderBottom: `4px solid ${GOLD}`, padding: "32px 24px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, marginBottom: 8 }}>Coalition Ops Hub</div>
          <h1 style={{ fontSize: 38, fontWeight: 900, color: "#fff", marginBottom: 8 }}>Shared Library</h1>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
            All saved campaigns from Message Machine and Rebuttal Generator — visible to all users.
          </p>
          {/* Disclaimer */}
          <div style={{ marginTop: 16, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "10px 16px", fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
            ⚠️ AI-generated content — always verify facts and claims before publishing.
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Search + Filter */}
        <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search campaigns…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: "12px 16px", fontSize: 16, border: `2px solid ${BORDER}`, borderRadius: 8, fontFamily: "inherit", color: CHARCOAL }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[["all", "All"], ["message-machine", "Message Machine"], ["rebuttal", "Rebuttal"]].map(([val, label]) => (
              <button key={val} onClick={() => setFilter(val)} style={pillStyle(filter === val)}>{label}</button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div style={{ fontSize: 15, color: "#777", marginBottom: 20 }}>
          {loading ? "Loading…" : `${filtered.length} campaign${filtered.length !== 1 ? "s" : ""}${filter !== "all" ? ` · ${toolLabel(filter)}` : ""}${search ? ` matching "${search}"` : ""}`}
        </div>

        {/* List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#888", fontSize: 20 }}>Loading shared library…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📂</div>
            <p style={{ fontSize: 22, fontWeight: 700, color: CHARCOAL, marginBottom: 8 }}>
              {campaigns.length === 0 ? "Library is empty" : "No matches found"}
            </p>
            <p style={{ fontSize: 16, color: "#888" }}>
              {campaigns.length === 0 ? "Save campaigns from Message Machine or Rebuttal Generator to see them here." : "Try a different search or filter."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {filtered.map(c => (
              <div key={c.id} style={{ background: SURFACE, border: `2px solid ${BORDER}`, borderRadius: 12, padding: 24, display: "flex", alignItems: "flex-start", gap: 20 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Tool badge + date */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 900, padding: "3px 10px", borderRadius: 20, background: toolColor(c.tool), color: "#fff", letterSpacing: "0.06em" }}>
                      {toolLabel(c.tool)}
                    </span>
                    <span style={{ fontSize: 14, color: "#888" }}>{fmtDate(c.savedAt || c.date)}</span>
                  </div>

                  {/* Name */}
                  <h3 style={{ fontSize: 20, fontWeight: 900, color: CHARCOAL, marginBottom: 8 }}>
                    {c.name || c.narrative?.substring(0, 60) || "Untitled"}
                  </h3>

                  {/* Preview */}
                  <p style={{ fontSize: 15, color: "#555", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {c.formData?.issue || c.narrative || ""}
                  </p>

                  {/* Tags */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {c.formData?.audience && <span style={{ fontSize: 13, padding: "3px 10px", background: "#f0f0f0", borderRadius: 20, border: `1px solid ${BORDER}` }}>{c.formData.audience}</span>}
                    {c.formData?.modifier && <span style={{ fontSize: 13, padding: "3px 10px", background: "#f0f0f0", borderRadius: 20, border: `1px solid ${BORDER}` }}>{c.formData.modifier}</span>}
                    {c.tone && <span style={{ fontSize: 13, padding: "3px 10px", background: "#f0f0f0", borderRadius: 20, border: `1px solid ${BORDER}` }}>{c.tone}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
                  <button onClick={() => handleLoad(c)} style={{ padding: "12px 22px", fontSize: 16, fontWeight: 700, background: GOLD, color: TEAL, border: `2px solid ${GOLD_DARK}`, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                    Load →
                  </button>
                  <button onClick={() => handleDelete(c.id)} style={{ padding: "12px 22px", fontSize: 16, fontWeight: 700, background: BG, color: "#c41e1e", border: "2px solid #c41e1e", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Return to top */}
        {filtered.length > 5 && (
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={{ display: "block", margin: "32px auto 0", padding: "12px 28px", fontSize: 16, fontWeight: 700, background: TEAL, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
            ↑ Return to Top
          </button>
        )}
      </div>
    </div>
  );
}
