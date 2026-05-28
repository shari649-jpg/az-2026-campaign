import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { saveCampaign, loadAllCampaigns, deleteCampaign } from "../../lib/campaignLibrary";

const PLATFORMS = [
  { id: "facebook",  name: "Facebook",    abbr: "FB", maxChars: 63206, bg: "#0a4fa8", text: "#fff" },
  { id: "instagram", name: "Instagram",   abbr: "IG", maxChars: 2200,  bg: "#7b1a6e", text: "#fff" },
  { id: "threads",   name: "Threads",     abbr: "TH", maxChars: 500,   bg: "#111111", text: "#fff" },
  { id: "bluesky",   name: "BlueSky",     abbr: "BS", maxChars: 300,   bg: "#0055bb", text: "#fff" },
  { id: "twitter",   name: "Twitter / X", abbr: "X",  maxChars: 280,   bg: "#0369a1", text: "#fff" },
  { id: "tiktok",    name: "TikTok",      abbr: "TK", maxChars: 2200,  bg: "#b91c1c", text: "#fff" },
];

const AUDIENCES = ["Democrat","Independent","Persuadable Republican","Disillusioned Voter","Brand New Voter"];
const STYLES = [
  { id: "neutral",         label: "Neutral" },
  { id: "pro_democrat",    label: "Pro Democrat" },
  { id: "contrast",        label: "Contrast with Opponent" },
  { id: "strong_contrast", label: "Strong Contrast" },
];
const MODIFIERS    = ["Friendly","Witty","Sarcastic","Empathetic","Professional","Excited","Funny","Dramatic","Disgusted","Happy"];
const REGEN_OPTIONS = ["Shorten","Expand","Rephrase"];

const TURQUOISE      = "#3ECFB2";
const TURQUOISE_DARK = "#1D5C4A";
const T = {
  pageBg:      "#ffffff",
  surface:     "#ffffff",
  surfaceAlt:  "#f3f4f6",
  border:      "#555555",
  borderStrong:"#111111",
  text:        "#111111",
  textMid:     "#333333",
  textMute:    "#555555",
  primary:     TURQUOISE,
  primaryDark: TURQUOISE_DARK,
  blue:        "#0044cc",
  green:       "#145214",
};

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: ${T.pageBg}; }
  body { background: ${T.pageBg} !important; color: ${T.text}; }
  textarea, input, button { font-family: 'Atkinson Hyperlegible', Georgia, serif; }
  textarea:focus, input:focus { outline: 4px solid ${TURQUOISE} !important; outline-offset: 2px; border-color: ${TURQUOISE} !important; }
  button:focus { outline: 4px solid ${TURQUOISE}; outline-offset: 3px; }
  button:active { transform: scale(0.97); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideDown { from { opacity:0; transform:translateY(-8px);} to {opacity:1;transform:translateY(0);} }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
  .spin-anim { animation: spin 0.8s linear infinite; display: inline-block; }
  .slide-down { animation: slideDown 0.2s ease; }
  .line-clamp2 { overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .generating-pulse { animation: pulse 1.5s ease-in-out infinite; }
  @media (max-width: 600px) {
    .platform-grid { grid-template-columns: 1fr !important; }
  }
`;

const S = {
  card: { background: T.surface, border: `2px solid ${T.border}`, borderRadius: 12, padding: 24 },
  label: { display:"block", fontSize:14, fontWeight:900, letterSpacing:"0.07em", textTransform:"uppercase", color:T.textMid, marginBottom:12 },
  hint: { fontSize:15, color:T.textMute, marginTop:8, lineHeight:1.5 },
  input: { width:"100%", background:T.surface, border:`2px solid ${T.border}`, borderRadius:8, padding:"12px 16px", color:T.text, fontSize:18, lineHeight:1.5 },
  textarea: { width:"100%", background:T.surface, border:`2px solid ${T.border}`, borderRadius:8, padding:"12px 16px", color:T.text, fontSize:18, lineHeight:1.6, fontFamily:"inherit" },
  btnPrimary: { background:TURQUOISE, color:TURQUOISE_DARK, fontWeight:900, padding:"15px 26px", borderRadius:8, border:`3px solid ${TURQUOISE_DARK}`, cursor:"pointer", fontSize:18, fontFamily:"inherit" },
  btnSecondary: { background:T.surface, color:T.text, fontWeight:700, padding:"15px 22px", borderRadius:8, border:`2px solid ${T.borderStrong}`, cursor:"pointer", fontSize:18, fontFamily:"inherit", display:"flex", alignItems:"center", gap:8 },
  btnDark: { background:TURQUOISE_DARK, color:"#ffffff", fontWeight:700, padding:"10px 18px", borderRadius:8, border:`2px solid ${TURQUOISE_DARK}`, cursor:"pointer", fontSize:16, fontFamily:"inherit" },
  spinner: { width:20, height:20, flexShrink:0, border:"3px solid rgba(0,0,0,0.2)", borderTopColor:TURQUOISE_DARK, borderRadius:"50%" },
  platformBadge: { width:40, height:40, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900, flexShrink:0 },
};

const LOADING_MESSAGES = [
  "Crafting your messages… 🌵",
  "Tailoring for each platform…",
  "Almost there — polishing the copy…",
  "Making every word count…",
];

function LoadingAnimation() {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % LOADING_MESSAGES.length), 2800);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ textAlign:"center", padding:"60px 20px" }}>
      <div style={{ fontSize:56, marginBottom:20 }}>✍️</div>
      <div className="generating-pulse" style={{ fontSize:22, fontWeight:700, color:TURQUOISE_DARK, marginBottom:12 }}>
        {LOADING_MESSAGES[msgIdx]}
      </div>
      <div style={{ display:"flex", justifyContent:"center", gap:8, marginTop:16 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width:10, height:10, borderRadius:"50%", background:TURQUOISE, animation:`pulse ${1 + i * 0.3}s ease-in-out infinite` }} />
        ))}
      </div>
      <p style={{ marginTop:20, fontSize:15, color:T.textMute }}>Generating all platforms at once — this takes about 10–15 seconds.</p>
    </div>
  );
}

function PlatformCard({ platform: p, message, onUpdate, onCopy, onRegen, loading, sources }) {
  const [localOpt, setLocalOpt] = useState("");
  const [showSources, setShowSources] = useState(false);
  const charCount = (message || "").length;
  const over = charCount > p.maxChars;

  const handleQuick = (opt) => {
    const next = localOpt === opt ? "" : opt;
    setLocalOpt(next);
    onRegen(p.id, next);
  };

  return (
    <div style={{ ...S.card, borderWidth:3 }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
        <span style={{ ...S.platformBadge, background:p.bg, color:p.text }}>{p.abbr}</span>
        <span style={{ fontWeight:700, color:T.text, fontSize:20 }}>{p.name}</span>
        <span style={{ marginLeft:"auto", fontFamily:"monospace", fontSize:15, fontWeight:700, color: over ? "#c41e1e" : T.textMute }}>
          {charCount.toLocaleString()} / {p.maxChars.toLocaleString()}
        </span>
      </div>
      {loading ? (
        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"32px 0", color:T.textMid }}>
          <span className="spin-anim" style={{ ...S.spinner }} />
          <span style={{ fontSize:18, fontWeight:600 }}>Regenerating…</span>
        </div>
      ) : (
        <textarea rows={5} style={{ ...S.textarea, resize:"vertical" }} value={message || ""}
          onChange={e => onUpdate(p.id, e.target.value)} aria-label={`${p.name} message text`} />
      )}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:14, flexWrap:"wrap" }}>
        <button style={S.btnDark} onClick={() => onCopy(message || "", p.name)}>Copy Text</button>
        <button style={{ ...S.btnDark, opacity: loading ? 0.5 : 1 }} disabled={loading} onClick={() => onRegen(p.id, localOpt)}>Regenerate</button>
        {sources && (
          <button onClick={() => setShowSources(v => !v)} style={{ padding:"10px 16px", borderRadius:8, fontSize:14, fontWeight:700, border:`2px solid ${T.border}`, background: showSources ? T.surfaceAlt : T.surface, color:T.textMid, cursor:"pointer", fontFamily:"inherit" }}>
            {showSources ? "Hide Sources ▲" : "Sources ▼"}
          </button>
        )}
        <div style={{ display:"flex", gap:8, marginLeft:"auto", flexWrap:"wrap" }}>
          {REGEN_OPTIONS.map(o => (
            <button key={o} onClick={() => handleQuick(o)} style={{
              padding:"8px 16px", borderRadius:8, fontSize:15, fontWeight:700,
              border: localOpt === o ? `3px solid ${T.borderStrong}` : `2px solid ${T.border}`,
              background: localOpt === o ? T.borderStrong : T.surface,
              color: localOpt === o ? "#fff" : T.text,
              cursor:"pointer", fontFamily:"inherit",
            }}>{o}</button>
          ))}
        </div>
      </div>
      {showSources && sources && (
        <div style={{ marginTop:14, padding:16, background:T.surfaceAlt, borderRadius:8, border:`1px solid ${T.border}` }}>
          <div style={{ fontSize:12, fontWeight:900, letterSpacing:"0.08em", textTransform:"uppercase", color:T.textMute, marginBottom:8 }}>Sources & Claims</div>
          <div style={{ fontSize:15, color:T.textMid, lineHeight:1.7, whiteSpace:"pre-wrap" }}>{sources}</div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView]               = useState("form");
  const [formData, setFormData]       = useState({ issue:"", focalPoint:"", audience:"", voice:"", style:"", modifier:"", regenOption:"", platforms:[] });
  const [messages, setMessages]       = useState({});
  const [sources, setSources]         = useState(null);
  const [generating, setGenerating]   = useState(false);
  const [platLoad, setPlatLoad]       = useState({});
  const [campaigns, setCampaigns]     = useState([]);
  const [saveModal, setSaveModal]     = useState(false);
  const [campName, setCampName]       = useState("");
  const [notif, setNotif]             = useState(null);
  const [hashtags, setHashtags]       = useState(null);
  const [hashLoading, setHashLoading] = useState(false);

  const location = useLocation();

  useEffect(() => { loadCampaigns(); }, []);

  useEffect(() => {
    if (location.state?.loadCampaign) {
      const c = location.state.loadCampaign;
      setFormData(c.formData);
      setMessages(c.messages);
      setView("results");
    }
  }, [location.state]);

  const loadCampaigns = async () => {
    try {
      const all = await loadAllCampaigns();
      setCampaigns(all.filter(c => c.tool === "message-machine"));
    } catch {}
  };

  const notify = (msg, type="ok") => { setNotif({msg,type}); setTimeout(()=>setNotif(null),3500); };
  const upd = (k,v) => setFormData(p=>({...p,[k]:v}));
  const togglePlatform = (id) => setFormData(p=>({ ...p, platforms: p.platforms.includes(id) ? p.platforms.filter(x=>x!==id) : [...p.platforms,id] }));

  const containsURL = (text) => /https?:\/\/|www\./i.test(text);

  const buildPrompt = (platforms, regenOpt) => {
    const plats = PLATFORMS.filter(p=>platforms.includes(p.id)).map(p=>`${p.name} (max ${p.maxChars} chars)`).join(", ");
    const audience = formData.audience || "general moderate voter who is not very engaged in politics";
    const style    = (formData.style || "neutral").replace(/_/g," ");
    const tone     = formData.modifier ? `Tone: ${formData.modifier}` : "";
    return `You are an expert political messaging strategist for progressive activists in Arizona.

Issue/Content: ${formData.issue}
Focal Point: ${formData.focalPoint || "Not specified"}
Target Audience: ${audience}
Voice/Persona: ${formData.voice || "Not specified"}
Style: ${style}
${tone}
${regenOpt ? `Modifier: ${regenOpt} the message significantly` : ""}

STRICT RULES:
- Write ALL messages in the THIRD PERSON. Never use "I", "my", "we", or "our" as if speaking for the reader.
- NEVER invent or make up names of people, places, organizations, or specific statistics. Only use names or facts that appear explicitly in the Issue/Content provided by the user.
- Do NOT include any hashtags. Write clean prose only.
- Do NOT include any URLs or links.

Generate compelling social media posts for: ${plats}

Platform guidance:
- Facebook: Detailed storytelling, clear call to action, 2–5 paragraphs
- Instagram: Visual-focused language, emotional hook at start
- Threads: Conversational, 2–4 sentences, engaging or thought-provoking
- BlueSky: Thoughtful, community-focused, strict 300-char limit
- Twitter/X: Punchy headline style, max 280 chars
- TikTok: Trendy hook in first line, energetic language

After generating all platform messages, add a "sources" field that lists the key claims and facts used in the messages as a plain text list, so users can verify them. Format each as "• [claim or fact]".

RESPOND ONLY WITH VALID JSON. Zero markdown. Zero backticks. Zero explanation.
Only include these platform ids: ${platforms.join(", ")} plus a "sources" key.
Format: {"platform_id": "message text", ..., "sources": "• claim 1\n• claim 2"}`;
  };

  const callAPI = async (prompt, maxTokens=1200) => {
    const res = await fetch("/.netlify/functions/generate-message", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:maxTokens, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    const text = data.content.map(i=>i.text||"").join("");
    return JSON.parse(text.replace(/```json|```/g,"").trim());
  };

  const validate = () => {
    if (!formData.issue.trim()) return "Please describe the issue or paste article text in the Issue field.";
    if (containsURL(formData.issue)) return "Links aren't supported in the Issue field — please paste the article text directly instead of a URL.";
    if (!formData.platforms.length) return "Please select at least one platform to generate messages for.";
    return null;
  };

  const generateAll = async () => {
    const err = validate(); if (err) { notify(err,"err"); return; }
    setGenerating(true); setHashtags(null); setSources(null);
    try {
      const r = await callAPI(buildPrompt(formData.platforms, formData.regenOption));
      const { sources: s, ...msgs } = r;
      setMessages(msgs);
      setSources(s || null);
      setView("results");
    } catch {
      notify("Generation failed — please check that your Issue field has enough text to work with and try again.","err");
    }
    setGenerating(false);
  };

  const regenPlatform = async (platformId, regenOpt) => {
    setPlatLoad(p=>({...p,[platformId]:true}));
    try {
      const r = await callAPI(buildPrompt([platformId],regenOpt));
      const { sources: s, ...msgs } = r;
      setMessages(p=>({...p,...msgs}));
      if (s) setSources(s);
    } catch { notify("Regeneration failed — please try again.","err"); }
    setPlatLoad(p=>({...p,[platformId]:false}));
  };

  const copyText = async (text, name) => { await navigator.clipboard.writeText(text); notify(`${name} message copied!`); };

  const generateHashtags = async () => {
    setHashLoading(true); setHashtags(null);
    try {
      const platNames = PLATFORMS.filter(p=>formData.platforms.includes(p.id)).map(p=>p.name).join(", ");
      const prompt = `You are a social media expert for progressive political campaigns in Arizona.
Issue: ${formData.issue}
Focal Point: ${formData.focalPoint || "Not specified"}
Target Audience: ${formData.audience || "general voters"}
Platforms: ${platNames}
Suggest relevant hashtags organized by category.
RESPOND ONLY WITH VALID JSON. No markdown. No backticks. No explanation.
Format: {"campaign":["#tag"],"issue":["#tag"],"audience":["#tag"],"trending":["#tag"],"arizona":["#tag"]}
Each array: 4–8 hashtags. Only include relevant categories.`;
      const r = await callAPI(prompt, 500);
      setHashtags(r);
    } catch { notify("Could not generate hashtags — please try again.","err"); }
    setHashLoading(false);
  };

  const copyHashtags = async (tags) => { await navigator.clipboard.writeText(tags.join(" ")); notify("Hashtags copied!"); };

  const handleSaveCampaign = async () => {
    if (!campName.trim()) return;
    try {
      const id = await saveCampaign("message-machine", {
        name: campName.trim(),
        date: new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
        formData: { ...formData },
        messages: { ...messages },
      });
      setCampaigns(prev => [{ id, tool:"message-machine", name:campName.trim(), formData:{...formData}, messages:{...messages} }, ...prev]);
      setSaveModal(false); setCampName(""); notify("Campaign saved to shared library!");
    } catch { notify("Save failed — please try again.","err"); }
  };

  const loadCampaign = (c) => { setFormData(c.formData); setMessages(c.messages); setHashtags(null); setView("results"); notify(`Loaded: ${c.name}`); };

  const handleDeleteCampaign = async (id) => {
    try {
      await deleteCampaign(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      notify("Campaign deleted.");
    } catch { notify("Delete failed — please try again.","err"); }
  };

  const startNewCampaign = () => {
    setFormData({ issue:"", focalPoint:"", audience:"", voice:"", style:"", modifier:"", regenOption:"", platforms:[] });
    setMessages({}); setSources(null); setHashtags(null); setView("form");
  };

  const hasMessages = Object.keys(messages).length > 0;

  const tabStyle = (active) => ({
    padding:"12px 22px", borderRadius:8, fontSize:18, fontWeight:700, cursor:"pointer",
    border: active ? `3px solid ${TURQUOISE_DARK}` : `2px solid transparent`,
    background: active ? TURQUOISE_DARK : "transparent",
    color: active ? "#ffffff" : T.text,
    transition:"all 0.15s", fontFamily:"inherit",
  });

  const stickyBtn = (onClick, label, disabled) => (
    <button onClick={onClick} disabled={!!disabled} style={{
      padding:"10px 18px", borderRadius:8, fontSize:15, fontWeight:700, cursor: disabled ? "not-allowed" : "pointer",
      background: TURQUOISE, color: TURQUOISE_DARK, border:`2px solid ${TURQUOISE_DARK}`, fontFamily:"inherit",
      opacity: disabled ? 0.5 : 1,
    }}>{label}</button>
  );

  return (
    <div style={{ minHeight:"100vh", background:T.pageBg, color:T.text, fontFamily:"'Atkinson Hyperlegible', Georgia, serif" }}>
      <style>{globalCSS}</style>

      {/* DISCLAIMER */}
      <div style={{ background:"#fffbe6", borderBottom:`2px solid #e6c200`, padding:"10px 20px", textAlign:"center", fontSize:14, color:"#7a6000", fontWeight:600 }}>
        ⚠️ AI-generated content — always verify facts and claims before publishing.
      </div>

      {/* HEADER */}
      <header style={{ background:T.pageBg, borderBottom:`4px solid ${TURQUOISE_DARK}`, position:"sticky", top:0, zIndex:40 }}>
        <div style={{ maxWidth:860, margin:"0 auto", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:48, height:48, background:TURQUOISE, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:24, color:TURQUOISE_DARK }}>M</div>
            <h1 style={{ fontSize:26, fontWeight:900, color:T.text }}>Message Machine</h1>
          </div>
          <nav style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
            {view === "results" && (
              <>
                {stickyBtn(startNewCampaign, "+ New Campaign")}
                {stickyBtn(() => setView("form"), "← Edit Parameters")}
                {stickyBtn(generateAll, generating ? "Generating…" : "Regenerate All", generating)}
                {stickyBtn(() => setSaveModal(true), "Save Campaign")}
              </>
            )}
            {view !== "results" && [
              { id:"form", label:"Create" },
              { id:"campaigns", label:`Library (${campaigns.length})` },
            ].map(tab => (
              <button key={tab.id} onClick={()=>setView(tab.id)} style={tabStyle(view===tab.id)}>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* TOAST */}
      {notif && (
        <div className="slide-down" role="alert" style={{ position:"fixed", top:80, left:"50%", transform:"translateX(-50%)", zIndex:100, padding:"14px 28px", borderRadius:10, fontSize:18, fontWeight:700, background: notif.type==="err" ? "#b91c1c" : T.green, color:"#fff", border:`3px solid ${notif.type==="err" ? "#7f1d1d" : "#0d3b0d"}`, boxShadow:"0 4px 24px rgba(0,0,0,0.35)", whiteSpace:"nowrap" }}>
          {notif.msg}
        </div>
      )}

      {/* MAIN */}
      <main style={{ maxWidth:860, margin:"0 auto", padding:"36px 20px" }}>

        {/* ══════ FORM VIEW ══════ */}
        {view==="form" && (
          <div style={{ maxWidth:740, margin:"0 auto" }}>
            {generating ? <LoadingAnimation /> : (
              <>
                <div style={{ marginBottom:36 }}>
                  <h2 style={{ fontSize:36, fontWeight:900, color:T.text, marginBottom:10 }}>Create Your Message</h2>
                  <p style={{ color:T.textMid, fontSize:20, lineHeight:1.5 }}>Fill in the fields below to generate platform-ready activist messages.</p>
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:22 }}>

                  {/* Issue */}
                  <section style={S.card}>
                    <label htmlFor="issue" style={S.label}>Issue / Content <span style={{color:TURQUOISE_DARK}}>*</span></label>
                    <textarea id="issue" rows={6} style={{...S.textarea,resize:"vertical"}}
                      placeholder="Describe the issue or paste article text here. Do not paste URLs — paste the article text directly."
                      value={formData.issue} onChange={e=>upd("issue",e.target.value)} />
                    <p style={S.hint}>Paste article text, talking points, or a summary. Links are not supported — copy and paste the text content instead.</p>
                  </section>

                  {/* Focal Point */}
                  <section style={S.card}>
                    <label htmlFor="focal" style={S.label}>Focal Point <span style={{ fontWeight:400, fontSize:13, textTransform:"none", letterSpacing:0, color:T.textMute }}>(optional)</span></label>
                    <input id="focal" type="text" style={S.input}
                      placeholder='e.g. "Hobbs fights for rural Arizona" or "Local school funding at stake"'
                      value={formData.focalPoint} onChange={e=>upd("focalPoint",e.target.value)} />
                    <p style={S.hint}>The core angle or frame you want emphasized in every message</p>
                  </section>

                  {/* Audience + Voice */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
                    <section style={S.card}>
                      <fieldset style={{ border:"none", padding:0 }}>
                        <legend style={S.label}>Target Audience <span style={{ fontWeight:400, fontSize:13, textTransform:"none", letterSpacing:0, color:T.textMute }}>(optional)</span></legend>
                        <p style={{ ...S.hint, marginTop:0, marginBottom:10 }}>Default: general moderate voter</p>
                        <div style={{ display:"flex", flexDirection:"column", gap:12, marginTop:4 }}>
                          {AUDIENCES.map(a => {
                            const on = formData.audience===a;
                            return (
                              <label key={a} style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer" }}>
                                <input type="radio" name="audience" value={a} checked={on} onChange={()=>upd("audience", on ? "" : a)}
                                  onClick={()=>{ if(on) upd("audience",""); }}
                                  style={{ width:24, height:24, accentColor:TURQUOISE, cursor:"pointer", flexShrink:0 }} />
                                <span style={{ fontSize:18, fontWeight: on ? 700 : 400, color:T.text }}>{a}</span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    </section>
                    <section style={S.card}>
                      <label htmlFor="voice" style={S.label}>Voice / Persona <span style={{ fontWeight:400, fontSize:13, textTransform:"none", letterSpacing:0, color:T.textMute }}>(optional)</span></label>
                      <input id="voice" type="text" style={S.input}
                        placeholder='e.g. "Rural AZ neighborly mom" or "GenZ activist"'
                        value={formData.voice} onChange={e=>upd("voice",e.target.value)} />
                      <p style={S.hint}>The identity or perspective to write from</p>
                    </section>
                  </div>

                  {/* Style + Modifier */}
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
                    <section style={S.card}>
                      <fieldset style={{ border:"none", padding:0 }}>
                        <legend style={S.label}>Style <span style={{ fontWeight:400, fontSize:13, textTransform:"none", letterSpacing:0, color:T.textMute }}>(optional)</span></legend>
                        <p style={{ ...S.hint, marginTop:0, marginBottom:10 }}>Default: Neutral</p>
                        <div style={{ display:"flex", flexDirection:"column", gap:12, marginTop:4 }}>
                          {STYLES.map(st => {
                            const on = formData.style===st.id;
                            return (
                              <label key={st.id} style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer" }}>
                                <input type="radio" name="style" value={st.id} checked={on}
                                  onChange={()=>upd("style", on ? "" : st.id)}
                                  onClick={()=>{ if(on) upd("style",""); }}
                                  style={{ width:24, height:24, accentColor:TURQUOISE, cursor:"pointer", flexShrink:0 }} />
                                <span style={{ fontSize:18, fontWeight: on ? 700 : 400, color:T.text }}>{st.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    </section>
                    <section style={S.card}>
                      <fieldset style={{ border:"none", padding:0 }}>
                        <legend style={S.label}>Tone Modifier <span style={{ fontWeight:400, fontSize:13, textTransform:"none", letterSpacing:0, color:T.textMute }}>(optional)</span></legend>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:12, marginTop:4 }}>
                          {MODIFIERS.map(m => {
                            const on = formData.modifier===m;
                            return (
                              <label key={m} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                                <input type="radio" name="modifier" value={m} checked={on}
                                  onChange={()=>upd("modifier", on ? "" : m)}
                                  onClick={()=>{ if(on) upd("modifier",""); }}
                                  style={{ width:22, height:22, accentColor:TURQUOISE, cursor:"pointer", flexShrink:0 }} />
                                <span style={{ fontSize:17, fontWeight: on ? 700 : 400, color:T.text }}>{m}</span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    </section>
                  </div>

                  {/* Generation Hint */}
                  <section style={S.card}>
                    <fieldset style={{ border:"none", padding:0 }}>
                      <legend style={S.label}>Generation Hint <span style={{ fontWeight:400, fontSize:14, textTransform:"none", letterSpacing:0, color:T.textMute }}>(optional)</span></legend>
                      <div style={{ display:"flex", gap:16, marginTop:8, flexWrap:"wrap" }}>
                        {REGEN_OPTIONS.map(o => {
                          const on = formData.regenOption===o;
                          return (
                            <label key={o} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                              <input type="radio" name="regenOption" value={o} checked={on}
                                onChange={()=>upd("regenOption",on?"":o)}
                                onClick={()=>{ if(on) upd("regenOption",""); }}
                                style={{ width:22, height:22, accentColor:TURQUOISE, cursor:"pointer", flexShrink:0 }} />
                              <span style={{ fontSize:17, fontWeight: on ? 700 : 400, color:T.text }}>{o}</span>
                            </label>
                          );
                        })}
                      </div>
                      <p style={S.hint}>Bias the generation toward shorter, longer, or rephrased outputs</p>
                    </fieldset>
                  </section>

                  {/* Platforms */}
                  <section style={S.card}>
                    <fieldset style={{ border:"none", padding:0 }}>
                      <legend style={S.label}>Platforms <span style={{color:TURQUOISE_DARK}}>*</span></legend>
                      <div className="platform-grid" style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12, marginTop:8 }}>
                        {PLATFORMS.map(p => {
                          const on = formData.platforms.includes(p.id);
                          return (
                            <label key={p.id} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:10, cursor:"pointer", border: on ? `3px solid ${TURQUOISE_DARK}` : `2px solid ${T.border}`, background: on ? "#e8f8f5" : T.surface, transition:"all 0.15s" }}>
                              <input type="checkbox" checked={on} onChange={()=>togglePlatform(p.id)}
                                style={{ width:24, height:24, accentColor:TURQUOISE, cursor:"pointer", flexShrink:0 }} />
                              <span style={{ ...S.platformBadge, background:p.bg, color:p.text }}>{p.abbr}</span>
                              <span style={{ fontSize:17, fontWeight: on ? 700 : 500, color:T.text }}>{p.name}</span>
                            </label>
                          );
                        })}
                      </div>
                      {formData.platforms.length > 0 && (
                        <p style={{ ...S.hint, marginTop:12, fontWeight:700, color:T.textMid }}>
                          {formData.platforms.length} platform{formData.platforms.length!==1?"s":""} selected
                        </p>
                      )}
                    </fieldset>
                  </section>

                  {/* Generate */}
                  <button onClick={generateAll} disabled={generating} style={{ ...S.btnPrimary, width:"100%", fontSize:21, padding:"20px 28px", display:"flex", alignItems:"center", justifyContent:"center", gap:14, opacity: generating ? 0.65 : 1, cursor: generating ? "not-allowed" : "pointer" }}>
                    Generate Messages →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════ RESULTS VIEW ══════ */}
        {view==="results" && (
          <div style={{ maxWidth:740, margin:"0 auto" }}>
            <div style={{ marginBottom:36 }}>
              <h2 style={{ fontSize:36, fontWeight:900, color:T.text, marginBottom:10 }}>Generated Messages</h2>
              <p style={{ color:T.textMid, fontSize:20 }}>Edit inline, copy, or regenerate each platform individually.</p>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
              {PLATFORMS.filter(p=>messages[p.id]!==undefined).map(p => (
                <PlatformCard key={p.id} platform={p} message={messages[p.id]}
                  onUpdate={(id,text)=>setMessages(prev=>({...prev,[id]:text}))}
                  onCopy={copyText} onRegen={regenPlatform} loading={!!platLoad[p.id]}
                  sources={sources} />
              ))}
            </div>

            {/* Hashtag Section */}
            <div style={{ marginTop:40, borderTop:`4px solid ${TURQUOISE_DARK}`, paddingTop:36 }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:16, marginBottom: hashtags || hashLoading ? 28 : 0 }}>
                <div>
                  <h3 style={{ fontSize:26, fontWeight:900, color:T.text, marginBottom:6 }}>Hashtag Suggestions</h3>
                  <p style={{ fontSize:18, color:T.textMid, lineHeight:1.5 }}>Generate hashtags separately — add them to any post you choose.</p>
                </div>
                <button onClick={generateHashtags} disabled={hashLoading} style={{ ...S.btnPrimary, fontSize:18, padding:"15px 26px", display:"flex", alignItems:"center", gap:10, opacity: hashLoading ? 0.65 : 1, cursor: hashLoading ? "not-allowed" : "pointer" }}>
                  {hashLoading ? <><span className="spin-anim" style={{ ...S.spinner }} /> Generating…</> : hashtags ? "Regenerate Hashtags" : "Suggest Hashtags  #"}
                </button>
              </div>
              {hashtags && (
                <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                  {Object.entries(hashtags).map(([cat, tags]) => (
                    <div key={cat} style={{ background:T.surfaceAlt, border:`2px solid ${T.border}`, borderRadius:12, padding:22 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
                        <span style={{ fontSize:14, fontWeight:900, letterSpacing:"0.07em", textTransform:"uppercase", color:T.textMid }}>{cat}</span>
                        <button onClick={()=>copyHashtags(tags)} style={{ ...S.btnDark, fontSize:15, padding:"8px 18px" }}>Copy All</button>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                        {tags.map(tag => (
                          <button key={tag} onClick={()=>copyHashtags([tag])} style={{ fontSize:17, fontWeight:700, padding:"9px 18px", background:T.surface, color:TURQUOISE_DARK, border:`2px solid ${TURQUOISE}`, borderRadius:8, cursor:"pointer", fontFamily:"inherit" }}>{tag}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p style={{ fontSize:15, color:T.textMute }}>Click any hashtag to copy it individually, or use Copy All for a whole category.</p>
                </div>
              )}
            </div>

            {/* Return to top */}
            <button onClick={() => window.scrollTo({ top:0, behavior:"smooth" })}
              style={{ ...S.btnSecondary, margin:"32px auto 0", fontSize:17, padding:"14px 28px", justifyContent:"center" }}>
              ↑ Return to Top
            </button>
          </div>
        )}

        {/* ══════ CAMPAIGNS VIEW ══════ */}
        {view==="campaigns" && (
          <div style={{ maxWidth:740, margin:"0 auto" }}>
            <div style={{ marginBottom:36 }}>
              <h2 style={{ fontSize:36, fontWeight:900, color:T.text, marginBottom:10 }}>Saved Campaigns</h2>
              <p style={{ color:T.textMid, fontSize:20 }}>
                {campaigns.length===0 ? "No campaigns saved yet." : `${campaigns.length} campaign${campaigns.length!==1?"s":""} in shared library`}
              </p>
            </div>
            {campaigns.length===0 ? (
              <div style={{ textAlign:"center", padding:"64px 0" }}>
                <div style={{ fontSize:60, marginBottom:18 }}>📂</div>
                <p style={{ color:T.textMid, fontSize:22, fontWeight:700, marginBottom:10 }}>No saved campaigns yet</p>
                <p style={{ color:T.textMute, fontSize:18 }}>Generate messages and save your first campaign.</p>
                <button onClick={()=>setView("form")} style={{ ...S.btnPrimary, marginTop:28, fontSize:18, padding:"15px 30px" }}>Create Campaign</button>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                {campaigns.map(c => (
                  <div key={c.id} style={{ ...S.card, borderWidth:3, display:"flex", alignItems:"flex-start", gap:18 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:12, flexWrap:"wrap", marginBottom:10 }}>
                        <h3 style={{ fontSize:22, fontWeight:900, color:T.text }}>{c.name}</h3>
                        <span style={{ color:T.textMute, fontSize:16 }}>{c.date}</span>
                      </div>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
                        {c.formData?.audience && <span style={{ fontSize:15, fontWeight:700, padding:"4px 12px", background:T.surfaceAlt, color:T.text, borderRadius:20, border:`1px solid ${T.border}` }}>{c.formData.audience}</span>}
                        {c.formData?.modifier && <span style={{ fontSize:15, fontWeight:700, padding:"4px 12px", background:T.surfaceAlt, color:T.text, borderRadius:20, border:`1px solid ${T.border}` }}>{c.formData.modifier}</span>}
                        {(c.formData?.platforms||[]).map(pid => {
                          const pl = PLATFORMS.find(p=>p.id===pid);
                          return pl ? <span key={pid} style={{ fontSize:14, fontWeight:900, padding:"4px 12px", borderRadius:20, background:pl.bg, color:pl.text }}>{pl.abbr}</span> : null;
                        })}
                      </div>
                      {c.formData?.issue && <p className="line-clamp2" style={{ color:T.textMid, fontSize:17, lineHeight:1.5 }}>{c.formData.issue.substring(0,200)}{c.formData.issue.length>200?"…":""}</p>}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:10, flexShrink:0 }}>
                      <button onClick={()=>loadCampaign(c)} style={{ ...S.btnPrimary, padding:"12px 24px", fontSize:17 }}>Load</button>
                      <button onClick={()=>handleDeleteCampaign(c.id)} style={{ padding:"12px 24px", fontSize:17, fontWeight:700, background:T.surface, color:"#c41e1e", border:"2px solid #c41e1e", borderRadius:8, cursor:"pointer", fontFamily:"inherit" }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* SAVE MODAL */}
      {saveModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={e=>{ if(e.target===e.currentTarget){setSaveModal(false);setCampName("");} }}>
          <div style={{ background:T.surface, border:`3px solid ${TURQUOISE_DARK}`, borderRadius:16, padding:36, maxWidth:500, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.35)" }}>
            <h3 style={{ fontSize:28, fontWeight:900, color:T.text, marginBottom:10 }}>Save to Shared Library</h3>
            <p style={{ color:T.textMid, fontSize:18, marginBottom:22 }}>This campaign will be visible to all coalition users.</p>
            <label htmlFor="campName" style={S.label}>Campaign Name</label>
            <input id="campName" type="text" style={{ ...S.input, marginBottom:22 }}
              placeholder='e.g. "Education Funding — May 2026"'
              value={campName} onChange={e=>setCampName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleSaveCampaign()} autoFocus />
            <div style={{ display:"flex", gap:14 }}>
              <button onClick={handleSaveCampaign} disabled={!campName.trim()} style={{ ...S.btnPrimary, flex:1, fontSize:19, padding:"15px", opacity:campName.trim()?1:0.5, cursor:campName.trim()?"pointer":"not-allowed" }}>Save</button>
              <button onClick={()=>{setSaveModal(false);setCampName("");}} style={{ ...S.btnSecondary, flex:1, fontSize:19, padding:"15px", justifyContent:"center" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
