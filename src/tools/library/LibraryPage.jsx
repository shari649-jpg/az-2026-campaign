import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadAllCampaigns, deleteCampaign } from "../../lib/campaignLibrary";
import { loadArticles, deleteArticle } from "../../lib/articleLibrary";
import { useAuth } from "../../context/AuthContext";

const GOLD      = "#F5C842";
const TEAL      = "#1D5C4A";
const TURQUOISE = "#3ECFB2";
const CHARCOAL  = "#4A4558";
const RED       = "#c41e1e";
const BG        = "#ffffff";
const BORDER    = "#555555";

function extractAnchorPhrase(output) {
  if (!output) return null;
  const match = output.match(/##\s*Anchor Phrase\s*\n+([\s\S]*?)(?=\n##|\n###|$)/i);
  if (!match) return null;
  const lines = match[1].trim().split("\n").filter(l => l.trim());
  return lines[0]?.replace(/^\*+|\*+$/g, "").trim() || null;
}

const TOOL_META = {
  "message-machine": { label: "Message Machine", color: TURQUOISE, emoji: "📣", path: "/messaging" },
  "rebuttal":        { label: "Rebuttal Generator", color: RED,    emoji: "🛡️", path: "/rebuttal" },
  "rapid-response":  { label: "Rapid Response",     color: TEAL,   emoji: "📡", path: "/rapid-response" },
};

export default function LibraryPage() {
  const [campaigns,  setCampaigns]  = useState([]);
  const [rrArticles, setRrArticles] = useState([]);
  const [filter,     setFilter]     = useState("all");
  const [search,     setSearch]     = useState("");
  const [notif,      setNotif]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const PAGE_SIZE = 8;
  const navigate = useNavigate();
  const { user, isManager } = useAuth();

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try { const all = await loadAllCampaigns(); setCampaigns(all); } catch {}
    try { const articles = await loadArticles(); setRrArticles(articles); } catch {}
    setLoading(false);
  };

  const notify = (msg, type = "ok") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

  // Permission check: can the current user delete this item?
  const canDelete = (item) => {
    if (isManager) return true; // Manager/Admin can delete anything
    // User can only delete their own items
    const savedUid = item.savedBy?.uid || item.savedByUid;
    return savedUid === user?.uid;
  };

  const handleDeleteCampaign = async (id, item) => {
    if (!canDelete(item)) { notify("You can only delete your own saved items.", "err"); return; }
    try {
      await deleteCampaign(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      notify("Campaign deleted.");
    } catch { notify("Delete failed — please try again.", "err"); }
  };

  const handleDeleteArticle = async (id, item) => {
    if (!canDelete(item)) { notify("You can only delete your own saved items.", "err"); return; }
    try {
      await deleteArticle(id);
      setRrArticles(prev => prev.filter(a => a.id !== id));
      notify("Article deleted.");
    } catch { notify("Delete failed — please try again.", "err"); }
  };

  const loadCampaign = (c) => {
    if (c.tool === "message-machine") {
      try { localStorage.setItem("mm_load_campaign", JSON.stringify(c)); } catch {}
      navigate("/messaging");
    } else if (c.tool === "rebuttal") {
      try { localStorage.setItem("rebuttal_load_campaign", JSON.stringify(c)); } catch {}
      navigate("/rebuttal");
    }
  };

  const loadArticleInRR = (article) => {
    const payload = {
      sourceArticleId:   article.id,
      sourceTitle:       article.title,
      sourcePublication: article.publication,
      sourceDate:        article.date,
      sourceUrl:         article.url,
      issueText: `${article.title}\n\n${article.summary}\n\nKey Points:\n${(article.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
      focalPoint: "",
      pushedAt:   new Date().toISOString(),
    };
    try {
      localStorage.setItem("rr_pending_article", JSON.stringify(payload));
      navigate("/messaging");
    } catch { notify("Could not push to Message Machine.", "err"); }
  };

  const allCampaigns = campaigns.map(c => ({ ...c, _type: "campaign" }));
  const allArticles  = rrArticles.map(a => ({ ...a, _type: "article", tool: "rapid-response" }));

  const showCampaigns = filter === "all" || filter === "message-machine" || filter === "rebuttal";
  const showArticles  = filter === "all" || filter === "rapid-response";

  const filteredCampaigns = allCampaigns.filter(c => {
    const matchTool   = filter === "all" || c.tool === filter;
    const searchLower = search.toLowerCase();
    const matchSearch = !search ||
      (c.name || "").toLowerCase().includes(searchLower) ||
      (c.formData?.issue || "").toLowerCase().includes(searchLower) ||
      (c.narrative || "").toLowerCase().includes(searchLower);
    return matchTool && matchSearch;
  });

  const filteredArticles = allArticles.filter(a => {
    const searchLower = search.toLowerCase();
    return !search ||
      (a.title || "").toLowerCase().includes(searchLower) ||
      (a.publication || "").toLowerCase().includes(searchLower) ||
      (a.summary || "").toLowerCase().includes(searchLower);
  });

  const totalShown = (showCampaigns ? filteredCampaigns.length : 0) + (showArticles ? filteredArticles.length : 0);
  const totalPages = Math.ceil(totalShown / PAGE_SIZE);
  const allItems = [
    ...(showCampaigns ? filteredCampaigns.map(c => ({ ...c, _itemType: "campaign" })) : []),
    ...(showArticles  ? filteredArticles.map(a => ({ ...a, _itemType: "article" }))   : []),
  ];
  const pageItems     = allItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageCampaigns = pageItems.filter(x => x._itemType === "campaign");
  const pageArticles  = pageItems.filter(x => x._itemType === "article");

  const pillStyle = (active) => ({
    padding: "8px 18px", borderRadius: 20, fontSize: 14, fontWeight: 700,
    cursor: "pointer", border: `2px solid ${active ? TEAL : BORDER}`,
    background: active ? TEAL : BG, color: active ? "#fff" : CHARCOAL,
    fontFamily: "inherit", transition: "all 0.15s",
  });

  const btnStyle = (color, bg = BG) => ({
    padding: "10px 18px", fontSize: 14, fontWeight: 700,
    background: bg, color, border: `2px solid ${color}`,
    borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
  });

  // Helper: display who saved an item
  const savedByLabel = (item) => {
    const name = item.savedBy?.displayName || item.savedBy?.name || item.savedByName || item.savedBy?.email;
    const uid  = item.savedBy?.uid || item.savedByUid;
    const isMe = uid === user?.uid;
    if (name) return isMe ? "Saved by you" : `Saved by ${name}`;
    return "Saved by unknown user";
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: CHARCOAL }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap'); @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>

      {notif && (
        <div style={{ position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)", zIndex: 100, padding: "14px 28px", borderRadius: 10, fontSize: 17, fontWeight: 700, background: notif.type === "err" ? RED : TEAL, color: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.25)", whiteSpace: "nowrap", animation: "fadeUp 0.2s ease" }}>
          {notif.msg}
        </div>
      )}

      <div style={{ background: TEAL, borderBottom: `4px solid ${GOLD}`, padding: "32px 24px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: GOLD, marginBottom: 8 }}>Coalition Comms Hub</div>
          <h1 style={{ fontSize: 38, fontWeight: 900, color: "#fff", marginBottom: 8 }}>Shared Library</h1>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.8)", lineHeight: 1.5 }}>
            All saved campaigns and articles from Message Machine, Rebuttal Generator, and Rapid Response.
          </p>
          {!isManager && (
            <div style={{ marginTop: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "10px 16px", fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
              🔒 You can delete your own saved items. Managers and administrators can delete any item.
            </div>
          )}
          <div style={{ marginTop: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "10px 16px", fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
            ⚠️ AI-generated content — always verify facts and claims before publishing.
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        <input
          type="search"
          placeholder="Search by title, keyword, or content..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ width: "100%", padding: "13px 18px", fontSize: 16, border: `2px solid ${BORDER}`, borderRadius: 10, marginBottom: 20, fontFamily: "inherit", color: CHARCOAL, boxSizing: "border-box" }}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
          {[
            { id: "all",             label: `All (${campaigns.length + rrArticles.length})` },
            { id: "message-machine", label: `Message Machine (${campaigns.filter(c => c.tool === "message-machine").length})` },
            { id: "rebuttal",        label: `Rebuttal (${campaigns.filter(c => c.tool === "rebuttal").length})` },
            { id: "rapid-response",  label: `Rapid Response (${rrArticles.length})` },
          ].map(f => (
            <button key={f.id} onClick={() => { setFilter(f.id); setPage(1); }} style={pillStyle(filter === f.id)}>{f.label}</button>
          ))}
        </div>

        {loading && <p style={{ textAlign: "center", color: CHARCOAL, padding: "40px 0" }}>Loading library…</p>}

        {!loading && totalShown === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: CHARCOAL }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>📂</p>
            <p style={{ fontSize: 20, fontWeight: 700 }}>{search ? "No results found" : "Nothing saved yet"}</p>
            <p style={{ fontSize: 15, marginTop: 8, color: "#888" }}>
              {search ? "Try a different search term." : "Save campaigns from Message Machine, Rebuttal Generator, or Rapid Response to see them here."}
            </p>
          </div>
        )}

        {/* Campaign cards */}
        {showCampaigns && filteredCampaigns.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            {filter === "all" && (
              <h2 style={{ fontSize: 18, fontWeight: 700, color: TEAL, marginBottom: 16, paddingBottom: 8, borderBottom: `2px solid ${GOLD}`, display: "inline-block" }}>
                Campaigns
              </h2>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {pageCampaigns.map(c => {
                const meta = TOOL_META[c.tool] || { label: c.tool, color: CHARCOAL, emoji: "📄" };
                const deletable = canDelete(c);
                const byLabel = savedByLabel(c);
                return (
                  <div key={c.id} style={{ background: "#fafaf8", border: `1.5px solid ${BORDER}`, borderLeft: `5px solid ${meta.color}`, borderRadius: 10, padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                        <span style={{ fontSize: 20 }}>{meta.emoji}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: meta.color }}>{meta.label}</span>
                      </div>
                      <p style={{ fontSize: 19, fontWeight: 700, color: CHARCOAL, marginBottom: 6 }}>{c.name || "Untitled Campaign"}</p>
                      {c.tool === "rebuttal" && (() => {
                        const anchor = extractAnchorPhrase(c.output);
                        return anchor ? (
                          <p style={{ fontSize: 13, color: TEAL, fontStyle: "italic", marginBottom: 6, borderLeft: `3px solid ${GOLD}`, paddingLeft: 10 }}>"{anchor}"</p>
                        ) : null;
                      })()}
                      {c.date && <p style={{ fontSize: 13, color: "#888" }}>Saved {c.date}</p>}
                      {byLabel && (
                        <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: TEAL, background: "#eaf6f2", border: `1px solid ${TEAL}`, borderRadius: 12, padding: "3px 10px", marginTop: 6 }}>
                          👤 {byLabel}
                        </span>
                      )}
                      {c.formData?.audience && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                          {c.formData.audience && <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", background: "#eee", borderRadius: 12 }}>{c.formData.audience}</span>}
                          {c.formData.modifier  && <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", background: "#eee", borderRadius: 12 }}>{c.formData.modifier}</span>}
                          {(c.formData.platforms || []).map(pid => (
                            <span key={pid} style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", background: meta.color + "22", color: meta.color, borderRadius: 12, border: `1px solid ${meta.color}` }}>{pid}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => loadCampaign(c)} style={btnStyle("#fff", TEAL)}>Load →</button>
                      {deletable
                        ? <button onClick={() => handleDeleteCampaign(c.id, c)} style={btnStyle(RED)}>Delete</button>
                        : <button disabled title="Only the person who saved this can delete it" style={{ ...btnStyle("#aaa", "#f5f5f5"), cursor: "not-allowed", border: "2px solid #ddd" }}>Delete</button>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rapid Response articles */}
        {showArticles && filteredArticles.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            {filter === "all" && (
              <h2
                onClick={() => navigate("/rapid-response")}
                title="Go to Rapid Response"
                style={{ fontSize: 18, fontWeight: 700, color: TEAL, marginBottom: 16, paddingBottom: 8, borderBottom: `2px solid ${GOLD}`, display: "inline-block", cursor: "pointer" }}
              >
                📡 Rapid Response Articles →
              </h2>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {pageArticles.map(a => {
                const deletable = canDelete(a);
                const byLabel = savedByLabel(a);
                return (
                  <div key={a.id} style={{ background: "#fafaf8", border: `1.5px solid ${BORDER}`, borderLeft: `5px solid ${TEAL}`, borderRadius: 10, padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 20 }}>📡</span>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL }}>Rapid Response</span>
                      </div>
                      <p style={{ fontSize: 19, fontWeight: 700, color: CHARCOAL, marginBottom: 4 }}>{a.title || "Untitled Article"}</p>
                      <p style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
                        {a.publication}{a.date ? ` · ${a.date}` : ""}{a.reporter ? ` · ${a.reporter}` : ""}
                      </p>
                      {(a.url || a.sourceUrl) && (
                        <a href={a.url || a.sourceUrl} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 13, color: TEAL, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                          View source ↗
                        </a>
                      )}
                      {a.summary && (
                        <p style={{ fontSize: 14, color: CHARCOAL, lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.summary}</p>
                      )}
                      {a.linkedCampaigns?.length > 0 && (
                        <p style={{ fontSize: 12, color: TEAL, fontWeight: 700, marginTop: 8 }}>🔗 {a.linkedCampaigns.length} campaign{a.linkedCampaigns.length !== 1 ? "s" : ""} created from this article</p>
                      )}
                      {byLabel && (
                        <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: TEAL, background: "#eaf6f2", border: `1px solid ${TEAL}`, borderRadius: 12, padding: "3px 10px", marginTop: 8 }}>
                          👤 {byLabel}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => loadArticleInRR(a)} style={btnStyle(TEAL, "#fff")}>Push to Message Machine →</button>
                      {deletable
                        ? <button onClick={() => handleDeleteArticle(a.id, a)} style={btnStyle(RED)}>Delete</button>
                        : <button disabled title="Only the person who saved this can delete it" style={{ ...btnStyle("#aaa", "#f5f5f5"), cursor: "not-allowed", border: "2px solid #ddd" }}>Delete</button>
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, margin: "32px 0 16px", flexWrap: "wrap" }}>
            <button onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={page === 1}
              style={{ padding: "10px 20px", fontWeight: 700, fontSize: 15, borderRadius: 8, border: `2px solid ${page === 1 ? "#ccc" : TEAL}`, background: page === 1 ? "#f5f5f5" : BG, color: page === 1 ? "#aaa" : TEAL, cursor: page === 1 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              ← Prev
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, color: CHARCOAL }}>Page {page} of {totalPages} &nbsp;·&nbsp; {totalShown} item{totalShown !== 1 ? "s" : ""}</span>
            <button onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={page === totalPages}
              style={{ padding: "10px 20px", fontWeight: 700, fontSize: 15, borderRadius: 8, border: `2px solid ${page === totalPages ? "#ccc" : TEAL}`, background: page === totalPages ? "#f5f5f5" : BG, color: page === totalPages ? "#aaa" : TEAL, cursor: page === totalPages ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              Next →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
