import { useState, useEffect } from "react";

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
  html, body { background: #FAFAF7; color: #1A1A1A; }
  textarea, input, button, select { font-family: 'Atkinson Hyperlegible', Georgia, serif; }
  textarea:focus, input:focus, select:focus { outline: 3px solid #3ECFB2 !important; outline-offset: 2px; border-color: #1D5C4A !important; }
  button:focus { outline: 3px solid #3ECFB2; outline-offset: 3px; }
  button:active { transform: scale(0.97); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
  .spin { animation: spin 0.9s linear infinite; display:inline-block; }
  .fade-up { animation: fadeUp 0.3s ease; }
  .pulse { animation: pulse 1.5s ease infinite; }
  ::selection { background: #F5C842; color: #1D5C4A; }
`;

const S = {
  card: { background: "#FFFFFF", border: "1.5px solid #C8C4BC", borderRadius: 12, padding: 24 },
  label: { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4A4558", marginBottom: 8 },
  input: { width: "100%", background: "#FFFFFF", border: "1.5px solid #C8C4BC", borderRadius: 8, padding: "12px 16px", color: "#1A1A1A", fontSize: 16, lineHeight: 1.5, fontFamily: "inherit" },
  textarea: { width: "100%", background: "#FFFFFF", border: "1.5px solid #C8C4BC", borderRadius: 8, padding: "12px 16px", color: "#1A1A1A", fontSize: 15, lineHeight: 1.6, fontFamily: "inherit", resize: "vertical" },
  btnPrimary: { background: "#1D5C4A", color: "#fff", fontWeight: 700, padding: "13px 24px", borderRadius: 8, border: "2px solid #2a7a62", cursor: "pointer", fontSize: 16, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10 },
  btnSecondary: { background: "#FFFFFF", color: "#1D5C4A", fontWeight: 700, padding: "11px 20px", borderRadius: 8, border: "1.5px solid #1D5C4A", cursor: "pointer", fontSize: 15, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 },
  btnGold: { background: "#F5C842", color: "#1D5C4A", fontWeight: 700, padding: "13px 24px", borderRadius: 8, border: "2px solid #d4aa30", cursor: "pointer", fontSize: 16, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10 },
  btnSmall: { background: "transparent", color: "#4A4558", fontWeight: 700, padding: "7px 14px", borderRadius: 6, border: "1px solid #C8C4BC", cursor: "pointer", fontSize: 13, fontFamily: "inherit" },
  spinner: { width: 18, height: 18, flexShrink: 0, border: "2.5px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%" },
  sectionHead: { fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#1D5C4A", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid #F5C842", display: "inline-block" },
};

function ScrapeError({ url, onManualEntry, onTryAgain }) {
  return (
    <div className="fade-up" style={{ ...S.card, borderColor: "#e8c4a0", borderWidth: 2, background: "#fffbf7" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: "#fdebd0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 22 }}>⚠️</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: "#C1673A", marginBottom: 6 }}>Couldn't read that page</p>
          <p style={{ fontSize: 15, color: "#4A4558", lineHeight: 1.6, marginBottom: 16 }}>This happens when a site blocks automated access, requires a login, or uses a paywall. You can still create messages from this article — just paste the text directly below.</p>
          <p style={{ fontSize: 13, color: "#888580", marginBottom: 20, fontFamily: "monospace", background: "#F3F4F0", padding: "6px 10px", borderRadius: 6, wordBreak: "break-all" }}>{url}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={onManualEntry} style={{ ...S.btnGold, fontSize: 15 }}>✏️ Paste article text manually</button>
            <button onClick={onTryAgain} style={{ ...S.btnSecondary, fontSize: 15 }}>↺ Try again</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualEntry({ url, onAnalyze, onCancel }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [pub, setPub] = useState("");
  const [date, setDate] = useState("");
  const [reporter, setReporter] = useState("");
  const AZ_COUNTIES = ["Apache","Cochise","Coconino","Gila","Graham","Greenlee","La Paz","Maricopa","Mohave","Navajo","Pima","Pinal","Santa Cruz","Yavapai","Yuma","Statewide / Coalition"];
  return (
    <div className="fade-up" style={{ ...S.card, borderColor: "#F5C842", borderWidth: 2 }}>
      <p style={S.sectionHead}>Manual Article Entry</p>
      <p style={{ fontSize: 15, color: "#4A4558", marginBottom: 20, lineHeight: 1.6 }}>Paste the article text below. Fill in as much publication info as you know — anything left blank will be marked unknown.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div><label style={S.label}>Article Title</label><input style={S.input} placeholder="e.g. APS rate hike protests..." value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div><label style={S.label}>Publication</label><input style={S.input} placeholder="e.g. Arizona Capitol Times" value={pub} onChange={e => setPub(e.target.value)} /></div>
        <div><label style={S.label}>Reporter</label><input style={S.input} placeholder="e.g. Reagan Priest" value={reporter} onChange={e => setReporter(e.target.value)} /></div>
        <div><label style={S.label}>Date</label><input style={S.input} type="text" placeholder="e.g. May 19, 2026" value={date} onChange={e => setDate(e.target.value)} /></div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={S.label}>Article Text <span style={{ color: "#C1673A" }}>*</span></label>
        <textarea rows={10} style={S.textarea} placeholder="Paste the full article text here..." value={text} onChange={e => setText(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <button onClick={() => onAnalyze({ text, title, pub, date, reporter, url, isManual: true })} disabled={!text.trim()} style={{ ...S.btnPrimary, opacity: text.trim() ? 1 : 0.5, cursor: text.trim() ? "pointer" : "not-allowed" }}>Analyze Article →</button>
        <button onClick={onCancel} style={S.btnSecondary}>Cancel</button>
      </div>
    </div>
  );
}

function ArticleResult({ article, onSave, onPushToMachine, saved, pushed }) {
  const [copied, setCopied] = useState(null);
  const copyText = async (text, key) => { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); };
  const Quote = ({ text, idx }) => (
    <div style={{ borderLeft: "3px solid #F5C842", paddingLeft: 16, marginBottom: 14, background: "#F3F4F0", borderRadius: "0 8px 8px 0", padding: "12px 16px", cursor: "pointer", position: "relative" }} onClick={() => copyText(text, `q${idx}`)} title="Click to copy">
      <p style={{ fontSize: 15, color: "#4A4558", lineHeight: 1.7, fontStyle: "italic" }}>"{text}"</p>
      {copied === `q${idx}` && <span style={{ position: "absolute", top: 10, right: 12, fontSize: 12, color: "#1D5C4A", fontWeight: 700 }}>Copied!</span>}
    </div>
  );
  const PersonTag = ({ name, role }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#F3F4F0", border: "1px solid #C8C4BC", borderRadius: 8, marginBottom: 8 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1D5C4A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{name.split(" ").map(w => w[0]).slice(0, 2).join("")}</div>
      <div><p style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>{name}</p>{role && <p style={{ fontSize: 13, color: "#888580" }}>{role}</p>}</div>
    </div>
  );
  return (
    <div className="fade-up">
      <div style={{ background: "#1D5C4A", color: "#fff", borderRadius: "12px 12px 0 0", padding: "16px 24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.75, marginBottom: 4 }}>{article.publication || "Unknown Publication"} · {article.date || "Date unknown"}</p>
          <p style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", lineHeight: 1.3, maxWidth: 560 }}>{article.title || "Untitled Article"}</p>
          {article.reporter && <p style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>By {article.reporter}</p>}
        </div>
        {article.url && <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#F5C842", textDecoration: "none", fontWeight: 700, flexShrink: 0, marginTop: 4 }}>View source ↗</a>}
      </div>
      <div style={{ ...S.card, borderRadius: "0 0 12px 12px", borderTop: "none", borderColor: "#1D5C4A" }}>
        <div style={{ marginBottom: 28 }}><p style={S.sectionHead}>Summary</p><p style={{ fontSize: 16, color: "#4A4558", lineHeight: 1.75 }}>{article.summary}</p></div>
        <div style={{ marginBottom: 28 }}>
          <p style={S.sectionHead}>Key Points</p>
          <ul style={{ listStyle: "none", paddingLeft: 0 }}>
            {(article.keyPoints || []).map((pt, i) => (
              <li key={i} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#F5C842", color: "#1D5C4A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
                <p style={{ fontSize: 15, color: "#4A4558", lineHeight: 1.65 }}>{pt}</p>
              </li>
            ))}
          </ul>
        </div>
        {(article.people || []).length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <p style={S.sectionHead}>People & Sources</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
              {article.people.map((p, i) => <PersonTag key={i} name={p.name} role={p.role} />)}
            </div>
          </div>
        )}
        {(article.quotes || []).length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <p style={S.sectionHead}>Key Quotes — click to copy</p>
            {article.quotes.map((q, i) => <Quote key={i} text={q.text || q} idx={i} />)}
          </div>
        )}
        <div style={{ borderTop: "2px solid #F3F4F0", paddingTop: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={onSave} style={{ ...S.btnPrimary, opacity: saved ? 0.7 : 1, cursor: saved ? "default" : "pointer", background: saved ? "#888580" : "#1D5C4A" }}>{saved ? "✓ Saved to Library" : "Save to Library"}</button>
          <button onClick={onPushToMachine} style={{ ...S.btnGold, opacity: pushed ? 0.7 : 1, cursor: pushed ? "default" : "pointer" }}>{pushed ? "✓ Pushed to Message Machine" : "Push to Message Machine →"}</button>
          <button onClick={() => copyText(`${article.title}\n${article.publication} · ${article.date} · ${article.reporter}\n\nSUMMARY:\n${article.summary}\n\nKEY POINTS:\n${(article.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nQUOTES:\n${(article.quotes || []).map(q => `"${q.text || q}"`).join("\n\n")}`, "all")} style={S.btnSmall}>{copied === "all" ? "Copied!" : "Copy All"}</button>
        </div>
      </div>
    </div>
  );
}

function LibraryPanel({ items, onLoad, onDelete }) {
  if (!items.length) return (
    <div style={{ textAlign: "center", padding: "48px 0", color: "#888580" }}>
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
              <p style={{ fontSize: 17, fontWeight: 700, color: "#1A1A1A" }}>{item.title || "Untitled"}</p>
              <span style={{ fontSize: 13, color: "#888580" }}>{item.date || ""}</span>
            </div>
            <p style={{ fontSize: 13, color: "#4A4558", marginBottom: 8 }}>{item.publication}{item.reporter ? ` · ${item.reporter}` : ""}</p>
            <p style={{ fontSize: 14, color: "#888580", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.summary}</p>
            {item.linkedCampaigns?.length > 0 && <p style={{ fontSize: 12, color: "#1D5C4A", fontWeight: 700, marginTop: 8 }}>🔗 {item.linkedCampaigns.length} campaign{item.linkedCampaigns.length !== 1 ? "s" : ""} created from this article</p>}
            {item.savedBy && <p style={{ fontSize: 12, color: "#888580", marginTop: 4 }}>Saved by {item.savedBy} · {item.savedAt}</p>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            <button onClick={() => onLoad(item)} style={{ ...S.btnPrimary, fontSize: 14, padding: "9px 18px" }}>Load</button>
            <button onClick={() => onDelete(item.id)} style={{ ...S.btnSmall, color: "#C1673A", borderColor: "#C1673A" }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileSetup({ onSave }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [county, setCounty] = useState("");
  const AZ_COUNTIES = ["Apache","Cochise","Coconino","Gila","Graham","Greenlee","La Paz","Maricopa","Mohave","Navajo","Pima","Pinal","Santa Cruz","Yavapai","Yuma","Statewide / Coalition"];
  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, background: "#1D5C4A", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 30 }}>📡</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", color: "#1D5C4A", marginBottom: 8 }}>Welcome to Rapid Response</h1>
          <p style={{ fontSize: 16, color: "#4A4558", lineHeight: 1.6 }}>Set up your profile so your saved articles are attributed correctly.</p>
        </div>
        <div style={{ ...S.card, display: "flex", flexDirection: "column", gap: 16 }}>
          <div><label style={S.label}>Your Name <span style={{ color: "#C1673A" }}>*</span></label><input style={S.input} placeholder="First and last name" value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label style={S.label}>Email</label><input style={S.input} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><label style={S.label}>Organization / Role</label><input style={S.input} placeholder="e.g. LD13 Volunteer Coordinator" value={org} onChange={e => setOrg(e.target.value)} /></div>
          <div>
            <label style={S.label}>County / Region</label>
            <select style={S.input} value={county} onChange={e => setCounty(e.target.value)}>
              <option value="">Select county...</option>
              {AZ_COUNTIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={() => name.trim() && onSave({ name: name.trim(), email, org, county, createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) })} disabled={!name.trim()} style={{ ...S.btnPrimary, justifyContent: "center", opacity: name.trim() ? 1 : 0.5, cursor: name.trim() ? "pointer" : "not-allowed", marginTop: 4 }}>Get Started →</button>
        </div>
        <p style={{ textAlign: "center", fontSize: 13, color: "#888580", marginTop: 16 }}>This info stays on your device until a real login system is connected.</p>
      </div>
    </div>
  );
}

export default function RapidResponseReader() {
  const [view, setView]             = useState("reader");
  const [url, setUrl]               = useState("");
  const [loading, setLoading]       = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError]           = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [article, setArticle]       = useState(null);
  const [library, setLibrary]       = useState([]);
  const [saved, setSaved]           = useState(false);
  const [pushed, setPushed]         = useState(false);
  const [notif, setNotif]           = useState(null);
  const [profile, setProfile]       = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try { const p = await window.storage.get("rr_profile"); if (p) setProfile(JSON.parse(p.value)); } catch {}
    try { const lib = await window.storage.get("rr_library"); if (lib) setLibrary(JSON.parse(lib.value)); } catch {}
  };

  const notify = (msg, type = "ok") => { setNotif({ msg, type }); setTimeout(() => setNotif(null), 3500); };

  const saveProfile = async (prof) => {
    setProfile(prof);
    try { await window.storage.set("rr_profile", JSON.stringify(prof)); } catch {}
  };

  const fetchAndAnalyze = async (targetUrl) => {
    setLoading(true); setError(null); setArticle(null); setSaved(false); setPushed(false);
    setLoadingMsg("Fetching article...");
    try {
      const res = await fetch("/.netlify/functions/rapid-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch_and_analyze", url: targetUrl }),
      });
      if (res.status === 422) { setLoading(false); setError("scrape"); return; }
      const data = await res.json();
      const raw = data.result?.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setArticle({ ...parsed, url: targetUrl, id: `article_${Date.now()}`, isManual: false });
      setLoading(false);
    } catch { setLoading(false); setError("scrape"); }
  };

  const analyzeText = async ({ text, url: srcUrl, title, pub, date, reporter, isManual }) => {
    setLoading(true);
    setLoadingMsg("Analyzing article...");
    try {
      const res = await fetch("/.netlify/functions/rapid-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze_text", text, manualMeta: { title, pub, date, reporter } }),
      });
      const data = await res.json();
      const raw = data.result?.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setArticle({ ...parsed, url: srcUrl, id: `article_${Date.now()}`, isManual });
      setLoading(false);
    } catch { setLoading(false); setError("parse"); notify("Could not analyze article. Please try again.", "err"); }
  };

  const saveToLibrary = async () => {
    if (!article) return;
    const entry = { ...article, savedBy: profile?.name || "Anonymous", savedByEmail: profile?.email || "", savedByOrg: profile?.org || "", savedByCounty: profile?.county || "", savedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), linkedCampaigns: [] };
    const updated = [entry, ...library.filter(x => x.id !== entry.id)];
    setLibrary(updated); setSaved(true);
    try { await window.storage.set("rr_library", JSON.stringify(updated)); } catch {}
    notify("Article saved to library!");
  };

  const pushToMachine = async () => {
    if (!article) return;
    const payload = { sourceArticleId: article.id, sourceTitle: article.title, sourcePublication: article.publication, sourceDate: article.date, sourceUrl: article.url, issueText: `${article.title}\n\n${article.summary}\n\nKey Points:\n${(article.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join("\n")}`, focalPoint: article.keyPoints?.[0] || "", pushedAt: new Date().toISOString() };
    try { await window.storage.set("rr_pending_article", JSON.stringify(payload)); setPushed(true); notify("Article pushed to Message Machine!"); }
    catch { notify("Push failed — try again.", "err"); }
  };

  const deleteFromLibrary = async (id) => {
    const updated = library.filter(x => x.id !== id);
    setLibrary(updated);
    try { await window.storage.set("rr_library", JSON.stringify(updated)); } catch {}
    notify("Article removed from library.");
  };

  const reset = () => { setUrl(""); setArticle(null); setError(null); setShowManual(false); setSaved(false); setPushed(false); };

  if (!profile) return (<><style>{globalCSS}</style><ProfileSetup onSave={saveProfile} /></>);

  const tabStyle = (active) => ({ padding: "10px 20px", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer", border: active ? "2px solid #1D5C4A" : "1.5px solid transparent", background: active ? "#1D5C4A" : "transparent", color: active ? "#fff" : "#4A4558", transition: "all 0.15s", fontFamily: "inherit" });

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", color: "#1A1A1A", fontFamily: "'Atkinson Hyperlegible', Georgia, serif" }}>
      <style>{globalCSS}</style>
      <header style={{ background: "#FFFFFF", borderBottom: "3px solid #1D5C4A", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, background: "#1D5C4A", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📡</div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1D5C4A", lineHeight: 1.1, fontFamily: "'DM Serif Display', Georgia, serif" }}>Rapid Response</h1>
              <p style={{ fontSize: 12, color: "#888580" }}>Article Reader & Analyzer</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {article && <button onClick={reset} style={{ ...S.btnSmall, marginRight: 8 }}>+ New Article</button>}
            {[{ id: "reader", label: "Reader" }, { id: "library", label: `Library (${library.length})` }].map(tab => (
              <button key={tab.id} onClick={() => setView(tab.id)} style={tabStyle(view === tab.id)}>{tab.label}</button>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#F3F4F0", border: "1px solid #C8C4BC", borderRadius: 20, marginLeft: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#F5C842", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#1D5C4A" }}>{profile.name.charAt(0)}</div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#4A4558" }}>{profile.name.split(" ")[0]}</span>
              <button onClick={() => setProfile(null)} style={{ fontSize: 11, color: "#888580", background: "none", border: "none", cursor: "pointer", padding: 0 }}>✕</button>
            </div>
          </div>
        </div>
      </header>
      {notif && <div style={{ position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 100, padding: "12px 24px", borderRadius: 10, fontSize: 16, fontWeight: 700, background: notif.type === "err" ? "#C1673A" : "#1D5C4A", color: "#fff", boxShadow: "0 4px 24px rgba(0,0,0,0.25)", whiteSpace: "nowrap", animation: "fadeUp 0.2s ease" }}>{notif.msg}</div>}
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "36px 20px" }}>
        {view === "reader" && (
          <div style={{ maxWidth: 740, margin: "0 auto" }}>
            {!article && !showManual && (
              <>
                <div style={{ marginBottom: 32 }}>
                  <h2 style={{ fontSize: 34, fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", color: "#1D5C4A", marginBottom: 10 }}>Analyze an Article</h2>
                  <p style={{ fontSize: 18, color: "#4A4558", lineHeight: 1.6 }}>Paste a URL to extract the summary, key points, people, and quotes — then push directly to Message Machine.</p>
                </div>
                <div style={{ ...S.card, marginBottom: 20 }}>
                  <label htmlFor="url-input" style={S.label}>Article URL</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input id="url-input" type="url" style={{ ...S.input, flex: 1 }} placeholder="https://azcapitoltimes.com/..." value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && url.trim() && fetchAndAnalyze(url.trim())} />
                    <button onClick={() => fetchAndAnalyze(url.trim())} disabled={loading || !url.trim()} style={{ ...S.btnPrimary, opacity: loading || !url.trim() ? 0.5 : 1, cursor: loading || !url.trim() ? "not-allowed" : "pointer", flexShrink: 0 }}>
                      {loading ? <><span className="spin" style={S.spinner} /> {loadingMsg}</> : "Analyze →"}
                    </button>
                  </div>
                  <p style={{ fontSize: 13, color: "#888580", marginTop: 10 }}>Works best with public articles. Paywalled or login-protected pages will show a fallback option.</p>
                </div>
                <div style={{ textAlign: "center", color: "#888580", fontSize: 14, marginBottom: 20 }}>— or —</div>
                <button onClick={() => setShowManual(true)} style={{ ...S.btnSecondary, width: "100%", justifyContent: "center", padding: "14px" }}>✏️ Paste article text manually</button>
              </>
            )}
            {error === "scrape" && !showManual && <div style={{ marginTop: 0 }}><ScrapeError url={url} onManualEntry={() => { setError(null); setShowManual(true); }} onTryAgain={() => { setError(null); fetchAndAnalyze(url); }} /></div>}
            {showManual && <ManualEntry url={url} onAnalyze={(data) => { setShowManual(false); analyzeText(data); }} onCancel={() => { setShowManual(false); setError(null); }} />}
            {loading && (
              <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 16, padding: "40px 24px" }}>
                <div style={{ width: 40, height: 40, border: "3px solid #F3F4F0", borderTopColor: "#1D5C4A", borderRadius: "50%", flexShrink: 0 }} className="spin" />
                <div>
                  <p style={{ fontSize: 17, fontWeight: 700, color: "#1A1A1A" }}>{loadingMsg}</p>
                  <p style={{ fontSize: 14, color: "#888580", marginTop: 4 }}>This usually takes 5–15 seconds</p>
                </div>
              </div>
            )}
            {article && !loading && <ArticleResult article={article} onSave={saveToLibrary} onPushToMachine={pushToMachine} saved={saved} pushed={pushed} />}
          </div>
        )}
        {view === "library" && (
          <div style={{ maxWidth: 740, margin: "0 auto" }}>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 34, fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", color: "#1D5C4A", marginBottom: 10 }}>Article Library</h2>
              <p style={{ fontSize: 18, color: "#4A4558" }}>{library.length === 0 ? "No articles saved yet." : `${library.length} article${library.length !== 1 ? "s" : ""} saved`}</p>
            </div>
            <LibraryPanel items={library} onLoad={(item) => { setArticle(item); setSaved(true); setPushed(false); setView("reader"); }} onDelete={deleteFromLibrary} />
          </div>
        )}
      </main>
    </div>
  );
}
