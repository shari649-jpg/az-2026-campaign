import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { saveCampaign, loadAllCampaigns, deleteCampaign } from "../../lib/campaignLibrary";

const PROFILES = [
  { key: "young_organizer",  label: "Young Organizer",      desc: "Gen Z · urgent & digital-native" },
  { key: "community_elder",  label: "Community Elder",       desc: "Longtime resident · warm & firm" },
  { key: "policy_advocate",  label: "Policy Advocate",       desc: "Evidence-based · civic professional" },
  { key: "faith_leader",     label: "Faith Leader",          desc: "Moral framing · community trust" },
  { key: "parent",           label: "Parent / Caregiver",    desc: "Family stakes · everyday impact" },
  { key: "labor_organizer",  label: "Labor Organizer",       desc: "Workers' rights · collective action" },
  { key: "first_gen_voter",  label: "First-Gen Voter",       desc: "Newcomer lens · hard-won rights" },
  { key: "student",          label: "Student Activist",      desc: "Campus energy · idealistic voice" },
  { key: "small_biz_owner",  label: "Small Business Owner",  desc: "Local economy · community roots" },
];

const TONES = [
  { key: "friendly",     label: "Friendly",     instruction: "Use approachable, inclusive, encouraging language. Make readers feel welcomed, not lectured." },
  { key: "witty",        label: "Witty",        instruction: "Use clever wordplay, sharp observations, and light humor. Posts should make people smile while landing the point." },
  { key: "sarcastic",    label: "Sarcastic",    instruction: "Use dry, pointed sarcasm to expose the absurdity of the false claim. Keep it cutting but not mean-spirited." },
  { key: "empathetic",   label: "Empathetic",   instruction: "Lead with understanding and compassion. Acknowledge why people might believe the false claim before rebutting it." },
  { key: "professional", label: "Professional", instruction: "Use clear, measured, authoritative language. Sound like the most credible voice in the room." },
  { key: "excited",      label: "Excited",      instruction: "Use high-energy, enthusiastic language. Posts should feel like the writer can barely contain themselves." },
  { key: "funny",        label: "Funny",        instruction: "Use humor and wit to disarm the false claim. Keep it light but pointed." },
  { key: "dramatic",     label: "Dramatic",     instruction: "Use vivid, emotionally charged language. Make the stakes feel real and urgent." },
  { key: "disgusted",    label: "Disgusted",    instruction: "Express genuine moral indignation — viscerally disappointed and outraged, but always grounded in fact." },
  { key: "happy",        label: "Happy",        instruction: "Use upbeat, optimistic language. Frame the rebuttal as opportunity. Keep energy positive and forward-looking." },
  { key: "neighborly",   label: "Neighborly",   instruction: "Use warm, conversational front-porch language. Sound like a trusted neighbor sharing something important." },
];

function buildPrompt(count, chosenKeys, tone) {
  const names = ["A", "B", "C"].slice(0, count);
  const voices = names.map((name, i) => {
    if (i < chosenKeys.length) {
      const p = PROFILES.find(p => p.key === chosenKeys[i]);
      return `Activist ${name}: ${p.label} — ${p.desc}. Write their posts in an authentic voice matching this profile.`;
    }
    return `Activist ${name}: Choose a distinct voice not yet used, well-suited to this topic.`;
  }).join("\n");

  const activistBlocks = names.map(name => `## Activist ${name}
At the very start of this section, before any platform posts, include one line in this exact format:
Activist ${name}: [If a profile was specified, use that profile's name and description. If you chose the voice yourself, name what you chose and describe it in 6–10 words.]

For each platform write POST: first, then immediately below FIRST COMMENT: — always paired.

### Facebook
POST: [3–5 sentences, community tone, ends with call to action]
FIRST COMMENT: [1 punchy sentence]

### Instagram
POST: [concise, ends with 3 relevant hashtags]
FIRST COMMENT: [1 punchy sentence]

### Threads
POST: [1–2 sentences, ends with call to action]
FIRST COMMENT: [1 punchy sentence]

### BlueSky
POST: [1–2 sentences, ends with call to action]
FIRST COMMENT: [1 punchy sentence]

### Twitter/X
POST: [under 280 chars, ends with call to action]
FIRST COMMENT: [1 punchy sentence under 280 chars]

### TikTok
POST: Hook line / Beat 1 / Beat 2 / Beat 3 / CTA line
FIRST COMMENT: [1 punchy sentence]`).join("\n\n");

  return `You are a rapid rebuttal campaign strategist producing complete social media posting plans.

ACTIVIST VOICES:
${voices}

OUTPUT STRUCTURE — follow exactly:

## Anchor Phrase
Derive one short memorable sentence specific to this false narrative as the campaign spine. State it, then in one sentence explain why it works for this claim.

## Rebuttal Lenses
Three lenses with bold titles and one-sentence explanations.

${activistBlocks}

STRICT RULES:
- Write ALL posts and first comments in the THIRD PERSON. Never use "I", "my", "we", or "our" as the activist's voice. Write as if observing and reporting — "Communities are being silenced," not "I am outraged."
- NEVER invent or make up names of people, places, organizations, or specific statistics not present in the user's input.
- Anchor phrase must emerge from the specific narrative — never generic.
- Each activist must sound genuinely different in vocabulary, rhythm, and framing.
- Always end every post with a call to action.
- First comments match their platform's tone and length norms.
- Never use "Voting access is not the same as equal power" unless the narrative is specifically about voting.${tone ? `
- TONE MODIFIER — applies to every single post and first comment across all activists and all platforms: ${tone.instruction} The individual activist voices should remain distinct, but all writing should be unmistakably colored by this tone.` : ""}`;
}

const RED       = "#c41e1e";
const RED_DARK  = "#8b0000";
const INK       = "#1A1A1A";
const BG        = "#ffffff";
const SURFACE   = "#FDFCFA";
const SURFACE_ALT = "#f3f4f6";
const BORDER    = "#555555";
const MID       = "#333333";
const LIGHT     = "#777777";

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${BG} !important; color: ${INK}; }
  textarea, input, button { font-family: 'Atkinson Hyperlegible', Georgia, serif; }
  textarea:focus, input:focus { outline: 4px solid ${RED} !important; outline-offset: 2px; border-color: ${RED} !important; }
  button:focus { outline: 4px solid ${RED}; outline-offset: 3px; }
  button:active { transform: scale(0.97); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
  .spin-anim { animation: spin 0.7s linear infinite; display: inline-block; }
  .slide-down { animation: slideDown 0.2s ease; }
  .generating-pulse { animation: pulse 1.5s ease-in-out infinite; }
`;

const S = {
  card:     { background: SURFACE, border: `2px solid ${BORDER}`, borderRadius: 12, padding: 24 },
  label:    { display:"block", fontSize:13, fontWeight:900, letterSpacing:"0.08em", textTransform:"uppercase", color:MID, marginBottom:10 },
  hint:     { fontSize:14, color:LIGHT, marginTop:8, lineHeight:1.5 },
  input:    { width:"100%", background:SURFACE, border:`2px solid ${BORDER}`, borderRadius:8, padding:"12px 16px", color:INK, fontSize:17, lineHeight:1.5 },
  textarea: { width:"100%", background:SURFACE, border:`2px solid ${BORDER}`, borderRadius:8, padding:"12px 16px", color:INK, fontSize:17, lineHeight:1.6, fontFamily:"inherit", resize:"vertical" },
  btnPrimary:   { background:RED, color:"#fff", fontWeight:900, padding:"15px 26px", borderRadius:8, border:`3px solid ${RED_DARK}`, cursor:"pointer", fontSize:18, fontFamily:"inherit" },
  btnSecondary: { background:SURFACE, color:INK, fontWeight:700, padding:"15px 22px", borderRadius:8, border:`2px solid ${INK}`, cursor:"pointer", fontSize:17, fontFamily:"inherit", display:"flex", alignItems:"center", gap:8 },
  btnDark:      { background:INK, color:"#fff", fontWeight:700, padding:"10px 18px", borderRadius:8, border:`2px solid ${INK}`, cursor:"pointer", fontSize:15, fontFamily:"inherit" },
  spinner:  { width:18, height:18, flexShrink:0, border:"3px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", display:"inline-block" },
  errBox:   { background:"#FEF0F0", border:"2px solid #e88", borderRadius:8, padding:"16px 20px", color:"#900", fontSize:15, marginTop:16, lineHeight:1.6 },
  platformBadge: { width:38, height:38, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900, flexShrink:0 },
};

const profileCard = (checked, disabled) => ({
  padding:"10px 12px", border:`2px solid ${checked ? RED_DARK : BORDER}`, borderRadius:8,
  background: checked ? "#fff0f0" : SURFACE, cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.45 : 1, display:"flex", gap:10, alignItems:"flex-start",
  transition:"all 0.15s",
});

function LoadingAnimation() {
  const msgs = ["Analyzing the false narrative… 🔍","Building your anchor phrase…","Crafting platform posts…","Almost ready — finishing up…"];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i+1) % msgs.length), 2800);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ textAlign:"center", padding:"60px 20px" }}>
      <div style={{ fontSize:52, marginBottom:18 }}>🛡️</div>
      <div className="generating-pulse" style={{ fontSize:21, fontWeight:700, color:RED_DARK, marginBottom:12 }}>{msgs[idx]}</div>
      <div style={{ display:"flex", justifyContent:"center", gap:8, marginTop:14 }}>
        {[0,1,2].map(i => <div key={i} style={{ width:10, height:10, borderRadius:"50%", background:RED, animation:`pulse ${1+i*0.3}s ease-in-out infinite` }} />)}
      </div>
      <p style={{ marginTop:18, fontSize:14, color:LIGHT }}>This takes about 10–15 seconds — building a full 6-platform campaign.</p>
    </div>
  );
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise((res, rej) => {
    const el = document.createElement("textarea");
    el.value = text; el.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(el); el.focus(); el.select();
    const ok = document.execCommand("copy"); document.body.removeChild(el);
    ok ? res() : rej(new Error("copy failed"));
  });
}

export default function RebuttalGenerator() {
  const [narrative,   setNarrative]   = useState("");
  const [profiles,    setProfiles]    = useState([]);
  const [tone,        setTone]        = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [output,      setOutput]      = useState("");
  const [loading,     setLoading]     = useState(false);
  const [status,      setStatus]      = useState("");
  const [error,       setError]       = useState(null);
  const [copied,      setCopied]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [library,     setLibrary]     = useState([]);
  const [showLib,     setShowLib]     = useState(false);
  const [showShare,   setShowShare]   = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [notif,       setNotif]       = useState(null);

  const effectiveCount = 1;
  const location = useLocation();

  useEffect(() => { loadLibrary(); }, []);

  useEffect(() => {
    if (location.state?.loadCampaign) {
      const c = location.state.loadCampaign;
      setNarrative(c.narrative || "");
      setOutput(c.output || "");
      setTone(c.tone ?? null);
      setSaved(true);
      setStatus("Campaign loaded from library.");
    }
  }, [location.state]);

  async function loadLibrary() {
    try {
      const all = await loadAllCampaigns();
      setLibrary(all.filter(c => c.tool === "rebuttal"));
    } catch {}
  }

  const notify = (msg, type="ok") => { setNotif({msg,type}); setTimeout(()=>setNotif(null),3500); };

  const reset = () => {
    setNarrative(""); setProfiles([]); setTone(null);
    setOutput(""); setStatus(""); setError(null);
    setCopied(false); setSaved(false);
  };

  const toggleProfile = (key) => {
    setProfiles(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key);
      if (prev.length >= effectiveCount) return prev;
      return [...prev, key];
    });
  };

  const generate = async () => {
    if (!narrative.trim()) return;
    setLoading(true); setOutput(""); setError(null);
    setCopied(false); setSaved(false); setStatus("Building your campaign…");

    const n = effectiveCount;
    const userPrompt = `False narrative to rebut: "${narrative.trim()}"

Generate the full rapid rebuttal posting plan for ${n} activist: derive the anchor phrase, identify 3 rebuttal lenses, then write platform-specific posts (Facebook, Instagram, Threads, BlueSky, Twitter/X, TikTok) with each post's first comment paired directly beneath it.`;

    try {
      const res = await fetch("/.netlify/functions/generate-rebuttal", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-5", max_tokens:2000,
          system: buildPrompt(n, profiles, TONES.find(t => t.key === tone) ?? null),
          messages:[{ role:"user", content:userPrompt }],
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        const raw = (err?.error?.message || "").toLowerCase();
        if (raw.includes("string did not match") || raw.includes("pattern") || res.status === 400) throw new Error("CONTENT_FLAGGED");
        if (res.status === 429) throw new Error("RATE_LIMITED");
        if (res.status === 529 || res.status === 503) throw new Error("OVERLOADED");
        throw new Error("GENERIC");
      }
      const data = await res.json();
      const text = data.content.filter(b => b.type==="text").map(b => b.text).join("\n");
      setOutput(text); setStatus("Campaign ready.");
    } catch(e) {
      const ERROR_MSGS = {
        CONTENT_FLAGGED: { heading:"This topic was flagged before it reached the AI.", body:"Try rephrasing your input as a description of the false claim rather than quoting it directly. For example: \"False narratives are circulating that claim [describe the claim].\"" },
        RATE_LIMITED:    { heading:"Too many requests — please wait a moment.", body:"Wait 30–60 seconds and try again." },
        OVERLOADED:      { heading:"The AI is temporarily overloaded.", body:"Wait a minute and try generating again." },
        GENERIC:         { heading:"Something went wrong.", body:"Check that your input isn't empty and try again. If it persists, try refreshing the page." },
      };
      setError(ERROR_MSGS[e.message] ?? ERROR_MSGS.GENERIC);
      setStatus("");
    } finally { setLoading(false); }
  };

  const handleCopy = () => {
    copyText(output).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2200); })
      .catch(() => setError({ heading:"Copy failed.", body:"Try selecting the text manually and copying with Ctrl/Cmd+C." }));
  };

  const handleShare = () => {
    if (navigator.share) navigator.share({ title:"Rapid Rebuttal Campaign", text:output }).catch(()=>setShowShare(true));
    else setShowShare(true);
  };

  const handleShareCopy = () => {
    copyText(output).then(() => { setShareCopied(true); setTimeout(()=>setShareCopied(false),2200); });
  };

  const saveToLibrary = async () => {
    const profileLabels = profiles.map(k => PROFILES.find(p => p.key===k)?.label).filter(Boolean);
    try {
      const id = await saveCampaign("rebuttal", {
        narrative: narrative.trim(), output, activistCount:1,
        profiles: profileLabels, tone: tone ?? null, savedAt: new Date().toISOString(),
      });
      const entry = { id, tool:"rebuttal", narrative:narrative.trim(), output, activistCount:1, profiles:profileLabels, tone:tone??null, savedAt:new Date().toISOString() };
      setSaved(true); setLibrary(prev => [entry,...prev]);
      notify("Saved to shared library!");
    } catch { setError({ heading:"Save failed.", body:"Unable to save to shared library. Please try again." }); }
  };

  const loadEntry = (entry) => {
    setNarrative(entry.narrative); setOutput(entry.output);
    setTone(entry.tone ?? null); setStatus("Campaign loaded from library.");
    setSaved(true); setShowLib(false);
    window.scrollTo({ top:0, behavior:"smooth" });
  };

  const deleteEntry = async (id, e) => {
    e.stopPropagation();
    try { await deleteCampaign(id); setLibrary(prev => prev.filter(c => c.id!==id)); } catch {}
  };

  const editAndRegenerate = () => {
    setOutput(""); setStatus(""); setSaved(false); setCopied(false);
    setTimeout(() => document.getElementById("narrative-input")?.focus(), 50);
  };

  const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); } catch { return ""; }
  };

  const stickyBtn = (onClick, label, isPrimary, disabled) => (
    <button onClick={onClick} disabled={!!disabled} style={{
      padding:"10px 18px", borderRadius:8, fontSize:15, fontWeight:700,
      cursor: disabled ? "not-allowed" : "pointer", fontFamily:"inherit",
      background: isPrimary ? RED : SURFACE,
      color: isPrimary ? "#fff" : INK,
      border: isPrimary ? `2px solid ${RED_DARK}` : `2px solid ${INK}`,
      opacity: disabled ? 0.5 : 1,
    }}>{label}</button>
  );

  return (
    <div style={{ minHeight:"100vh", background:BG, color:INK, fontFamily:"'Atkinson Hyperlegible', Georgia, serif" }}>
      <style>{globalCSS}</style>

      {/* DISCLAIMER */}
      <div style={{ background:"#fff0f0", borderBottom:`2px solid ${RED}`, padding:"10px 20px", textAlign:"center", fontSize:14, color:RED_DARK, fontWeight:600 }}>
        ⚠️ AI-generated content — always verify facts and claims before publishing.
      </div>

      {/* TOAST */}
      {notif && (
        <div className="slide-down" role="alert" style={{ position:"fixed", top:80, left:"50%", transform:"translateX(-50%)", zIndex:100, padding:"14px 28px", borderRadius:10, fontSize:17, fontWeight:700, background: notif.type==="err" ? "#b91c1c" : "#145214", color:"#fff", boxShadow:"0 4px 24px rgba(0,0,0,0.3)", whiteSpace:"nowrap" }}>
          {notif.msg}
        </div>
      )}

      {/* HEADER */}
      <header style={{ background:BG, borderBottom:`4px solid ${RED_DARK}`, position:"sticky", top:0, zIndex:40 }}>
        <div style={{ maxWidth:860, margin:"0 auto", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:48, height:48, background:RED, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:24, color:"#fff" }}>R</div>
            <div>
              <h1 style={{ fontSize:24, fontWeight:900, color:INK, lineHeight:1.1 }}>Rebuttal Generator</h1>
              <p style={{ fontSize:13, color:LIGHT, fontStyle:"italic" }}>Anchor phrase · 3 lenses · 6 platforms · posts + first comments</p>
            </div>
          </div>
          <nav style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            {output && (
              <>
                {stickyBtn(reset, "↩ New Campaign", false)}
                {stickyBtn(editAndRegenerate, "Edit & Regen", false)}
                {stickyBtn(generate, loading ? "Generating…" : "Regenerate", true, loading)}
                {stickyBtn(saved ? null : saveToLibrary, saved ? "✓ Saved" : "Save to Library", true, saved)}
              </>
            )}
            {!output && library.length > 0 && (
              <button style={{ padding:"10px 18px", borderRadius:8, fontSize:15, fontWeight:700, cursor:"pointer", background:SURFACE, color:INK, border:`2px solid ${BORDER}`, fontFamily:"inherit" }}
                onClick={() => setShowLib(v => !v)}>
                {showLib ? "Hide Library" : `Library (${library.length})`}
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* LIBRARY PANEL */}
      {showLib && library.length > 0 && (
        <div style={{ borderBottom:`2px solid ${BORDER}`, background:SURFACE, padding:"20px 24px" }}>
          <div style={{ maxWidth:860, margin:"0 auto" }}>
            <div style={{ fontSize:12, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase", color:MID, marginBottom:14 }}>Saved Campaigns</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 }}>
              {library.map(entry => (
                <div key={entry.id} style={{ border:`2px solid ${BORDER}`, borderRadius:8, padding:14, background:BG, cursor:"pointer" }} onClick={() => loadEntry(entry)}>
                  <div style={{ fontSize:14, lineHeight:1.5, marginBottom:6, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{entry.narrative}</div>
                  <div style={{ fontSize:12, color:LIGHT, marginBottom:10 }}>{fmtDate(entry.savedAt)}</div>
                  <div style={{ display:"flex", gap:10 }}>
                    <span style={{ fontSize:12, color:RED_DARK, textDecoration:"underline", cursor:"pointer" }}>Load</span>
                    <span style={{ fontSize:12, color:"#900", textDecoration:"underline", cursor:"pointer" }} onClick={e => deleteEntry(entry.id,e)}>Delete</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MAIN */}
      <main style={{ maxWidth:860, margin:"0 auto", padding:"36px 24px 80px" }}>

        {loading ? <LoadingAnimation /> : (
          <>
            {/* Narrative input */}
            <div style={{ marginBottom:28 }}>
              <h2 style={{ fontSize:32, fontWeight:900, color:INK, marginBottom:8 }}>Rebut a False Narrative</h2>
              <p style={{ fontSize:18, color:MID, lineHeight:1.5 }}>Enter the false claim you want to counter. The generator will build an anchor phrase, rebuttal lenses, and platform-ready posts.</p>
            </div>

            <div style={{ marginBottom:8 }}>
              <label style={S.label} htmlFor="narrative-input">False narrative to rebut <span style={{color:RED}}>*</span></label>
              <textarea id="narrative-input" style={S.textarea} rows={4}
                placeholder="e.g. Gerrymandering doesn't stop anyone from voting, so it isn't harmful."
                value={narrative} onChange={e => setNarrative(e.target.value)} disabled={loading} />
            </div>

            {/* Options toggle */}
            {(() => {
              const activeCount = (profiles.length > 0 ? 1 : 0) + (tone !== null ? 1 : 0);
              return (
                <button style={{ marginTop:12, padding:"8px 18px", background:"transparent", color: activeCount > 0 ? INK : LIGHT, border:`2px solid ${activeCount > 0 ? INK : BORDER}`, borderRadius:8, fontSize:13, letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:"inherit", cursor:"pointer", display:"block" }}
                  onClick={() => setShowOptions(v => !v)}>
                  {showOptions ? "− Hide options" : `+ Customize${activeCount > 0 ? ` (${activeCount} active)` : ""}`}
                </button>
              );
            })()}

            {showOptions && (
              <div style={{ marginTop:20, display:"flex", flexDirection:"column", gap:20 }}>
                {/* Profile picker */}
                <section style={S.card}>
                  <div style={S.label}>Activist profile <span style={{ fontWeight:400, fontSize:12, textTransform:"none", letterSpacing:0, color:LIGHT }}>(optional — AI chooses if skipped)</span></div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                    {PROFILES.map(p => {
                      const checked = profiles.includes(p.key);
                      const maxed = !checked && profiles.length >= effectiveCount;
                      return (
                        <div key={p.key} style={profileCard(checked, maxed)} onClick={() => !maxed && toggleProfile(p.key)}>
                          <div style={{ width:14, height:14, border:`2px solid ${checked ? RED_DARK : BORDER}`, borderRadius:3, background: checked ? RED_DARK : "transparent", flexShrink:0, marginTop:2, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:9 }}>{checked ? "✓" : ""}</div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:700, lineHeight:1.2 }}>{p.label}</div>
                            <div style={{ fontSize:11, color:LIGHT, lineHeight:1.3, marginTop:2 }}>{p.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Tone modifier */}
                <section style={S.card}>
                  <div style={S.label}>Tone modifier <span style={{ fontWeight:400, fontSize:12, textTransform:"none", letterSpacing:0, color:LIGHT }}>(optional)</span></div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
                    {TONES.map(t => {
                      const active = tone === t.key;
                      return (
                        <button key={t.key} onClick={() => setTone(active ? null : t.key)} style={{
                          padding:"8px 18px", background: active ? RED : "transparent",
                          color: active ? "#fff" : INK, border:`2px solid ${active ? RED_DARK : BORDER}`,
                          borderRadius:8, fontSize:14, fontFamily:"inherit", cursor:"pointer", fontWeight: active ? 700 : 400,
                        }}>{t.label}</button>
                      );
                    })}
                  </div>
                  <p style={S.hint}>{tone ? `"${TONES.find(t=>t.key===tone)?.label}" tone applies across all posts.` : "Skip to use a balanced, campaign-appropriate tone."}</p>
                </section>
              </div>
            )}

            {/* Generate button */}
            <button style={{ ...S.btnPrimary, marginTop:24, display:"flex", alignItems:"center", gap:10, opacity: loading||!narrative.trim() ? 0.65 : 1, cursor: loading||!narrative.trim() ? "not-allowed":"pointer" }}
              onClick={generate} disabled={loading || !narrative.trim()}>
              {output ? "Regenerate Campaign" : "Generate Campaign →"}
            </button>

            {status && <p style={{ fontSize:14, color:LIGHT, fontStyle:"italic", marginTop:12 }}>{status}</p>}

            {error && (
              <div style={S.errBox}>
                <strong style={{ display:"block", marginBottom:6 }}>{error.heading}</strong>
                {error.body}
              </div>
            )}
          </>
        )}

        {/* OUTPUT */}
        {output && !loading && (
          <>
            <hr style={{ border:"none", borderTop:`3px solid ${RED_DARK}`, margin:"36px 0 28px" }} />
            <h3 style={{ fontSize:26, fontWeight:900, color:INK, marginBottom:20 }}>Your Campaign</h3>

            {/* Anchor Phrase */}
            {(() => {
              const m = output.match(/## Anchor Phrase\n([\s\S]*?)(?=## Rebuttal Lenses|## Activist)/);
              return m ? (
                <div style={{ background:INK, border:`3px solid ${INK}`, borderRadius:8, padding:"20px 24px", marginBottom:16 }}>
                  <div style={{ fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"#aaa", marginBottom:10 }}>Anchor Phrase</div>
                  <div style={{ color:"#fff", fontSize:16, lineHeight:1.7, whiteSpace:"pre-wrap" }}>{m[1].trim()}</div>
                </div>
              ) : null;
            })()}

            {/* Rebuttal Lenses */}
            {(() => {
              const m = output.match(/## Rebuttal Lenses\n([\s\S]*?)(?=## Activist)/);
              return m ? (
                <div style={{ background:"#2a1a1a", border:`2px solid ${RED_DARK}`, borderRadius:8, padding:"20px 24px", marginBottom:24 }}>
                  <div style={{ fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"#e88", marginBottom:10 }}>Rebuttal Lenses</div>
                  <div style={{ color:"#f5f5f5", fontSize:15, lineHeight:1.8, whiteSpace:"pre-wrap" }}>{m[1].trim()}</div>
                </div>
              ) : null;
            })()}

            {/* Platform Cards */}
            {[
              { name:"Facebook",  abbr:"FB", color:"#0a4fa8" },
              { name:"Instagram", abbr:"IG", color:"#7b1a6e" },
              { name:"Threads",   abbr:"TH", color:"#111111" },
              { name:"BlueSky",   abbr:"BS", color:"#0055bb" },
              { name:"Twitter/X", abbr:"X",  color:"#0369a1" },
              { name:"TikTok",    abbr:"TK", color:"#b91c1c" },
            ].map(p => {
              const regex = new RegExp(`### ${p.name}\\n([\\s\\S]*?)(?=### |## Activist|$)`);
              const match = output.match(regex);
              if (!match) return null;
              const block = match[1].trim();
              const postMatch    = block.match(/POST:\s*([\s\S]*?)(?=FIRST COMMENT:|$)/);
              const commentMatch = block.match(/FIRST COMMENT:\s*([\s\S]*?)$/);
              const postText    = postMatch    ? postMatch[1].trim()    : block;
              const commentText = commentMatch ? commentMatch[1].trim() : null;
              return (
                <div key={p.name} style={{ border:`2px solid ${p.color}`, borderRadius:8, marginBottom:14, overflow:"hidden" }}>
                  <div style={{ background:p.color, padding:"10px 16px", display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ background:"rgba(255,255,255,0.2)", color:"#fff", fontWeight:900, fontSize:12, padding:"4px 10px", borderRadius:4 }}>{p.abbr}</span>
                    <span style={{ color:"#fff", fontWeight:700, fontSize:16 }}>{p.name}</span>
                  </div>
                  <div style={{ padding:"16px 20px", background:SURFACE }}>
                    <div style={{ fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", color:LIGHT, marginBottom:8 }}>Post</div>
                    <div style={{ fontSize:15, lineHeight:1.8, color:INK, whiteSpace:"pre-wrap", marginBottom:12 }}>{postText}</div>
                    <button onClick={() => copyText(postText).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);})}
                      style={{ padding:"8px 18px", background:INK, color:"#fff", border:"none", borderRadius:6, fontSize:13, letterSpacing:"0.06em", textTransform:"uppercase", cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>
                      Copy Post
                    </button>
                  </div>
                  {commentText && (
                    <div style={{ padding:"14px 20px", background:"#f5f2ee", borderTop:`1px solid ${p.color}44` }}>
                      <div style={{ fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", color:LIGHT, marginBottom:8 }}>First Comment</div>
                      <div style={{ fontSize:14, lineHeight:1.7, color:MID, whiteSpace:"pre-wrap" }}>{commentText}</div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Action buttons */}
            <div style={{ display:"flex", gap:10, marginTop:20, flexWrap:"wrap" }}>
              <button style={{ ...S.btnSecondary, fontSize:16 }} onClick={handleCopy}>{copied ? "✓ Copied All" : "Copy All"}</button>
              <button style={{ ...S.btnSecondary, fontSize:16 }} onClick={handleShare}>Share</button>
              <button style={{ ...S.btnSecondary, fontSize:16 }} onClick={editAndRegenerate}>Edit & Regenerate</button>
            </div>

            {/* Return to top */}
            <button onClick={() => window.scrollTo({top:0,behavior:"smooth"})}
              style={{ ...S.btnSecondary, margin:"32px auto 0", fontSize:16, padding:"14px 28px", justifyContent:"center" }}>
              ↑ Return to Top
            </button>
          </>
        )}
      </main>

      {/* SHARE MODAL */}
      {showShare && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={() => setShowShare(false)}>
          <div style={{ background:BG, border:`2px solid ${INK}`, borderRadius:8, width:"100%", maxWidth:700, maxHeight:"86vh", display:"flex", flexDirection:"column" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ borderBottom:`2px solid ${BORDER}`, padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:13, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:MID }}>Share Campaign</span>
              <button style={{ padding:"6px 14px", background:"transparent", color:MID, border:`1px solid ${BORDER}`, borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:"inherit" }} onClick={() => setShowShare(false)}>✕ Close</button>
            </div>
            <div style={{ padding:"20px 24px", overflowY:"auto", flex:1, fontSize:14, lineHeight:1.85, whiteSpace:"pre-wrap" }}>{output}</div>
            <div style={{ borderTop:`1px solid ${BORDER}`, padding:"12px 20px", display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button style={{ ...S.btnDark, fontSize:14 }} onClick={handleShareCopy}>{shareCopied ? "✓ Copied" : "Copy All"}</button>
              <button style={{ ...S.btnSecondary, fontSize:14, padding:"10px 18px" }} onClick={() => setShowShare(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
