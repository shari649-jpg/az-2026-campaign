import { useState, useEffect } from "react";
import { saveArticle, loadArticles, deleteArticle } from "../../lib/articleLibrary";
import { auth } from "../../firebase";

// ── Brand Colors ─────────────────────────────────────────────────────────────
const B = {
  gold:       "#F5C842",
  teal:       "#1D5C4A",
  tealLight:  "#2a7a62",
  charcoal:   "#4A4558",
  turquoise:  "#3ECFB2",
  terracotta: "#C1673A",
  pageBg:     "#FAFAF7",
  surface:    "#FFFFFF",
  surfaceAlt: "#F3F4F0",
  border:     "#C8C4BC",
  borderStrong: "#1D5C4A",
  text:       "#1A1A1A",
  textMid:    "#4A4558",
  textMute:   "#888580",
};

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=DM+Serif+Display:ital@0;1&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: ${B.pageBg}; color: ${B.text}; }
  textarea, input, button, select { font-family: 'Atkinson Hyperlegible', Georgia, serif; }
  textarea:focus, input:focus, select:focus {
    outline: 3px solid ${B.turquoise} !important;
    outline-offset: 2px;
    border-color: ${B.teal} !important;
  }
  button:focus { outline: 3px solid ${B.turquoise}; outline-offset: 3px; }
  button:active { transform: scale(0.97); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  .spin { animation: spin 0.9s linear infinite; display:inline-block; }
  .fade-up { animation: fadeUp 0.3s ease; }
  .pulse { animation: pulse 1.5s ease infinite; }
  ::selection { background: ${B.gold}; color: ${B.teal}; }
`;

// ── Shared styles ─────────────────────────────────────────────────────────────
const S = {
  card: {
    background: B.surface,
    border: `1.5px solid ${B.border}`,
    borderRadius: 12,
    padding: 24,
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: B.textMid,
    marginBottom: 8,
  },
  input: {
    width: "100%",
    background: B.surface,
    border: `1.5px solid ${B.border}`,
    borderRadius: 8,
    padding: "12px 16px",
    color: B.text,
    fontSize: 16,
    lineHeight: 1.5,
    fontFamily: "inherit",
  },
  textarea: {
    width: "100%",
    background: B.surface,
    border: `1.5px solid ${B.border}`,
    borderRadius: 8,
    padding: "12px 16px",
    color: B.text,
    fontSize: 15,
    lineHeight: 1.6,
    fontFamily: "inherit",
    resize: "vertical",
  },
  btnPrimary: {
    background: B.teal,
    color: "#fff",
    fontWeight: 700,
    padding: "13px 24px",
    borderRadius: 8,
    border: `2px solid ${B.tealLight}`,
    cursor: "pointer",
    fontSize: 16,
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  btnSecondary: {
    background: B.surface,
    color: B.teal,
    fontWeight: 700,
    padding: "11px 20px",
    borderRadius: 8,
    border: `1.5px solid ${B.teal}`,
    cursor: "pointer",
    fontSize: 15,
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  btnGold: {
    background: B.gold,
    color: B.teal,
    fontWeight: 700,
    padding: "13px 24px",
    borderRadius: 8,
    border: `2px solid #d4aa30`,
    cursor: "pointer",
    fontSize: 16,
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  btnSmall: {
    background: "transparent",
    color: B.textMid,
    fontWeight: 700,
    padding: "7px 14px",
    borderRadius: 6,
    border: `1px solid ${B.border}`,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "inherit",
  },
  spinner: {
    width: 18,
    height: 18,
    flexShrink: 0,
    border: "2.5px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
  },
  sectionHead: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: B.teal,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: `2px solid ${B.gold}`,
    display: "inline-block",
  },
};

// ── Error screen ──────────────────────────────────────────────────────────────
function ScrapeError({ url, onManualEntry, onTryAgain }) {
  return (
    <div className="fade-up" style={{ ...S.card, borderColor: "#e8c4a0", borderWidth: 2, background: "#fffbf7" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: "#fdebd0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 22 }}>⚠️</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: B.terracotta, marginBottom: 6 }}>
            Couldn't read that page
          </p>
          <p style={{ fontSize: 15, color: B.textMid, lineHeight: 1.6, marginBottom: 16 }}>
            This happens when a site blocks automated access, requires a login, or uses a paywall.
            You can still create messages from this article — just paste the text directly below.
          </p>
          <p style={{ fontSize: 13, color: B.textMute, marginBottom: 20, fontFamily: "monospace", background: B.surfaceAlt, padding: "6px 10px", borderRadius: 6, wordBreak: "break-all" }}>
            {url}
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={onManualEntry} style={{ ...S.btnGold, fontSize: 15 }}>
              ✏️ Paste article text manually
            </button>
            <button onClick={onTryAgain} style={{ ...S.btnSecondary, fontSize: 15 }}>
              ↺ Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Manual entry fallback ─────────────────────────────────────────────────────
function ManualEntry({ url, onAnalyze, onCancel }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [pub, setPub] = useState("");
  const [date, setDate] = useState("");
  const [reporter, setReporter] = useState("");

  return (
    <div className="fade-up" style={{ ...S.card, borderColor: B.gold, borderWidth: 2 }}>
      <p style={S.sectionHead}>Manual Article Entry</p>
      <p style={{ fontSize: 15, color: B.textMid, marginBottom: 20, lineHeight: 1.6 }}>
        Paste the article text below. Fill in as much publication info as you know — anything left blank will be marked unknown.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <label style={S.label}>Article Title</label>
          <input style={S.input} placeholder="e.g. APS rate hike protests..." value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label style={S.label}>Publication</label>
          <input style={S.input} placeholder="e.g. Arizona Capitol Times" value={pub} onChange={e => setPub(e.target.value)} />
        </div>
        <div>
          <label style={S.label}>Reporter</label>
          <input style={S.input} placeholder="e.g. Reagan Priest" value={reporter} onChange={e => setReporter(e.target.value)} />
        </div>
        <div>
          <label style={S.label}>Date</label>
          <input style={S.input} type="text" placeholder="e.g. May 19, 2026" value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={S.label}>Article Text <span style={{ color: B.terracotta }}>*</span></label>
        <textarea
          rows={10}
          style={S.textarea}
          placeholder="Paste the full article text here..."
          value={text}
          onChange={e => setText(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={() => onAnalyze({ text, title, pub, date, reporter, url, isManual: true })}
          disabled={!text.trim()}
          style={{ ...S.btnPrimary, opacity: text.trim() ? 1 : 0.5, cursor: text.trim() ? "pointer" : "not-allowed" }}
        >
          Analyze Article →
        </button>
        <button onClick={onCancel} style={S.btnSecondary}>Cancel</button>
      </div>
    </div>
  );
}

// ── Article result card ───────────────────────────────────────────────────────
function ArticleResult({ article, onSave, onPushToMachine, saved, pushed }) {
  const [copied, setCopied] = useState(null);

  const copyText = async (text, key) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const Section = ({ label, children, id }) => (
    <div style={{ marginBottom: 28 }}>
      <p style={S.sectionHead}>{label}</p>
      {children}
    </div>
  );

  const Quote = ({ text, speaker, idx }) => (
    <div style={{
      borderLeft: `3px solid ${B.gold}`,
      paddingLeft: 16,
      marginBottom: 14,
      background: B.surfaceAlt,
      borderRadius: "0 8px 8px 0",
      padding: "12px 16px",
      cursor: "pointer",
      position: "relative",
    }}
      onClick={() => copyText(text, `q${idx}`)}
      title="Click to copy"
    >
      <p style={{ fontSize: 15, color: B.textMid, lineHeight: 1.7, fontStyle: "italic" }}>"{text}"</p>
      {speaker && (
        <p style={{ fontSize: 13, fontWeight: 700, color: B.teal, marginTop: 6 }}>
          — {speaker}
        </p>
      )}
      {copied === `q${idx}` && (
        <span style={{ position: "absolute", top: 10, right: 12, fontSize: 12, color: B.teal, fontWeight: 700 }}>Copied!</span>
      )}
    </div>
  );

  const PersonTag = ({ name, role }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px", background: B.surfaceAlt,
      border: `1px solid ${B.border}`, borderRadius: 8,
      marginBottom: 8,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: B.teal, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, flexShrink: 0,
      }}>
        {name.split(" ").map(w => w[0]).slice(0, 2).join("")}
      </div>
      <div>
        <p style={{ fontSize: 15, fontWeight: 700, color: B.text }}>{name}</p>
        {role && <p style={{ fontSize: 13, color: B.textMute }}>{role}</p>}
      </div>
    </div>
  );

  return (
    <div className="fade-up">
      {/* Pub info bar */}
      <div style={{
        background: B.teal,
        color: "#fff",
        borderRadius: "12px 12px 0 0",
        padding: "16px 24px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div>
          <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.75, marginBottom: 4 }}>
            {article.publication || "Unknown Publication"} · {article.date || "Date unknown"}
          </p>
          <p style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", lineHeight: 1.3, maxWidth: 560 }}>
            {article.title || "Untitled Article"}
          </p>
          {article.reporter && (
            <p style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>By {article.reporter}</p>
          )}
        </div>
        {article.url && (
          <a href={article.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: B.gold, textDecoration: "none", fontWeight: 700, flexShrink: 0, marginTop: 4 }}>
            View source ↗
          </a>
        )}
      </div>

      {/* Content */}
      <div style={{ ...S.card, borderRadius: "0 0 12px 12px", borderTop: "none", borderColor: B.borderStrong }}>

        <Section label="Summary">
          <p style={{ fontSize: 16, color: B.textMid, lineHeight: 1.75 }}>{article.summary}</p>
        </Section>

        <Section label="Key Points">
          <ul style={{ listStyle: "none", paddingLeft: 0 }}>
            {(article.keyPoints || []).map((pt, i) => (
              <li key={i} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
                <span style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: B.gold, color: B.teal,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2,
                }}>{i + 1}</span>
                <p style={{ fontSize: 15, color: B.textMid, lineHeight: 1.65 }}>{pt}</p>
              </li>
            ))}
          </ul>
        </Section>

        {(article.people || []).length > 0 && (
          <Section label="People & Sources">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
              {article.people.map((p, i) => (
                <PersonTag key={i} name={p.name} role={p.role} />
              ))}
            </div>
          </Section>
        )}

        {(article.quotes || []).length > 0 && (
          <Section label="Key Quotes — click to copy">
            {article.quotes.map((q, i) => (
              <Quote key={i} text={q.text || q} speaker={q.speaker || q.attribution || null} idx={i} />
            ))}
          </Section>
        )}

        {/* Action bar */}
        <div style={{
          borderTop: `2px solid ${B.surfaceAlt}`,
          paddingTop: 20,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          <button
            onClick={onSave}
            style={{
              ...S.btnPrimary,
              opacity: saved ? 0.7 : 1,
              cursor: saved ? "default" : "pointer",
              background: saved ? B.textMute : B.teal,
            }}
          >
            {saved ? "✓ Saved to Library" : "Save to Library"}
          </button>
          <button
            onClick={onPushToMachine}
            style={{
              ...S.btnGold,
              opacity: pushed ? 0.7 : 1,
              cursor: pushed ? "default" : "pointer",
            }}
          >
            {pushed ? "✓ Pushed to Message Machine" : "Push to Message Machine →"}
          </button>
          <button
            onClick={() => copyText(
              `${article.title}\n${article.publication} · ${article.date} · ${article.reporter}\n\nSUMMARY:\n${article.summary}\n\nKEY POINTS:\n${(article.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nQUOTES:\n${(article.quotes || []).map(q => `"${q.text || q}"`).join("\n\n")}`,
              "all"
            )}
            style={S.btnSmall}
          >
            {copied === "all" ? "Copied!" : "Copy All"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Library panel ─────────────────────────────────────────────────────────────
function LibraryPanel({ items, onLoad, onDelete }) {
  if (!items.length) return (
    <div style={{ textAlign: "center", padding: "48px 0", color: B.textMute }}>
      <p style={{ fontSize: 40, marginBottom: 12 }}>📰</p>
      <p style={{ fontSize: 17, fontWeight: 700 }}>No saved articles yet</p>
      <p style={{ fontSize: 15, marginTop: 6 }}>Analyze an article and save it to build your library.</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map(item => (
        <div key={item.id} style={{ ...S.card, display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: B.text }}>{item.title || "Untitled"}</p>
              <span style={{ fontSize: 13, color: B.textMute }}>{item.date || ""}</span>
            </div>
            <p style={{ fontSize: 13, color: B.textMid, marginBottom: 8 }}>
              {item.publication}{item.reporter ? ` · ${item.reporter}` : ""}
            </p>
            <p style={{ fontSize: 14, color: B.textMute, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {item.summary}
            </p>
            {item.linkedCampaigns?.length > 0 && (
              <p style={{ fontSize: 12, color: B.teal, fontWeight: 700, marginTop: 8 }}>
                🔗 {item.linkedCampaigns.length} campaign{item.linkedCampaigns.length !== 1 ? "s" : ""} created from this article
              </p>
            )}
            {item.savedBy && (
              <p style={{ fontSize: 12, color: B.textMute, marginTop: 4 }}>
                Saved by {item.savedBy} · {item.savedAt}
              </p>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            <button onClick={() => onLoad(item)} style={{ ...S.btnPrimary, fontSize: 14, padding: "9px 18px" }}>Load</button>
            <button onClick={() => onDelete(item.id)} style={{ ...S.btnSmall, color: B.terracotta, borderColor: B.terracotta }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function RapidResponseReader() {
  const [view, setView]             = useState("reader");
  const [url, setUrl]               = useState("");
  const [loading, setLoading]       = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError]           = useState(null); // null | "scrape" | "parse"
  const [showManual, setShowManual] = useState(false);
  const [article, setArticle]       = useState(null);
  const [library, setLibrary]       = useState([]);
  const [saved, setSaved]           = useState(false);
  const [pushed, setPushed]         = useState(false);
  const [notif, setNotif]           = useState(null);

  // ── Search tab (Handoff #16 punch list) ──
  const [searchQuery, setSearchQuery]     = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError]     = useState(null); // null | "auth" | "ratelimit" | "failed"
  const [searchResults, setSearchResults] = useState(null); // null (not yet searched) | array

  useEffect(() => {
    loadAll();
    // Check if Library pushed a saved article to load
    try {
      const saved = localStorage.getItem("rr_load_article");
      if (saved) {
        const article = JSON.parse(saved);
        setArticle(article);
        setSaved(true);
        setPushed(false);
        setView("reader");
        localStorage.removeItem("rr_load_article");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {}
  }, []);

  const loadAll = async () => {
    try {
      const articles = await loadArticles();
      setLibrary(articles);
    } catch {}
  };

  const notify = (msg, type = "ok") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

  // ── Fetch + parse ───────────────────────────────────────────────────────────
  const fetchAndAnalyze = async (targetUrl) => {
    setLoading(true);
    setError(null);
    setArticle(null);
    setSaved(false);
    setPushed(false);
    setLoadingMsg("Fetching article...");

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/.netlify/functions/rapid-response", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ action: "fetch_and_analyze", url: targetUrl }),
      });

      if (res.status === 401 || res.status === 403) {
        setLoading(false);
        setError("auth");
        return;
      }

      if (res.status === 429) {
        setLoading(false);
        setError("ratelimit");
        return;
      }

      if (res.status === 422) {
        setLoading(false);
        setError("scrape");
        return;
      }

      const data = await res.json();
      if (data.usageWarning) {
        const { used, limit, remaining } = data.usageWarning;
        notify(`⚠️ ${used}/${limit} daily AI calls used — ${remaining} remaining.`, "warn");
      }
      const raw = data.result?.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setArticle({ ...parsed, url: targetUrl, id: `article_${Date.now()}`, isManual: false });
      setLoading(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setLoading(false);
      setError("scrape");
    }
  };

  const analyzeText = async ({ text, url: srcUrl, title, pub, date, reporter, isManual }) => {
    setLoading(true);
    setLoadingMsg("Analyzing article...");

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/.netlify/functions/rapid-response", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          action: "analyze_text",
          text,
          manualMeta: { title, pub, date, reporter },
        }),
      });

      if (res.status === 401 || res.status === 403) {
        setLoading(false);
        setError("auth");
        notify("Please sign in to use this tool.", "err");
        return;
      }

      if (res.status === 429) {
        setLoading(false);
        setError("ratelimit");
        notify("Daily AI call limit reached. Resets at midnight UTC.", "err");
        return;
      }

      const data = await res.json();
      if (data.usageWarning) {
        const { used, limit, remaining } = data.usageWarning;
        notify(`⚠️ ${used}/${limit} daily AI calls used — ${remaining} remaining.`, "warn");
      }
      const raw = data.result?.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setArticle({ ...parsed, url: srcUrl, id: `article_${Date.now()}`, isManual });
      setLoading(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setLoading(false);
      setError("parse");
      notify("Could not analyze article. Please try again.", "err");
    }
  };

  // ── Search the web for an article, then hand the pick to fetchAndAnalyze ──
  const runSearch = async (q) => {
    if (!q.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/.netlify/functions/rapid-response", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ action: "search", query: q.trim() }),
      });

      if (res.status === 401 || res.status === 403) { setSearchLoading(false); setSearchError("auth"); return; }
      if (res.status === 429) { setSearchLoading(false); setSearchError("ratelimit"); return; }
      if (!res.ok) { setSearchLoading(false); setSearchError("failed"); return; }

      const data = await res.json();
      if (data.usageWarning) {
        const { used, limit, remaining } = data.usageWarning;
        notify(`⚠️ ${used}/${limit} daily AI calls used — ${remaining} remaining.`, "warn");
      }
      setSearchResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setSearchError("failed");
    }
    setSearchLoading(false);
  };

  // Selecting a result hands its URL to the existing fetch_and_analyze
  // pipeline unchanged — Search is just a second way to arrive at a URL,
  // not a second analysis path.
  const pickSearchResult = (result) => {
    if (!result?.url) return;
    setSearchResults(null);
    setSearchQuery("");
    setView("reader");
    fetchAndAnalyze(result.url);
  };

  // ── Save to library ─────────────────────────────────────────────────────────
  const saveToLibrary = async () => {
    if (!article) return;
    try {
      const entry = {
        ...article,
        savedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        linkedCampaigns: [],
      };
      const id = await saveArticle(entry);
      const saved = { ...entry, id };
      setLibrary(prev => [saved, ...prev.filter(x => x.id !== article.id)]);
      setSaved(true);
      notify("Article saved to library!");
    } catch { notify("Save failed — please try again.", "err"); }
  };

  // ── Push to Message Machine ─────────────────────────────────────────────────
  const pushToMachine = () => {
    if (!article) return;
    const payload = {
      sourceArticleId: article.id,
      sourceTitle: article.title,
      sourcePublication: article.publication,
      sourceDate: article.date,
      sourceUrl: article.url || null,
      issueText: `${article.title}\n\n${article.summary}\n\nKey Points:\n${(article.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join("\n")}${article.url ? `\n\nSource: ${article.url}` : ""}`,
      focalPoint: "",
      pushedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem("rr_pending_article", JSON.stringify(payload));
      setPushed(true);
      // Navigate to Message Machine
      window.location.href = "/messaging";
    } catch {
      notify("Push failed — try again.", "err");
    }
  };

  const deleteFromLibrary = async (id) => {
    try {
      await deleteArticle(id);
      setLibrary(prev => prev.filter(x => x.id !== id));
      notify("Article removed from library.");
    } catch { notify("Delete failed — please try again.", "err"); }
  };

  const reset = () => {
    setUrl("");
    setArticle(null);
    setError(null);
    setShowManual(false);
    setSaved(false);
    setPushed(false);
  };

  const tabStyle = (active) => ({
    padding: "10px 20px",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    border: active ? `2px solid ${B.teal}` : `1.5px solid transparent`,
    background: active ? B.teal : "transparent",
    color: active ? "#fff" : B.textMid,
    transition: "all 0.15s",
    fontFamily: "inherit",
  });

  return (
    <div style={{ minHeight: "100vh", background: B.pageBg, color: B.text, fontFamily: "'Atkinson Hyperlegible', Georgia, serif" }}>
      <style>{globalCSS}</style>

      {/* HEADER */}
      <header style={{ background: B.surface, borderBottom: `3px solid ${B.teal}`, position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, background: B.teal, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📡</div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: B.teal, lineHeight: 1.1, fontFamily: "'DM Serif Display', Georgia, serif" }}>Rapid Response</h1>
              <p style={{ fontSize: 12, color: B.textMute }}>Article Reader & Analyzer</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {article && (
              <button onClick={reset} style={{ ...S.btnSmall, marginRight: 8 }}>+ New Article</button>
            )}
            <button onClick={() => setView("search")} style={tabStyle(view === "search")}>
              🔎 Search
            </button>
            <button onClick={() => setView("library")} style={tabStyle(view === "library")}>
              Library ({library.length})
            </button>
          </div>
        </div>
      </header>

      {/* AI DISCLAIMER */}
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px 20px 0" }}>
        <div style={{ background: "rgba(29,92,74,0.08)", border: `2px solid ${B.teal}`, borderRadius: 8, padding: "14px 20px", fontSize: 17, fontWeight: 700, color: B.teal, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚠️</span> AI-generated content — always verify facts and claims before publishing.
        </div>
      </div>

      {/* TOAST */}
      {notif && (
        <div style={{
          position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 100,
          padding: "12px 24px", borderRadius: 10, fontSize: 16, fontWeight: 700,
          background: notif.type === "err" ? B.terracotta : B.teal,
          color: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.25)", whiteSpace: "nowrap",
          animation: "fadeUp 0.2s ease",
        }}>
          {notif.msg}
        </div>
      )}

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "36px 20px" }}>

        {/* ══════ READER VIEW ══════ */}
        {view === "reader" && (
          <div style={{ maxWidth: 740, margin: "0 auto" }}>

            {!article && !showManual && (
              <>
                <div style={{ marginBottom: 32 }}>
                  <h2 style={{ fontSize: 34, fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", color: B.teal, marginBottom: 10 }}>
                    Analyze an Article
                  </h2>
                  <p style={{ fontSize: 18, color: B.textMid, lineHeight: 1.6 }}>
                    Paste a URL to extract the summary, key points, people, and quotes — then push directly to Message Machine.
                  </p>
                </div>

                <div style={{ ...S.card, marginBottom: 20 }}>
                  <label htmlFor="url-input" style={S.label}>Article URL</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      id="url-input"
                      type="url"
                      style={{ ...S.input, flex: 1 }}
                      placeholder="https://azcapitoltimes.com/..."
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && url.trim() && fetchAndAnalyze(url.trim())}
                    />
                    <button
                      onClick={() => fetchAndAnalyze(url.trim())}
                      disabled={loading || !url.trim()}
                      style={{
                        ...S.btnPrimary,
                        opacity: loading || !url.trim() ? 0.5 : 1,
                        cursor: loading || !url.trim() ? "not-allowed" : "pointer",
                        flexShrink: 0,
                      }}
                    >
                      {loading
                        ? <><span className="spin" style={S.spinner} /> {loadingMsg}</>
                        : "Analyze →"
                      }
                    </button>
                  </div>
                  <p style={{ fontSize: 13, color: B.textMute, marginTop: 10 }}>
                    Works best with public articles. Paywalled or login-protected pages will show a fallback option.
                  </p>
                </div>

                <div style={{ textAlign: "center", color: B.textMute, fontSize: 14, marginBottom: 20 }}>— or —</div>

                <button
                  onClick={() => setShowManual(true)}
                  style={{ ...S.btnSecondary, width: "100%", justifyContent: "center", padding: "14px" }}
                >
                  ✏️ Paste article text manually
                </button>
              </>
            )}

            {/* Error states */}
            {error === "scrape" && !showManual && (
              <div style={{ marginTop: 0 }}>
                <ScrapeError
                  url={url}
                  onManualEntry={() => { setError(null); setShowManual(true); }}
                  onTryAgain={() => { setError(null); fetchAndAnalyze(url); }}
                />
              </div>
            )}

            {error === "auth" && (
              <div style={{ ...S.card, padding: "24px", textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: B.text, marginBottom: 6 }}>
                  Please sign in to use this tool.
                </p>
                <p style={{ fontSize: 14, color: B.textMute }}>
                  Your session may have expired. Try signing out and back in.
                </p>
              </div>
            )}

            {error === "ratelimit" && (
              <div style={{ ...S.card, padding: "24px", textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: B.text, marginBottom: 6 }}>
                  🚦 Daily limit reached
                </p>
                <p style={{ fontSize: 14, color: B.textMute }}>
                  You've used all your AI calls for today. Your limit resets at midnight UTC.{" "}
                  <a href="mailto:info@arizonacoalition.net?subject=Daily%20AI%20limit%20reached" style={{ color: B.text, fontWeight: 700, textDecoration: "underline" }}>
                    Contact your coalition administrator
                  </a>{" "}
                  if you need more access.
                </p>
              </div>
            )}

            {/* Manual entry */}
            {showManual && (
              <ManualEntry
                url={url}
                onAnalyze={(data) => { setShowManual(false); analyzeText(data); }}
                onCancel={() => { setShowManual(false); setError(null); }}
              />
            )}

            {/* Loading state */}
            {loading && (
              <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 16, padding: "40px 24px" }}>
                <div style={{ width: 40, height: 40, border: `3px solid ${B.surfaceAlt}`, borderTopColor: B.teal, borderRadius: "50%", flexShrink: 0 }} className="spin" />
                <div>
                  <p style={{ fontSize: 17, fontWeight: 700, color: B.text }}>{loadingMsg}</p>
                  <p style={{ fontSize: 14, color: B.textMute, marginTop: 4 }}>This usually takes 5–15 seconds</p>
                </div>
              </div>
            )}

            {/* Result */}
            {article && !loading && (
              <ArticleResult
                article={article}
                onSave={saveToLibrary}
                onPushToMachine={pushToMachine}
                saved={saved}
                pushed={pushed}
              />
            )}
          </div>
        )}

        {/* ══════ SEARCH VIEW ══════ */}
        {view === "search" && (
          <div style={{ maxWidth: 740, margin: "0 auto" }}>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 34, fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", color: B.teal, marginBottom: 10 }}>
                Search for an Article
              </h2>
              <p style={{ fontSize: 18, color: B.textMid, lineHeight: 1.6 }}>
                Don't have a link yet? Search the web for recent coverage, then pick a result to analyze.
              </p>
            </div>

            <div style={{ ...S.card, marginBottom: 20 }}>
              <label htmlFor="search-input" style={S.label}>What are you looking for?</label>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  id="search-input"
                  type="text"
                  style={{ ...S.input, flex: 1 }}
                  placeholder="e.g. Arizona water rights legislation 2026"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && searchQuery.trim() && runSearch(searchQuery)}
                />
                <button
                  onClick={() => runSearch(searchQuery)}
                  disabled={searchLoading || !searchQuery.trim()}
                  style={{
                    ...S.btnPrimary,
                    opacity: searchLoading || !searchQuery.trim() ? 0.5 : 1,
                    cursor: searchLoading || !searchQuery.trim() ? "not-allowed" : "pointer",
                    flexShrink: 0,
                  }}
                >
                  {searchLoading
                    ? <><span className="spin" style={S.spinner} /> Searching…</>
                    : "Search →"
                  }
                </button>
              </div>
              <p style={{ fontSize: 13, color: B.textMute, marginTop: 10 }}>
                Picking a result runs it through the same analyzer as pasting a URL directly.
              </p>
            </div>

            {searchError === "auth" && (
              <div style={{ ...S.card, padding: "24px", textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: B.text, marginBottom: 6 }}>
                  Please sign in to use this tool.
                </p>
                <p style={{ fontSize: 14, color: B.textMute }}>
                  Your session may have expired. Try signing out and back in.
                </p>
              </div>
            )}

            {searchError === "ratelimit" && (
              <div style={{ ...S.card, padding: "24px", textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: B.text, marginBottom: 6 }}>
                  🚦 Daily limit reached
                </p>
                <p style={{ fontSize: 14, color: B.textMute }}>
                  You've used all your AI calls for today. Your limit resets at midnight UTC.{" "}
                  <a href="mailto:info@arizonacoalition.net?subject=Daily%20AI%20limit%20reached" style={{ color: B.text, fontWeight: 700, textDecoration: "underline" }}>
                    Contact your coalition administrator
                  </a>{" "}
                  if you need more access.
                </p>
              </div>
            )}

            {searchError === "failed" && (
              <div style={{ ...S.card, padding: "24px", textAlign: "center" }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: B.text, marginBottom: 6 }}>
                  Couldn't complete that search.
                </p>
                <p style={{ fontSize: 14, color: B.textMute }}>Please try again, or try a more specific query.</p>
              </div>
            )}

            {searchLoading && (
              <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 16, padding: "40px 24px" }}>
                <div style={{ width: 40, height: 40, border: `3px solid ${B.surfaceAlt}`, borderTopColor: B.teal, borderRadius: "50%", flexShrink: 0 }} className="spin" />
                <div>
                  <p style={{ fontSize: 17, fontWeight: 700, color: B.text }}>Searching the web…</p>
                  <p style={{ fontSize: 14, color: B.textMute, marginTop: 4 }}>This usually takes 10–20 seconds</p>
                </div>
              </div>
            )}

            {searchResults && !searchLoading && (
              searchResults.length === 0 ? (
                <div style={{ ...S.card, padding: "24px", textAlign: "center" }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: B.text }}>No results found.</p>
                  <p style={{ fontSize: 14, color: B.textMute, marginTop: 4 }}>Try a different or more specific search.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => pickSearchResult(r)}
                      style={{ ...S.card, textAlign: "left", cursor: "pointer", display: "block", width: "100%" }}
                    >
                      <div style={{ fontSize: 17, fontWeight: 700, color: B.teal, marginBottom: 4 }}>{r.title || "Untitled"}</div>
                      <div style={{ fontSize: 13, color: B.textMute, marginBottom: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {r.publication && <span>{r.publication}</span>}
                        {r.date && <span>· {r.date}</span>}
                      </div>
                      {r.snippet && <p style={{ fontSize: 15, color: B.textMid, lineHeight: 1.5 }}>{r.snippet}</p>}
                      <div style={{ fontSize: 12, color: B.textMute, marginTop: 8, wordBreak: "break-all" }}>{r.url}</div>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {/* ══════ LIBRARY VIEW ══════ */}
        {view === "library" && (
          <div style={{ maxWidth: 740, margin: "0 auto" }}>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 34, fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", color: B.teal, marginBottom: 10 }}>
                Article Library
              </h2>
              <p style={{ fontSize: 18, color: B.textMid }}>
                {library.length === 0 ? "No articles saved yet." : `${library.length} article${library.length !== 1 ? "s" : ""} saved`}
              </p>
            </div>
            <LibraryPanel
              items={library}
              onLoad={(item) => { setArticle(item); setSaved(true); setPushed(false); setView("reader"); }}
              onDelete={deleteFromLibrary}
            />
          </div>
        )}
      </main>
    </div>
  );
}
