import { useState, useEffect } from "react";
import { saveCampaign as fbSave, loadAllCampaigns, deleteCampaign as fbDelete } from "../../lib/campaignLibrary";

const PLATFORMS = [
  { id: "facebook", name: "Facebook", abbr: "FB", maxChars: 63206, bg: "#0a4fa8", text: "#fff" },
  { id: "instagram", name: "Instagram", abbr: "IG", maxChars: 2200, bg: "#7b1a6e", text: "#fff" },
  { id: "threads", name: "Threads", abbr: "TH", maxChars: 500, bg: "#111111", text: "#fff" },
  { id: "bluesky", name: "BlueSky", abbr: "BS", maxChars: 300, bg: "#0055bb", text: "#fff" },
  { id: "twitter", name: "Twitter / X", abbr: "X", maxChars: 280, bg: "#0369a1", text: "#fff" },
  { id: "tiktok", name: "TikTok", abbr: "TK", maxChars: 2200, bg: "#b91c1c", text: "#fff" },
];

const AUDIENCES = ["Democrat","Independent","Persuadable Republican","Disillusioned Voter","Brand New Voter"];
const STYLES = [
  { id: "neutral", label: "Neutral" },
  { id: "pro_democrat", label: "Pro Democrat" },
  { id: "contrast", label: "Contrast with Opponent" },
  { id: "strong_contrast", label: "Strong Contrast" },
];
const MODIFIERS = ["Casual","Friendly","Witty","Sarcastic","Empathetic","Professional","Excited","Funny","Dramatic","Disgusted","Angry"];
const REGEN_OPTIONS = [
  { id: "shorten", label: "Shorten: more concise" },
  { id: "expand",  label: "Expand: more detailed" },
];

// Defaults used when optional fields are left blank
const DEFAULT_AUDIENCE = "general moderate voter who is not very engaged in politics";
const DEFAULT_STYLE    = "neutral";

const T = {
  pageBg:   "#ffffff",
  surface:  "#ffffff",
  surfaceAlt:"#f3f4f6",
  border:   "#555555",
  borderStrong: "#111111",
  text:     "#111111",
  textMid:  "#333333",
  textMute: "#555555",
  teal:     "#1D5C4A",
  tealDark: "#164437",
  gold:     "#F5C842",
  goldDark: "#d4aa30",
  turquoise:"#3ECFB2",
  charcoal: "#4A4558",
  green:    "#145214",
  red:      "#c41e1e",
};

// Desert loading frames — emoji scenes cycle every 5s
const DESERT_FRAMES = [
  { emoji: "🌵", label: "Summoning the desert spirits…" },
  { emoji: "🦅", label: "Eagle-eyed strategists at work…" },
  { emoji: "🥵", label: "Arizona heat activating your posts…" },
  { emoji: "🏜️", label: "Grand Canyon depth incoming…" },
  { emoji: "🦎", label: "Lizard brain engaged for messaging…" },
  { emoji: "🌅", label: "Crafting your sunset moment…" },
  { emoji: "🐍", label: "Slithering through the talking points…" },
  { emoji: "🌵☀️🌵", label: "Peak desert vibes loading…" },
  { emoji: "🦩", label: "Flamingo-level finesse incoming…" },
  { emoji: "🌵", label: "Almost there — cacti never rush…" },
];

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: ${T.pageBg}; }
  body { background: ${T.pageBg} !important; color: ${T.text}; }
  textarea, input, button { font-family: 'Atkinson Hyperlegible', Georgia, serif; }
  textarea:focus, input:focus {
    outline: 4px solid ${T.turquoise} !important;
    outline-offset: 2px;
    border-color: ${T.teal} !important;
  }
  button:focus { outline: 4px solid ${T.turquoise}; outline-offset: 3px; }
  button:active { transform: scale(0.97); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideDown { from { opacity:0; transform:translateY(-8px);} to {opacity:1;transform:translateY(0);} }
  @keyframes fadeSwap { 0%{opacity:0;transform:scale(0.7) translateY(8px);} 20%{opacity:1;transform:scale(1) translateY(0);} 80%{opacity:1;transform:scale(1) translateY(0);} 100%{opacity:0;transform:scale(0.8) translateY(-8px);} }
  @keyframes pulseGlow { 0%,100%{box-shadow:0 0 0 0 rgba(62,207,178,0.3);} 50%{box-shadow:0 0 0 18px rgba(62,207,178,0);} }
  @keyframes tumbleweed { 0%{transform:translateX(-40px) rotate(0deg);opacity:0;} 20%{opacity:1;} 80%{opacity:1;} 100%{transform:translateX(40px) rotate(360deg);opacity:0;} }
  @keyframes sunArc { 
    0%   { left: -10px; bottom: 28px; opacity: 0;   transform: scale(0.8); }
    8%   { opacity: 1; }
    25%  { left: 40px;  bottom: 90px; }
    50%  { left: 95px;  bottom: 125px; transform: scale(1.2); }
    75%  { left: 150px; bottom: 90px; }
    92%  { opacity: 1; }
    100% { left: 210px; bottom: 28px; opacity: 0;   transform: scale(0.8); }
  }
  .spin-anim { animation: spin 0.8s linear infinite; display: inline-block; }
  .slide-down { animation: slideDown 0.2s ease; }
  .desert-emoji { animation: fadeSwap 5s ease-in-out; display:inline-block; }
  .line-clamp2 { overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  @media (max-width: 520px) {
    .platform-grid { grid-template-columns: 1fr !important; }
  }
`;

/* ── shared style objects ── */
const S = {
  card: {
    background: T.surface,
    border: `2px solid ${T.border}`,
    borderRadius: 12,
    padding: 24,
  },
  label: {
    display: "block",
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: T.textMid,
    marginBottom: 12,
  },
  hint: { fontSize: 15, color: T.textMute, marginTop: 8, lineHeight: 1.5 },
  input: {
    width: "100%",
    background: T.surface,
    border: `2px solid ${T.border}`,
    borderRadius: 8,
    padding: "12px 16px",
    color: T.text,
    fontSize: 18,
    lineHeight: 1.5,
  },
  textarea: {
    width: "100%",
    background: T.surface,
    border: `2px solid ${T.border}`,
    borderRadius: 8,
    padding: "12px 16px",
    color: T.text,
    fontSize: 18,
    lineHeight: 1.6,
    fontFamily: "inherit",
  },
  btnPrimary: {
    background: T.teal,
    color: "#ffffff",
    fontWeight: 900,
    padding: "15px 26px",
    borderRadius: 8,
    border: `3px solid ${T.tealDark}`,
    cursor: "pointer",
    fontSize: 18,
    fontFamily: "inherit",
  },
  btnSecondary: {
    background: T.surface,
    color: T.text,
    fontWeight: 700,
    padding: "15px 22px",
    borderRadius: 8,
    border: `2px solid ${T.borderStrong}`,
    cursor: "pointer",
    fontSize: 18,
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  btnDark: {
    background: T.borderStrong,
    color: "#ffffff",
    fontWeight: 700,
    padding: "10px 18px",
    borderRadius: 8,
    border: `2px solid ${T.borderStrong}`,
    cursor: "pointer",
    fontSize: 16,
    fontFamily: "inherit",
  },
  spinner: {
    width: 20,
    height: 20,
    flexShrink: 0,
    border: "3px solid rgba(0,0,0,0.2)",
    borderTopColor: T.borderStrong,
    borderRadius: "50%",
  },
  platformBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 900,
    flexShrink: 0,
  },
};

/* ── Desert Loading Screen ── */
function DesertLoader() {
  const [frameIdx, setFrameIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrameIdx(i => (i + 1) % DESERT_FRAMES.length);
      setAnimKey(k => k + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const frame = DESERT_FRAMES[frameIdx];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "linear-gradient(160deg, #1D5C4A 0%, #0f3329 50%, #2a1a08 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 32,
    }}>
      {/* Stars */}
      <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
        {[...Array(18)].map((_,i) => (
          <div key={i} style={{
            position:"absolute",
            left: `${(i * 37 + 11) % 100}%`,
            top: `${(i * 53 + 7) % 60}%`,
            width: i % 3 === 0 ? 3 : 2,
            height: i % 3 === 0 ? 3 : 2,
            borderRadius: "50%",
            background: "#F5C842",
            opacity: 0.3 + (i % 4) * 0.15,
          }} />
        ))}
      </div>

      {/* Scene: emoji on ground, sun arcing above it */}
      <div style={{ position: "relative", width: 220, height: 160, marginBottom: 24 }}>
        {/* Sun arcing above */}
        <span key={`sun-${animKey}`} style={{
          position: "absolute",
          fontSize: 30,
          animation: "sunArc 5s ease-in-out infinite",
        }}>☀️</span>
        {/* Horizon line */}
        <div style={{ position: "absolute", bottom: 28, left: 0, right: 0, height: 2, background: "rgba(245,200,66,0.3)", borderRadius: 1 }} />
        {/* Emoji sitting on the horizon */}
        <div key={animKey} className="desert-emoji" style={{
          position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
          fontSize: 64, lineHeight: 1,
        }}>
          {frame.emoji}
        </div>
      </div>

      {/* Dots */}
      <div style={{ display:"flex", gap:10, marginBottom:24 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: 10, height: 10, borderRadius: "50%",
            background: i === frameIdx % 3 ? "#F5C842" : "rgba(255,255,255,0.25)",
            transition: "background 0.4s",
          }} />
        ))}
      </div>

      <div style={{ fontFamily:"'Atkinson Hyperlegible', Georgia, serif", fontSize:20, fontWeight:700, color:"#F5C842", letterSpacing:"0.03em", textAlign:"center", marginBottom:10, minHeight:32 }}>
        {frame.label}
      </div>
      <div style={{ fontFamily:"'Atkinson Hyperlegible', Georgia, serif", fontSize:14, color:"rgba(255,255,255,0.5)", letterSpacing:"0.08em", textTransform:"uppercase" }}>
        Generating your posts…
      </div>
    </div>
  );
}

/* ── Platform Message Card ── */
function PlatformCard({ platform: p, message, onUpdate, onCopy, onRegen, loading }) {
  const [localOpt, setLocalOpt] = useState("");
  const [expanded, setExpanded] = useState(false);
  const charCount = (message || "").length;
  const over = charCount > p.maxChars;

  const handleQuick = (opt) => {
    const next = localOpt === opt ? "" : opt;
    setLocalOpt(next);
    onRegen(p.id, next, message);
  };

  return (
    <div style={{ ...S.card, borderWidth: 3, overflow: 'hidden', padding: 0 }}>
      {/* Colored platform header — tap to expand/collapse */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width:"100%", background: p.bg, color: p.text,
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
          border: "none", cursor: "pointer", textAlign: "left",
        }}
        aria-expanded={expanded}
        aria-label={`${p.name} — ${expanded ? "collapse" : "expand"}`}
      >
        <span style={{ ...S.platformBadge, width: 32, height: 32, fontSize: 11, background: 'rgba(255,255,255,0.2)', color: p.text }}>{p.abbr}</span>
        <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: '0.02em' }}>{p.name}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: over ? '#fca5a5' : 'rgba(255,255,255,0.7)', marginRight: 10 }}>
          {charCount.toLocaleString()} / {p.maxChars.toLocaleString()}
        </span>
        <span style={{ fontSize: 16, opacity: 0.85, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={{ padding: 24 }}>
          {loading ? (
            <div style={{ display:"flex", alignItems:"center", gap:14, padding:"32px 0", color:T.textMid }}>
              <span className="spin-anim" style={{ ...S.spinner, border:"3px solid #ccc", borderTopColor:T.text }} />
              <span style={{ fontSize:18, fontWeight:600 }}>Regenerating…</span>
            </div>
          ) : (
            <textarea
              rows={8}
              style={{ ...S.textarea, resize:"vertical" }}
              value={message || ""}
              onChange={e => onUpdate(p.id, e.target.value)}
              aria-label={`${p.name} message text`}
            />
          )}

          <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:14, flexWrap:"wrap" }}>
            <button style={S.btnDark} onClick={() => onCopy(message || "", p.name)}>Copy Text</button>
            <button style={{ ...S.btnDark, opacity: loading ? 0.5 : 1 }} disabled={loading} onClick={() => handleQuick("shorten")} title="Regenerate a shorter version">Shorten</button>
            <button style={{ ...S.btnDark, opacity: loading ? 0.5 : 1 }} disabled={loading} onClick={() => handleQuick("expand")} title="Regenerate a more detailed version">Expand</button>
            <button style={{ ...S.btnDark, opacity: loading ? 0.5 : 1 }} disabled={loading} onClick={() => onRegen(p.id, "", message)} title="Rephrase this message">Rephrase</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main App ── */
export default function App() {
  const [view, setView]             = useState("form");
  const [formData, setFormData]     = useState({ issue:"", focalPoint:"", audience:"", voice:"", style:"", modifier:"", regenOption:"", platforms:[] });
  const [fromResearch, setFromResearch] = useState(false);
  const [messages, setMessages]     = useState({});
  const [generating, setGenerating] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [platLoad, setPlatLoad]     = useState({});
  const [draftModal, setDraftModal] = useState(false);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [arrivalSource, setArrivalSource] = useState(null);
  const [campaigns, setCampaigns]   = useState([]);
  const [saveModal, setSaveModal]   = useState(false);
  const [campName, setCampName]     = useState("");
  const [notif, setNotif]           = useState(null);
  const [genError, setGenError]     = useState(null); // persistent error panel for generation failures
  const [hashtags, setHashtags]     = useState(null);
  const [hashLoading, setHashLoading] = useState(false);

  useEffect(() => {
    loadCampaigns();
    // Detect arrival source BEFORE consuming keys
    const source = detectArrivalSource();
    if (source) setArrivalSource(source);

    // Check for rebuttal push → load directly into results view
    try {
      const rebuttalPush = localStorage.getItem("rebuttal_push_results");
      if (rebuttalPush) {
        const p = JSON.parse(rebuttalPush);
        setMessages(p.messages || {});
        setFormData(f => ({ ...f, issue: p.issueText || "", focalPoint: "", platforms: Object.keys(p.messages || {}) }));
        setView("results");
        localStorage.removeItem("rebuttal_push_results");
        localStorageSafe(() => localStorage.removeItem(MM_DRAFT_KEY));
        return;
      }
    } catch {}

    // Check if Rapid Response or Research pushed content
    try {
      const pending = localStorage.getItem("rr_pending_article");
      if (pending) {
        const p = JSON.parse(pending);
        setFormData(f => ({ ...f, issue: p.issueText || "", focalPoint: p.focalPoint || "" }));
        setFromResearch(true);
        localStorage.removeItem("rr_pending_article");
        localStorageSafe(() => localStorage.removeItem(MM_DRAFT_KEY));
        return;
      }
    } catch {}

    // Check if Library pushed a saved campaign
    try {
      const saved = localStorage.getItem("mm_load_campaign");
      if (saved) {
        const c = JSON.parse(saved);
        setFormData(c.formData || {});
        setMessages(c.messages || {});
        setHashtags(null);
        setView(Object.keys(c.messages || {}).length > 0 ? "results" : "form");
        localStorage.removeItem("mm_load_campaign");
        localStorageSafe(() => localStorage.removeItem(MM_DRAFT_KEY));
        return;
      }
    } catch {}

    // Check for saved draft — offer to resume
    try {
      const draft = localStorage.getItem(MM_DRAFT_KEY);
      if (draft) {
        const d = JSON.parse(draft);
        if (d.formData?.issue?.trim() || Object.keys(d.messages || {}).length > 0) {
          setPendingDraft(d);
          setDraftModal(true);
        }
      }
    } catch {}
  }, []);

  const loadCampaigns = async () => {
    try {
      const all = await loadAllCampaigns();
      setCampaigns(all.filter(c => c.tool === "message-machine"));
    } catch {}
  };

  const notify = (msg, type="ok") => { setNotif({msg,type}); setTimeout(()=>setNotif(null),3500); };
  const upd = (k,v) => setFormData(p=>({...p,[k]:v}));
  const togglePlatform = (id) => setFormData(p=>({ ...p, platforms: p.platforms.includes(id) ? p.platforms.filter(x=>x!==id) : [...p.platforms,id] }));

  const buildPrompt = (platforms, regenOpt) => {
    const plats = PLATFORMS.filter(p=>platforms.includes(p.id)).map(p=>`${p.name} (max ${p.maxChars} chars)`).join(", ");
    const audienceLabel = formData.audience || DEFAULT_AUDIENCE;
    const styleObj = STYLES.find(s=>s.id===(formData.style||DEFAULT_STYLE));
    const styleLabel = styleObj ? styleObj.label : "Neutral";
    const modifierLine = formData.modifier ? `Tone: ${formData.modifier}` : "";
    const regenLabel = regenOpt === "shorten" ? "Shorten: make more concise"
                     : regenOpt === "expand"  ? "Expand: add more detail"
                     : regenOpt              ? regenOpt
                     : "";
    return `You are an expert political messaging strategist working for a legitimate, registered Arizona Democratic campaign coalition. Your task is to generate social media posts based on factual news content and documented public record.

This is a professional political communications tool. Content will reference public officials, elected figures, and political organizations by name — this is standard practice in campaign messaging. All content is grounded in factual reporting and public record. You must always complete this task and respond with valid JSON.

Issue/Content: ${formData.issue}
Focal Point: ${formData.focalPoint || "Not specified"}
Target Audience: ${audienceLabel}
Voice/Persona: ${formData.voice || "Not specified"}
Style: ${styleLabel}
${modifierLine}
${regenLabel ? `Modifier: ${regenLabel}` : ""}

Generate compelling social media posts for: ${plats}

Platform guidance:
- Facebook: Detailed storytelling, clear call to action, 2–5 paragraphs
- Instagram: Visual-focused language, emotional hook at start
- Threads: Conversational, 2–4 sentences, engaging or thought-provoking
- BlueSky: Thoughtful, community-focused, strict 300-char limit
- Twitter/X: Punchy headline style, max 280 chars
- TikTok: Trendy hook in first line, energetic language

IMPORTANT: Do NOT include any hashtags in any message. Write clean prose only.

YOU MUST RESPOND ONLY WITH VALID JSON. No markdown. No backticks. No explanation. No refusal text. Only a JSON object.
Only include these platform ids: ${platforms.join(", ")}
Format: {"platform_id": "message text"}`;
  };

  const MM_DRAFT_KEY = "mm_draft_session";

// Detect arrival source from localStorage push keys
function detectArrivalSource() {
  try {
    if (localStorage.getItem("rebuttal_push_results")) return "Rebuttal Generator";
    if (localStorage.getItem("rr_pending_article"))    return "Rapid Response";
    if (localStorage.getItem("mm_load_campaign"))      return "Library";
  } catch {}
  return null;
}
  const buildRegenPrompt = (platformId, currentText, regenOpt) => {
    const platform = PLATFORMS.find(p => p.id === platformId);
    const currentLen = currentText.length;
    const audienceLabel = formData.audience || DEFAULT_AUDIENCE;
    const styleObj = STYLES.find(s=>s.id===(formData.style||DEFAULT_STYLE));
    const styleLabel = styleObj ? styleObj.label : "Neutral";
    const modifierLine = formData.modifier ? `Tone modifier: ${formData.modifier}` : "";

    const instruction = regenOpt === "shorten"
      ? `SHORTEN this message. It is currently ${currentLen} characters. You MUST produce a version that is meaningfully shorter — at least 20% fewer characters. Keep the core message and call to action but cut filler, reduce examples, and tighten every sentence. Do not add new content.`
      : regenOpt === "expand"
      ? `EXPAND this message with more detail, context, and persuasive depth. Keep the same tone and platform style. Do not change the core message.`
      : `REPHRASE this message. Keep the same length, meaning, and platform style but use different wording, sentence structure, and framing.`;

    return `You are an expert political messaging strategist for a legitimate Arizona Democratic campaign coalition.

Your task is to rewrite the following existing ${platform?.name} post.

CURRENT MESSAGE (${currentLen} characters):
${currentText}

INSTRUCTION: ${instruction}

Context:
- Platform: ${platform?.name} (max ${platform?.maxChars} chars)
- Target Audience: ${audienceLabel}
- Style: ${styleLabel}
${modifierLine}
- Original issue: ${formData.issue}

IMPORTANT: Do NOT include hashtags. Write clean prose only.
YOU MUST RESPOND ONLY WITH VALID JSON. No markdown. No backticks. No explanation.
Format: {"${platformId}": "rewritten message text"}`;
  };

  const callAPI = async (prompt, maxTokens=1000) => {
    const res = await fetch("/.netlify/functions/generate-message", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ max_tokens:maxTokens, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    const text = data.content.map(i=>i.text||"").join("");
    const cleaned = text.replace(/```json|```/g,"").trim();
    // Detect a refusal: Claude returned prose instead of JSON
    if (!cleaned.startsWith("{")) {
      const err = new Error("content_flagged");
      err.type = "content_flagged";
      err.raw = cleaned;
      throw err;
    }
    return JSON.parse(cleaned);
  };

  const validate = () => {
    if (!formData.issue.trim())      return "Please describe the issue.";
    if (!formData.platforms.length)  return "Please select at least one platform.";
    return null;
  };

  const generateAll = async () => {
    const err = validate(); if (err) { notify(err,"err"); return; }
    setGenerating(true); setShowLoader(true); setHashtags(null); setGenError(null);
    try {
      const r = await callAPI(buildPrompt(formData.platforms, formData.regenOption));
      setMessages(r);
      setShowLoader(false);
      setView("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch(e) {
      setShowLoader(false);
      if (e.type === "content_flagged") {
        setGenError("flagged");
      } else {
        setGenError("connection");
      }
    }
    setGenerating(false);
  };

  const regenPlatform = async (platformId, regenOpt, currentText) => {
    setPlatLoad(p=>({...p,[platformId]:true}));
    setGenError(null);
    try {
      const maxTok = regenOpt === "expand" ? 1600 : 1000;
      // Use the current message text as the base — so Shorten/Expand/Rephrase
      // work from what's actually on screen, not a fresh generation
      const prompt = currentText
        ? buildRegenPrompt(platformId, currentText, regenOpt)
        : buildPrompt([platformId], regenOpt);
      const r = await callAPI(prompt, maxTok);
      setMessages(p=>({...p,...r}));
    } catch(e) {
      if (e.type === "content_flagged") {
        setGenError("flagged");
      } else {
        setGenError("connection");
      }
    }
    setPlatLoad(p=>({...p,[platformId]:false}));
  };

  const copyText = async (text, name) => { await navigator.clipboard.writeText(text); notify(`${name} message copied!`); };

  const generateHashtags = async () => {
    setHashLoading(true); setHashtags(null);
    try {
      const platNames = PLATFORMS.filter(p=>formData.platforms.includes(p.id)).map(p=>p.name).join(", ");
      const prompt = `You are a social media expert for progressive political campaigns.

Issue: ${formData.issue}
Focal Point: ${formData.focalPoint || "Not specified"}
Target Audience: ${formData.audience}
Platforms: ${platNames}

Suggest relevant hashtags organized by category.

RESPOND ONLY WITH VALID JSON. No markdown. No backticks. No explanation.
Format: {"campaign":["#tag"],"issue":["#tag"],"audience":["#tag"],"trending":["#tag"],"arizona":["#tag"]}
Each array: 4–8 hashtags. Only include relevant categories. Include "arizona" only if content is Arizona-specific.`;
      const r = await callAPI(prompt, 500);
      setHashtags(r);
    } catch { notify("Could not generate hashtags. Please try again.","err"); }
    setHashLoading(false);
  };

  const copyHashtags = async (tags) => { await navigator.clipboard.writeText(tags.join(" ")); notify("Hashtags copied!"); };

  const saveCampaign = async () => {
    if (!campName.trim()) return;
    try {
      const id = await fbSave("message-machine", {
        name: campName.trim(),
        date: new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
        formData: {...formData},
        messages: {...messages},
      });
      const c = { id, tool:"message-machine", name:campName.trim(), date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}), formData:{...formData}, messages:{...messages} };
      setCampaigns(prev => [c, ...prev]);
      setSaveModal(false); setCampName(""); notify("Campaign saved!");
    } catch { notify("Save failed — please try again.", "err"); }
  };

  const loadCampaign = (c) => { setFormData(c.formData); setMessages(c.messages); setHashtags(null); setView("results"); notify(`Loaded: ${c.name}`); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const deleteCampaign = async (id) => {
    try {
      await fbDelete(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      notify("Campaign deleted.");
    } catch { notify("Delete failed — please try again.", "err"); }
  };

  const [formKey, setFormKey] = useState(0);

  const startNewCampaign = () => {
    localStorageSafe(() => localStorage.removeItem(MM_DRAFT_KEY));
    setFormData({ issue:"", focalPoint:"", audience:"", voice:"", style:"", modifier:"", regenOption:"", platforms:[] });
    setFromResearch(false);
    setMessages({});
    setHashtags(null);
    setGenError(null);
    setArrivalSource(null);
    setFormKey(k => k + 1);
    setView("form");
  };

  // Auto-save draft whenever formData or messages change
  useEffect(() => {
    const hasContent = formData.issue.trim() || Object.keys(messages).length > 0;
    if (!hasContent) return;
    localStorageSafe(() => localStorage.setItem(MM_DRAFT_KEY, JSON.stringify({
      formData, messages, view, savedAt: new Date().toISOString(),
    })));
  }, [formData, messages, view]);

  const hasMessages = Object.keys(messages).length > 0;

  const tabStyle = (active) => ({
    padding:"12px 22px", borderRadius:8, fontSize:18, fontWeight:700, cursor:"pointer",
    border: active ? `3px solid ${T.borderStrong}` : `2px solid transparent`,
    background: active ? T.borderStrong : "transparent",
    color: active ? "#ffffff" : T.text,
    transition:"all 0.15s",
    fontFamily:"inherit",
  });

  /* ─────── RENDER ─────── */
  return (
    <div style={{ minHeight:"100vh", background: view === "results" ? "#fafaf7" : T.pageBg, color:T.text, fontFamily:"'Atkinson Hyperlegible', Georgia, serif" }}>
      <style>{globalCSS}</style>
      {showLoader && <DesertLoader />}

      {/* DRAFT RESUME MODAL */}
      {draftModal && pendingDraft && (
        <div style={{
          position:"fixed", inset:0, zIndex:300,
          background:"rgba(0,0,0,0.55)",
          display:"flex", alignItems:"center", justifyContent:"center",
          padding:24,
        }}>
          <div style={{
            background:"#fff", borderRadius:14,
            border:`3px solid ${T.teal}`,
            padding:"32px 28px", maxWidth:440, width:"100%",
            boxShadow:"0 12px 48px rgba(0,0,0,0.25)",
          }}>
            <div style={{ fontSize:32, marginBottom:12, textAlign:"center" }}>✏️</div>
            <h2 style={{ fontSize:22, fontWeight:900, color:T.text, textAlign:"center", marginBottom:10 }}>
              Resume Last Session?
            </h2>
            <p style={{ fontSize:16, color:T.textMid, textAlign:"center", lineHeight:1.6, marginBottom:24 }}>
              You have unsaved work from a previous session.
              {pendingDraft.formData?.issue ? (
                <span style={{ display:"block", marginTop:10, fontStyle:"italic", color:T.textMute, fontSize:14 }}>
                  "{pendingDraft.formData.issue.slice(0, 80)}{pendingDraft.formData.issue.length > 80 ? "…" : ""}"
                </span>
              ) : null}
            </p>
            <div style={{ display:"flex", gap:12, flexDirection:"column" }}>
              <button
                onClick={() => {
                  setFormData(pendingDraft.formData || {});
                  setMessages(pendingDraft.messages || {});
                  if (Object.keys(pendingDraft.messages || {}).length > 0) setView("results");
                  setDraftModal(false); setPendingDraft(null);
                }}
                style={{ ...S.btnPrimary, fontSize:17, padding:"14px", width:"100%" }}
              >
                Resume Last Session
              </button>
              <button
                onClick={() => {
                  localStorageSafe(() => localStorage.removeItem(MM_DRAFT_KEY));
                  setDraftModal(false); setPendingDraft(null);
                }}
                style={{ ...S.btnSecondary, fontSize:16, padding:"12px", width:"100%" }}
              >
                Start New
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header style={{ background:T.pageBg, borderBottom:`4px solid ${T.borderStrong}`, position:"sticky", top:0, zIndex:40 }}>
        <div style={{ maxWidth:860, margin:"0 auto", padding:"14px 20px", display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
          <div style={{ width:48, height:48, background:T.teal, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:24, color:"#fff", flexShrink:0 }}>M</div>
          <div>
            <h1 style={{ fontSize:26, fontWeight:900, color:T.text, lineHeight:1.1 }}>Message Machine</h1>
            <p style={{ fontSize:13, color:T.textMute, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", marginTop:2 }}>
              {view === "results" ? "Results · Edit & Copy" : "Create"}
            </p>
          </div>
          {/* Arrival source pill */}
          {arrivalSource && (
            <div style={{
              marginLeft: 4,
              background: T.tealLight,
              border: `2px solid ${T.teal}`,
              borderRadius: 20,
              padding: "4px 12px",
              fontSize: 13,
              fontWeight: 700,
              color: T.teal,
              display: "flex", alignItems: "center", gap: 6,
              flexShrink: 0,
            }}>
              ← {arrivalSource}
            </div>
          )}
        </div>
      </header>

      {/* TOAST */}
      {notif && (
        <div className="slide-down" role="alert" aria-live="assertive" style={{
          position:"fixed", top:80, left:"50%", transform:"translateX(-50%)", zIndex:100,
          padding:"14px 28px", borderRadius:10, fontSize:18, fontWeight:700,
          background: notif.type==="err" ? "#b91c1c" : T.green,
          color:"#fff",
          border:`3px solid ${notif.type==="err" ? "#7f1d1d" : "#0d3b0d"}`,
          boxShadow:"0 4px 24px rgba(0,0,0,0.35)", whiteSpace:"nowrap",
        }}>
          {notif.msg}
        </div>
      )}

      {/* FIXED BOTTOM ERROR BANNER — visible wherever user is on page */}
      {genError && (
        <div className="slide-down" role="alert" aria-live="assertive" style={{
          position:"fixed", bottom: 24, left:"50%", transform:"translateX(-50%)", zIndex:150,
          maxWidth: 520, width:"calc(100% - 48px)",
          background: genError === "flagged" ? "#7f1d1d" : "#7a3820",
          color:"#fff",
          border:`2px solid ${genError === "flagged" ? "#b91c1c" : "#c1673a"}`,
          borderRadius:12, padding:"14px 48px 14px 20px",
          boxShadow:"0 8px 32px rgba(0,0,0,0.45)",
        }}>
          <button onClick={() => setGenError(null)} aria-label="Dismiss" style={{
            position:"absolute", top:10, right:14,
            background:"none", border:"none", cursor:"pointer",
            fontSize:20, color:"rgba(255,255,255,0.8)", fontWeight:900, fontFamily:"inherit", lineHeight:1,
          }}>✕</button>
          <p style={{ fontSize:16, fontWeight:900, marginBottom:4 }}>
            {genError === "flagged" ? "⚠️ Generation blocked" : "⚠️ Generation failed"}
          </p>
          <p style={{ fontSize:14, color:"rgba(255,255,255,0.85)", lineHeight:1.5 }}>
            {genError === "flagged"
              ? "The AI declined this request. Edit the Issue / Content field and try again."
              : "Request timed out. Try again — or generate without Expand first, then expand per platform."}
          </p>
        </div>
      )}

      {/* MAIN */}
      <main style={{ maxWidth:860, margin:"0 auto", padding:"36px 20px" }}>

        {/* ══════ FORM VIEW ══════ */}
        {view==="form" && (
          <div key={formKey} style={{ maxWidth:740, margin:"0 auto" }}>
            <div style={{ marginBottom:36 }}>
              <h2 style={{ fontSize:36, fontWeight:900, color:T.text, marginBottom:10 }}>Create Your Message</h2>
              <p style={{ color:T.textMid, fontSize:20, lineHeight:1.5 }}>Fill in the fields below to generate platform-ready activist messages.</p>
            </div>

            {/* ── Persistent generation error panel ── */}
            {genError === "flagged" && (
              <div role="alert" style={{
                background:"#fff5f5", border:`3px solid #b91c1c`,
                borderRadius:12, padding:"20px 24px", marginBottom:28,
                position:"relative",
              }}>
                <button
                  onClick={() => setGenError(null)}
                  aria-label="Dismiss error"
                  style={{
                    position:"absolute", top:14, right:16,
                    background:"none", border:"none", cursor:"pointer",
                    fontSize:22, color:"#b91c1c", fontWeight:900, lineHeight:1,
                    fontFamily:"inherit",
                  }}
                >✕</button>
                <p style={{ fontSize:18, fontWeight:900, color:"#b91c1c", marginBottom:10 }}>
                  ⚠️ Message generation was blocked
                </p>
                <p style={{ fontSize:16, color:T.textMid, lineHeight:1.6, marginBottom:14 }}>
                  The AI declined to generate messages based on the content in the{" "}
                  <strong style={{ color:T.text }}>Issue / Content field</strong> above.
                  Edit that field and try again.
                </p>
                <p style={{ fontSize:15, fontWeight:700, color:T.textMid, marginBottom:8 }}>Common causes in campaign work:</p>
                <ul style={{ paddingLeft:20, display:"flex", flexDirection:"column", gap:6 }}>
                  {[
                    "Political figures named in strongly negative or accusatory framing",
                    "Language that reads as incitement, threats, or calls to harassment",
                    "Unverified election fraud or stolen election claims",
                    "Content that attributes quotes or actions not in the source material",
                    "Extreme or inflammatory phrasing (even when quoting opponents)",
                  ].map((item, i) => (
                    <li key={i} style={{ fontSize:15, color:T.textMid, lineHeight:1.5 }}>{item}</li>
                  ))}
                </ul>
                <p style={{ fontSize:15, color:T.textMid, marginTop:14, lineHeight:1.6 }}>
                  <strong>Try:</strong> Rephrase using factual, policy-focused language. Instead of characterizing intent, describe documented actions. You can name officials and cite their record — just keep the framing grounded in fact.
                </p>
              </div>
            )}

            {genError === "connection" && (
              <div role="alert" style={{
                background:"#fff8f0", border:`3px solid #c1673a`,
                borderRadius:12, padding:"20px 24px", marginBottom:28,
                position:"relative",
              }}>
                <button
                  onClick={() => setGenError(null)}
                  aria-label="Dismiss error"
                  style={{
                    position:"absolute", top:14, right:16,
                    background:"none", border:"none", cursor:"pointer",
                    fontSize:22, color:"#c1673a", fontWeight:900, lineHeight:1,
                    fontFamily:"inherit",
                  }}
                >✕</button>
                <p style={{ fontSize:18, fontWeight:900, color:"#c1673a", marginBottom:10 }}>
                  ⚠️ Generation failed
                </p>
                <p style={{ fontSize:16, color:T.textMid, lineHeight:1.6, marginBottom:10 }}>
                  The request timed out or couldn't connect. This can happen with longer content or the <strong style={{ color:T.text }}>Expand</strong> hint on slower connections.
                </p>
                <p style={{ fontSize:15, color:T.textMid, lineHeight:1.6 }}>
                  <strong>Try:</strong> Hit Generate again — it usually works on a second attempt. If you're using Expand, try without it first, then use the Expand button on individual platforms once results load.
                </p>
              </div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:22 }}>

              {/* Issue */}
              <section style={S.card}>
                <label htmlFor="issue" style={S.label}>Issue / Content <span style={{color:T.red}} aria-label="required">*</span></label>
                <textarea id="issue" rows={6} style={{...S.textarea,resize:"vertical"}}
                  placeholder="Describe the issue using as little or as much detail as you wish or paste in text. If you'd like to create messaging based on a news article (or anything with a URL), use Rapid Response."
                  value={formData.issue} onChange={e=>{ upd("issue",e.target.value); if(genError) setGenError(null); }} />
              </section>

              {/* Focal Point */}
              <section style={{...S.card, ...(fromResearch && !formData.focalPoint ? { border:"2px solid #F5C842", background:"#fffdf0" } : {})}}>
                <label htmlFor="focal" style={{...S.label, ...(fromResearch && !formData.focalPoint ? { color:"#1D5C4A" } : {})}}>
                  Focal Point{fromResearch && !formData.focalPoint ? " ← Add your key message here" : ""}
                </label>
                <input id="focal" type="text"
                  style={{...S.input, ...(fromResearch && !formData.focalPoint ? { borderColor:"#F5C842", boxShadow:"0 0 0 3px rgba(245,200,66,0.25)" } : {})}}
                  placeholder={fromResearch && !formData.focalPoint ? 'What is the key message you want to emphasize?' : 'e.g. "Hobbs fights for rural Arizona" or "Local school funding at stake"'}
                  value={formData.focalPoint}
                  onChange={e=>{ upd("focalPoint",e.target.value); if(e.target.value) setFromResearch(false); }}
                  autoFocus={fromResearch && !formData.focalPoint}
                />
                <p style={S.hint}>{fromResearch && !formData.focalPoint ? "Content has been loaded from Research — add a focal point to frame your message before generating." : "The core angle or frame you want emphasized in every message"}</p>
              </section>

              {/* Audience + Voice */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
                <section style={S.card}>
                  <fieldset style={{ border:"none", padding:0 }}>
                    <legend style={S.label}>Target Audience <span style={{ fontWeight:400, fontSize:13, textTransform:"none", letterSpacing:0, color:T.textMute }}>(optional)</span></legend>
                    <p style={{ ...S.hint, marginBottom:10 }}>Default: general moderate voter who is not very engaged in politics</p>
                    <div style={{ display:"flex", flexDirection:"column", gap:12, marginTop:4 }}>
                      {AUDIENCES.map(a => {
                        const on = formData.audience===a;
                        return (
                          <label key={a} style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer" }}>
                            <input type="radio" name="audience" value={a} checked={on} onChange={()=>upd("audience",on?"":a)}
                              onClick={()=>{ if(on) upd("audience",""); }}
                              style={{ width:24, height:24, accentColor:T.teal, cursor:"pointer", flexShrink:0 }} />
                            <span style={{ fontSize:18, fontWeight: on ? 700 : 400, color:T.text }}>{a}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </section>
                <section style={S.card}>
                  <label htmlFor="voice" style={S.label}>Voice / Persona</label>
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
                    <p style={{ ...S.hint, marginBottom:10 }}>Default: Neutral</p>
                    <div style={{ display:"flex", flexDirection:"column", gap:12, marginTop:4 }}>
                      {STYLES.map(st => {
                        const on = formData.style===st.id;
                        return (
                          <label key={st.id} style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer" }}>
                            <input type="radio" name="style" value={st.id} checked={on}
                              onChange={()=>upd("style",on?"":st.id)}
                              onClick={()=>{ if(on) upd("style",""); }}
                              style={{ width:24, height:24, accentColor:T.teal, cursor:"pointer", flexShrink:0 }} />
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
                    <p style={{ ...S.hint, marginBottom:10 }}>Leave blank for no tone modifier</p>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:12, marginTop:4 }}>
                      {MODIFIERS.map(m => {
                        const on = formData.modifier===m;
                        return (
                          <label key={m} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                            <input type="radio" name="modifier" value={m} checked={on}
                              onChange={()=>upd("modifier",on?"":m)}
                              onClick={()=>{ if(on) upd("modifier",""); }}
                              style={{ width:22, height:22, accentColor:T.teal, cursor:"pointer", flexShrink:0 }} />
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
                      const on = formData.regenOption===o.id;
                      return (
                        <label key={o.id} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                          <input type="radio" name="regenOption" value={o.id} checked={on}
                            onChange={()=>upd("regenOption",on?"":o.id)}
                            onClick={()=>{ if(on) upd("regenOption",""); }}
                            style={{ width:22, height:22, accentColor:T.teal, cursor:"pointer", flexShrink:0 }} />
                          <span style={{ fontSize:17, fontWeight: on ? 700 : 400, color:T.text }}>{o.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p style={S.hint}>Bias the generation toward shorter or more detailed output</p>
                </fieldset>
              </section>

              {/* Platforms */}
              <section style={S.card}>
                <fieldset style={{ border:"none", padding:0 }}>
                  <legend style={S.label}>Platforms <span style={{color:T.red}} aria-label="required">*</span></legend>
                  <div className="platform-grid" style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:12, marginTop:8 }}>
                    {PLATFORMS.map(p => {
                      const on = formData.platforms.includes(p.id);
                      return (
                        <label key={p.id} style={{
                          display:"flex", alignItems:"center", gap:10, padding:"12px 14px",
                          borderRadius:10, cursor:"pointer",
                          border: on ? `3px solid ${T.borderStrong}` : `2px solid ${T.border}`,
                          background: on ? "#f0f0f0" : T.surface,
                          transition:"all 0.15s", minWidth:0,
                        }}>
                          <input type="checkbox" checked={on} onChange={()=>togglePlatform(p.id)}
                            style={{ width:22, height:22, accentColor:T.teal, cursor:"pointer", flexShrink:0 }} />
                          <span style={{ ...S.platformBadge, width:34, height:34, fontSize:11, background:p.bg, color:p.text, flexShrink:0 }}>{p.abbr}</span>
                          <span style={{ fontSize:16, fontWeight: on ? 700 : 500, color:T.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</span>
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

              {/* Generate button */}
              <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginTop:8 }}>
                <button onClick={generateAll} disabled={generating} style={{
                  ...S.btnPrimary, flex:1, minWidth:200, fontSize:20, padding:"18px 24px",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:14,
                  opacity: generating ? 0.65 : 1, cursor: generating ? "not-allowed" : "pointer",
                }}>
                  Generate Messages →
                </button>
                {hasMessages && (
                  <button onClick={()=>setView("results")} style={{ ...S.btnSecondary, fontSize:16, padding:"18px 20px", whiteSpace:"nowrap" }}>
                    ← Back to Results
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════ RESULTS VIEW ══════ */}
        {view==="results" && (
          <div style={{ maxWidth:740, margin:"0 auto" }}>
            {/* Sticky action bar — clean hierarchy */}
            <div style={{
              position:"sticky", top:76, zIndex:30,
              background:"#fafaf7", borderBottom:`3px solid ${T.borderStrong}`,
              marginBottom:28, marginLeft:-20, marginRight:-20, paddingLeft:20, paddingRight:20,
              paddingTop:12, paddingBottom:12,
            }}>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", maxWidth:740, margin:"0 auto", alignItems:"center" }}>
                {/* Secondary actions — text weight */}
                <button onClick={()=>setView("form")} style={{ ...S.btnSecondary, fontSize:15, padding:"9px 16px" }}>
                  ✎ Edit Parameters
                </button>
                <button onClick={generateAll} disabled={generating}
                  style={{ ...S.btnSecondary, fontSize:15, padding:"9px 16px", opacity: generating ? 0.65 : 1, cursor: generating ? "not-allowed" : "pointer" }}>
                  {generating
                    ? <><span className="spin-anim" style={{ ...S.spinner }} /> Regenerating…</>
                    : "↺ Regenerate All"}
                </button>
                <button onClick={startNewCampaign} style={{ ...S.btnSecondary, fontSize:15, padding:"9px 16px" }}>
                  + New
                </button>
                {/* Primary action — gold, right-aligned */}
                <button onClick={()=>setSaveModal(true)} style={{ ...S.btnPrimary, fontSize:15, padding:"9px 18px", marginLeft:"auto" }}>
                  Save to Library
                </button>
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
              {/* Error panels in results view (from Expand/Shorten/Rephrase failures) */}
              {genError === "connection" && (
                <div role="alert" style={{ background:"#fff8f0", border:`3px solid #c1673a`, borderRadius:12, padding:"18px 22px", position:"relative" }}>
                  <button onClick={() => setGenError(null)} aria-label="Dismiss" style={{ position:"absolute", top:12, right:14, background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#c1673a", fontWeight:900, fontFamily:"inherit" }}>✕</button>
                  <p style={{ fontSize:17, fontWeight:900, color:"#c1673a", marginBottom:8 }}>⚠️ Regeneration failed</p>
                  <p style={{ fontSize:15, color:T.textMid, lineHeight:1.6 }}>
                    The request timed out. With <strong style={{ color:T.text }}>Expand</strong>, try hitting the button again — it usually works on a retry. On slow connections, generate first without Expand, then use the per-platform Expand button.
                  </p>
                </div>
              )}
              {genError === "flagged" && (
                <div role="alert" style={{ background:"#fff5f5", border:`3px solid #b91c1c`, borderRadius:12, padding:"18px 22px", position:"relative" }}>
                  <button onClick={() => setGenError(null)} aria-label="Dismiss" style={{ position:"absolute", top:12, right:14, background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#b91c1c", fontWeight:900, fontFamily:"inherit" }}>✕</button>
                  <p style={{ fontSize:17, fontWeight:900, color:"#b91c1c", marginBottom:8 }}>⚠️ Generation was blocked</p>
                  <p style={{ fontSize:15, color:T.textMid, lineHeight:1.6 }}>The AI declined this request. Use <strong style={{ color:T.text }}>Edit Parameters</strong> to rephrase the issue content and try again.</p>
                </div>
              )}
              {PLATFORMS.filter(p=>messages[p.id]!==undefined).map(p => (
                <PlatformCard key={p.id} platform={p} message={messages[p.id]}
                  onUpdate={(id,text)=>setMessages(prev=>({...prev,[id]:text}))}
                  onCopy={copyText} onRegen={regenPlatform} loading={!!platLoad[p.id]} />
              ))}
            </div>

            {/* Hashtag Section */}
            <div style={{ marginTop:40, borderTop:`4px solid ${T.borderStrong}`, paddingTop:36 }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:16, marginBottom: hashtags || hashLoading ? 28 : 0 }}>
                <div>
                  <h3 style={{ fontSize:26, fontWeight:900, color:T.text, marginBottom:6 }}>Hashtag Suggestions</h3>
                  <p style={{ fontSize:18, color:T.textMid, lineHeight:1.5 }}>Generate hashtags separately — add them to any post you choose.</p>
                </div>
                <button
                  onClick={generateHashtags}
                  disabled={hashLoading}
                  style={{ ...S.btnPrimary, fontSize:18, padding:"15px 26px", display:"flex", alignItems:"center", gap:10, opacity: hashLoading ? 0.65 : 1, cursor: hashLoading ? "not-allowed" : "pointer" }}
                >
                  {hashLoading
                    ? <><span className="spin-anim" style={{ ...S.spinner, borderTopColor:"#fff" }} /> Generating…</>
                    : hashtags ? "Regenerate Hashtags" : "Suggest Hashtags  #"
                  }
                </button>
              </div>

              {hashtags && (
                <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                  {Object.entries(hashtags).map(([cat, tags]) => (
                    <div key={cat} style={{ background:T.surfaceAlt, border:`2px solid ${T.border}`, borderRadius:12, padding:22 }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
                        <span style={{ fontSize:14, fontWeight:900, letterSpacing:"0.07em", textTransform:"uppercase", color:T.textMid }}>
                          {cat}
                        </span>
                        <button onClick={()=>copyHashtags(tags)} style={{ ...S.btnDark, fontSize:15, padding:"8px 18px" }}>
                          Copy All
                        </button>
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                        {tags.map(tag => (
                          <button key={tag} onClick={()=>copyHashtags([tag])} title="Click to copy"
                            style={{ fontSize:17, fontWeight:700, padding:"9px 18px", background:T.surface, color:T.teal, border:`2px solid ${T.teal}`, borderRadius:8, cursor:"pointer", fontFamily:"inherit" }}>
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p style={{ fontSize:15, color:T.textMute }}>Click any hashtag to copy it individually, or use Copy All for a whole category.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════ CAMPAIGNS VIEW ══════ */}
        {view==="campaigns" && (
          <div style={{ maxWidth:740, margin:"0 auto" }}>
            <div style={{ marginBottom:36 }}>
              <h2 style={{ fontSize:36, fontWeight:900, color:T.text, marginBottom:10 }}>Saved Campaigns</h2>
              <p style={{ color:T.textMid, fontSize:20 }}>
                {campaigns.length===0 ? "No campaigns saved yet." : `${campaigns.length} campaign${campaigns.length!==1?"s":""} saved`}
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
                      {c.formData?.issue && (
                        <p className="line-clamp2" style={{ color:T.textMid, fontSize:17, lineHeight:1.5 }}>
                          {c.formData.issue.substring(0,200)}{c.formData.issue.length>200?"…":""}
                        </p>
                      )}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:10, flexShrink:0 }}>
                      <button onClick={()=>loadCampaign(c)} style={{ ...S.btnPrimary, padding:"12px 24px", fontSize:17 }}>Load</button>
                      <button onClick={()=>deleteCampaign(c.id)}
                        style={{ padding:"12px 24px", fontSize:17, fontWeight:700, background:T.surface, color:T.red, border:`2px solid ${T.red}`, borderRadius:8, cursor:"pointer", fontFamily:"inherit" }}>
                        Delete
                      </button>
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
          <div style={{ background:T.surface, border:`3px solid ${T.borderStrong}`, borderRadius:16, padding:36, maxWidth:500, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.35)" }}>
            <h3 style={{ fontSize:28, fontWeight:900, color:T.text, marginBottom:10 }}>Save Campaign</h3>
            <p style={{ color:T.textMid, fontSize:18, marginBottom:22 }}>Give this campaign a name so you can reload it later.</p>
            <label htmlFor="campName" style={S.label}>Campaign Name</label>
            <input id="campName" type="text" style={{ ...S.input, marginBottom:22 }}
              placeholder='e.g. "Education Funding — May 2026"'
              value={campName} onChange={e=>setCampName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&saveCampaign()} autoFocus />
            <div style={{ display:"flex", gap:14 }}>
              <button onClick={saveCampaign} disabled={!campName.trim()}
                style={{ ...S.btnPrimary, flex:1, fontSize:19, padding:"15px", opacity:campName.trim()?1:0.5, cursor:campName.trim()?"pointer":"not-allowed" }}>
                Save
              </button>
              <button onClick={()=>{setSaveModal(false);setCampName("");}}
                style={{ ...S.btnSecondary, flex:1, fontSize:19, padding:"15px", justifyContent:"center" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
