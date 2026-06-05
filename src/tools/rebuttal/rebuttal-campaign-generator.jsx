import { useState, useEffect } from "react";
import { saveCampaign, loadAllCampaigns, deleteCampaign } from "../../lib/campaignLibrary";

// ── 9 activist profile choices ────────────────────────────────────────────
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

// ── Tone options ──────────────────────────────────────────────────────────
const TONES = [
  { key: "casual",       label: "Casual",       instruction: "Use relaxed, everyday language. Posts should feel like a real person talking, not a press release." },
  { key: "friendly",     label: "Friendly",     instruction: "Use approachable, inclusive, encouraging language. Make readers feel welcomed, not lectured." },
  { key: "witty",        label: "Witty",        instruction: "Use clever wordplay, sharp observations, and light humor. Posts should make people smile while landing the point." },
  { key: "sarcastic",    label: "Sarcastic",    instruction: "Use dry, pointed sarcasm to expose the absurdity of the false claim. Keep it cutting but not mean-spirited." },
  { key: "empathetic",   label: "Empathetic",   instruction: "Lead with understanding and human connection. Acknowledge real concerns before pivoting to the rebuttal." },
  { key: "professional", label: "Professional", instruction: "Use clear, measured, authoritative language. Sound like the most credible voice in the room." },
  { key: "excited",      label: "Excited",      instruction: "Use high-energy, enthusiastic language. Posts should feel like the writer can barely contain themselves." },
  { key: "funny",        label: "Funny",        instruction: "Use genuine humor — jokes, absurdist comparisons, comic timing. Make people laugh and share." },
  { key: "dramatic",     label: "Dramatic",     instruction: "Lean into the stakes. Use vivid, heightened language that underscores the gravity of the situation." },
  { key: "disgusted",    label: "Disgusted",    instruction: "Express genuine moral indignation — viscerally disappointed and outraged, but always grounded in fact." },
  { key: "angry",        label: "Angry",        instruction: "Channel controlled, righteous anger. Direct and forceful — not ranting, but clearly furious about injustice." },
];

// ── System prompt — 1 activist, optional profile ─────────────────────────
function buildPrompt(chosenKey, tone) {
  const profile = chosenKey ? PROFILES.find(p => p.key === chosenKey) : null;
  const voice = profile
    ? `Activist voice: ${profile.label} — ${profile.desc}. Write posts in an authentic voice matching this profile.`
    : `Activist voice: Choose a voice well-suited to this topic and briefly name it at the start of the activist section.`;

  return `You are a rapid rebuttal campaign strategist producing complete social media posting plans.

ACTIVIST VOICE:
${voice}

OUTPUT STRUCTURE — follow exactly:

## Anchor Phrase
Derive one short memorable sentence specific to this false narrative as the campaign spine. State it, then in one sentence explain why it works for this claim.

## Rebuttal Lenses
Three lenses with bold titles and one-sentence explanations.

## Activist
At the very start of this section, include one line in this exact format:
Activist: [Profile name and description, or the voice you chose in 6–10 words.]

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
FIRST COMMENT: [1 punchy sentence]

RULES:
- Write ALL posts and first comments in the third person. Never use "I" or "my". Write as if observing and reporting — "Communities are being silenced," not "I am outraged."
- Anchor phrase must emerge from the specific narrative — never generic
- Always end every post with a call to action
- First comments match their platform's tone and length norms
- Never use "Voting access is not the same as equal power" unless the narrative is specifically about voting${tone ? `
- TONE MODIFIER — applies to every single post and first comment: ${tone.instruction} All writing should be unmistakably colored by this tone.` : ""}`;
}

// ── Palette & styles ──────────────────────────────────────────────────────
const INK = "#1A1A1A", BG = "#F7F5F0", SURFACE = "#FDFCFA",
      BORDER = "#C8C4BC", MID = "#555", LIGHT = "#888", GREEN = "#2A6A2A";

const S = {
  app:    { minHeight: "100vh", background: BG, fontFamily: "'Georgia','Times New Roman',serif", color: INK },
  header: { borderBottom: `2px solid ${INK}`, padding: "24px 32px 18px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" },
  hLeft:  { display: "flex", flexDirection: "column", gap: "3px" },
  hRight: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", paddingTop: "4px" },
  eyebrow:{ fontSize: "11px", letterSpacing: "0.18em", textTransform: "uppercase", color: LIGHT },
  h1:     { fontSize: "24px", fontWeight: "700", letterSpacing: "-0.02em", margin: "0", lineHeight: "1.1" },
  sub:    { fontSize: "13px", color: MID, fontStyle: "italic", margin: "0" },
  main:   { maxWidth: "820px", margin: "0 auto", padding: "32px 24px 80px" },
  lbl:    { display: "block", fontSize: "11px", letterSpacing: "0.13em", textTransform: "uppercase", color: MID, marginBottom: "8px", marginTop: "24px" },
  optTag: { fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: LIGHT, border: `1px solid ${BORDER}`, padding: "1px 6px", borderRadius: "2px", marginLeft: "8px", verticalAlign: "middle" },
  textarea:{ width: "100%", minHeight: "88px", padding: "14px", fontSize: "15px", fontFamily: "'Georgia',serif", border: `1.5px solid ${BORDER}`, borderRadius: "2px", background: SURFACE, color: INK, resize: "vertical", lineHeight: "1.6", outline: "none", boxSizing: "border-box" },
  pillRow:{ display: "flex", gap: "8px", marginBottom: "18px" },
  grid:   { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "6px" },
  hint:   { fontSize: "11px", color: LIGHT, fontStyle: "italic", marginBottom: "18px" },
  outBox: { background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: "2px", padding: "28px", fontSize: "14px", lineHeight: "1.85", whiteSpace: "pre-wrap", fontFamily: "'Georgia',serif" },
  actRow: { display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" },
  divider:{ border: "none", borderTop: `1px solid #D5D1C8`, margin: "30px 0" },
  status: { fontSize: "13px", color: LIGHT, fontStyle: "italic", marginTop: "14px", minHeight: "18px" },
  errBox: { background: "#FEF0F0", border: "1.5px solid #E88", borderRadius: "2px", padding: "14px 16px", color: "#900", fontSize: "14px", marginTop: "16px", lineHeight: "1.6" },
  libPanel:{ borderTop: `2px solid ${INK}`, background: SURFACE, padding: "20px 32px 28px" },
  libGrid:{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: "10px", marginTop: "14px" },
  libCard:{ border: `1.5px solid ${BORDER}`, borderRadius: "2px", padding: "14px", background: BG, cursor: "pointer" },
  libNarr:{ fontSize: "13px", lineHeight: "1.45", marginBottom: "5px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  libMeta:{ fontSize: "11px", color: LIGHT, marginBottom: "10px" },
  libActs:{ display: "flex", gap: "6px", flexWrap: "wrap" },
  overlay:{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  modal:  { background: BG, border: `2px solid ${INK}`, borderRadius: "2px", width: "100%", maxWidth: "700px", maxHeight: "86vh", display: "flex", flexDirection: "column" },
  mHead:  { borderBottom: `1.5px solid ${BORDER}`, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  mTitle: { fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: MID },
  mBody:  { padding: "20px 24px", overflowY: "auto", flex: 1, fontSize: "13px", lineHeight: "1.85", whiteSpace: "pre-wrap", fontFamily: "'Georgia',serif" },
  mFoot:  { borderTop: `1px solid ${BORDER}`, padding: "12px 20px", display: "flex", gap: "8px", justifyContent: "flex-end" },
  spin:   { display: "inline-block", width: "13px", height: "13px", border: `2px solid ${BG}`, borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", marginRight: "7px", verticalAlign: "middle" },
};

// Reusable button builders
const btnSolid = (disabled) => ({ padding: "12px 28px", background: disabled ? "#999" : INK, color: BG, border: "none", borderRadius: "2px", fontSize: "13px", letterSpacing: "0.09em", textTransform: "uppercase", fontFamily: "'Georgia',serif", cursor: disabled ? "not-allowed" : "pointer", marginTop: "18px" });
const btnOutline = (active) => ({ padding: "8px 16px", background: active ? "#EAF0EA" : "transparent", color: active ? GREEN : INK, border: `1.5px solid ${active ? GREEN : INK}`, borderRadius: "2px", fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", fontFamily: "'Georgia',serif", cursor: "pointer" });
const btnSmall = () => ({ padding: "5px 13px", background: "transparent", color: MID, border: `1px solid ${BORDER}`, borderRadius: "2px", fontSize: "11px", letterSpacing: "0.09em", textTransform: "uppercase", fontFamily: "'Georgia',serif", cursor: "pointer" });
const pill = (active) => ({ padding: "7px 18px", background: active ? INK : "transparent", color: active ? BG : INK, border: `1.5px solid ${INK}`, borderRadius: "2px", fontSize: "13px", fontFamily: "'Georgia',serif", cursor: "pointer" });
const profileCard = (checked, disabled) => ({ padding: "9px 11px", border: `1.5px solid ${checked ? INK : BORDER}`, borderRadius: "2px", background: checked ? "#EEEAE4" : SURFACE, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, display: "flex", gap: "8px", alignItems: "flex-start" });
const checkBox = (checked) => ({ width: "13px", height: "13px", border: `1.5px solid ${checked ? INK : BORDER}`, borderRadius: "2px", background: checked ? INK : "transparent", flexShrink: 0, marginTop: "2px", display: "flex", alignItems: "center", justifyContent: "center", color: BG, fontSize: "9px" });

// ── Error messages ────────────────────────────────────────────────────────
const ERROR_MSGS = {
  CONTENT_FLAGGED: { heading: "This topic was flagged before it reached the AI.", body: "Anthropic's API filters certain sensitive phrases — particularly around elections — before they can be processed, even when the intent is to rebut them. Try rephrasing your input as a description of the false claim rather than quoting it directly. For example: \"False narratives are circulating that claim [describe the claim].\" This signals you're building a rebuttal, not spreading misinformation." },
  RATE_LIMITED:    { heading: "Too many requests — please wait a moment.",          body: "The API has received too many requests in a short window. Wait 30–60 seconds and try again." },
  OVERLOADED:      { heading: "The AI is temporarily overloaded.",                  body: "Anthropic's servers are under heavy load. Wait a minute and try generating again." },
  GENERIC:         { heading: "Something went wrong.",                              body: "An unexpected error occurred. Check that your input isn't empty and try again. If it persists, try refreshing the page." },
};

// ── Copy helper with execCommand fallback (works inside iframes) ──────────
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((res, rej) => {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    ok ? res() : rej(new Error("execCommand copy failed"));
  });
}

// ── Main component ────────────────────────────────────────────────────────
export default function RebuttalGenerator() {
  const [narrative,   setNarrative]   = useState("");
  const [profile,     setProfile]     = useState(null);  // single selected profile key or null
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

  // Load library on mount
  useEffect(() => { loadLibrary(); }, []);

  async function loadLibrary() {
    try {
      const all = await loadAllCampaigns();
      setLibrary(all.filter(c => c.tool === "rebuttal"));
    } catch { /* no saved items */ }
  }

  // ── Reset ───────────────────────────────────────────────────────────────
  const reset = () => {
    setNarrative(""); setProfile(null); setTone(null);
    setOutput(""); setStatus(""); setError(null);
    setCopied(false); setSaved(false);
  };

  // ── Generate ────────────────────────────────────────────────────────────
  const generate = async () => {
    if (!narrative.trim()) return;
    setLoading(true); setOutput(""); setError(null);
    setCopied(false); setSaved(false);
    setStatus("Building your campaign…");

    const userPrompt = `False narrative to rebut: "${narrative.trim()}"

Generate the full rapid rebuttal posting plan: derive the anchor phrase, identify 3 rebuttal lenses, then write platform-specific posts (Facebook, Instagram, Threads, BlueSky, Twitter/X, TikTok) with each post's first comment paired directly beneath it.`;

    try {
      const res = await fetch("/.netlify/functions/generate-rebuttal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 4000,
          system: buildPrompt(profile, TONES.find(t => t.key === tone) ?? null),
          messages: [{ role: "user", content: userPrompt }],
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
      const text = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      setOutput(text);
      setStatus("Campaign ready.");
    } catch (e) {
      setError(ERROR_MSGS[e.message] ?? ERROR_MSGS.GENERIC);
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  // ── Copy all ────────────────────────────────────────────────────────────
  const handleCopy = () => {
    copyText(output).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2200);
    }).catch(() => {
      setError({ heading: "Copy failed.", body: "Your browser blocked the clipboard. Try selecting the text manually and copying with Ctrl/Cmd+C." });
    });
  };

  // ── Share ───────────────────────────────────────────────────────────────
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: "Rapid Rebuttal Campaign", text: output })
        .catch(() => setShowShare(true)); // native share failed (e.g. iframe restriction) — show modal
    } else {
      setShowShare(true);
    }
  };

  const handleShareCopy = () => {
    copyText(output).then(() => {
      setShareCopied(true); setTimeout(() => setShareCopied(false), 2200);
    });
  };

  // ── Save to library ─────────────────────────────────────────────────────
  const saveToLibrary = async () => {
    const profileLabel = profile ? PROFILES.find(p => p.key === profile)?.label : null;
    try {
      const id = await saveCampaign("rebuttal", {
        name: narrative.trim().substring(0, 60),
        narrative: narrative.trim(),
        output,
        profile: profileLabel,
        tone: tone ?? null,
      });
      const entry = { id, tool:"rebuttal", name: narrative.trim().substring(0, 60), narrative: narrative.trim(), output, profile: profileLabel, tone: tone ?? null, savedAt: new Date().toISOString() };
      setSaved(true);
      setLibrary(prev => [entry, ...prev]);
    } catch {
      setError({ heading: "Save failed.", body: "Unable to save to shared library. Please try again." });
    }
  };

  // ── Load from library ───────────────────────────────────────────────────
  const loadEntry = (entry) => {
    setNarrative(entry.narrative);
    setOutput(entry.output);
    setTone(entry.tone ?? null);
    setProfile(entry.profile ? (PROFILES.find(p => p.label === entry.profile)?.key ?? null) : null);
    setStatus("Campaign loaded from library.");
    setSaved(true);
    setShowLib(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteEntry = async (id, e) => {
    e.stopPropagation();
    try {
      await deleteCampaign(id);
      setLibrary(prev => prev.filter(c => c.id !== id));
    } catch { /* ignore */ }
  };

  // ── Edit & regenerate ───────────────────────────────────────────────────
  const editAndRegenerate = () => {
    setOutput(""); setStatus(""); setSaved(false); setCopied(false);
    setTimeout(() => document.getElementById("narrative-input")?.focus(), 50);
  };

  const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={S.app}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea:focus { border-color: ${INK} !important; }
        button:hover { opacity: 0.82; }
        button:disabled { opacity: 1; }
      `}</style>

      {/* ── Library button row — replaces the removed duplicate header ── */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: "10px 32px", display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end", background: SURFACE }}>
        <button style={btnSmall()} onClick={() => setShowLib(v => !v)}>
          {showLib ? "Hide Library" : `Rebuttal Library (${library.length})`}
        </button>
        {(output || narrative) && (
          <button style={btnSmall()} onClick={reset}>↩ New Campaign</button>
        )}
      </div>

      {/* ── Library panel ── */}
      {showLib && library.length > 0 && (
        <div style={S.libPanel}>
          <div style={{ fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: MID }}>Saved Campaigns</div>
          <div style={S.libGrid}>
            {library.map(entry => (
              <div key={entry.id} style={S.libCard} onClick={() => loadEntry(entry)}>
                <div style={S.libNarr}>{entry.narrative}</div>
                <div style={S.libMeta}>{fmtDate(entry.savedAt)}{entry.profile ? ` · ${entry.profile}` : ""}</div>
                <div style={{ marginTop: "10px", display: "flex", gap: "6px" }}>
                  <span style={{ fontSize: "11px", color: INK, textDecoration: "underline" }}>Load</span>
                  <span style={{ fontSize: "11px", color: "#900", textDecoration: "underline", marginLeft: "4px" }}
                    onClick={(e) => deleteEntry(entry.id, e)}>Delete</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <main style={S.main}>

        {/* Narrative input */}
        <div style={{
          background: "#FFFBEA",
          border: "3px solid #F5C842",
          borderRadius: 8,
          padding: "20px 20px 16px",
          marginBottom: 4,
        }}>
          <label style={{ ...S.lbl, marginTop: 0, color: "#7A5C00", fontSize: "13px" }} htmlFor="narrative-input">
            ⚠️ Enter the LIE you are rebutting
          </label>
          <p style={{ fontSize: 13, color: "#8a6800", marginBottom: 12, lineHeight: 1.5, fontStyle: "italic" }}>
            Type or paste the exact false claim, misleading statement, or disinformation narrative here — this is what the entire campaign is built to counter.
          </p>
          <textarea
            id="narrative-input"
            style={{ ...S.textarea, borderColor: "#F5C842", background: "#fff" }}
            placeholder="e.g. Gerrymandering doesn't stop anyone from voting, so it isn't harmful."
            value={narrative}
            onChange={e => setNarrative(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Options toggle */}
        {(() => {
          const activeCount = (profile !== null ? 1 : 0) + (tone !== null ? 1 : 0);
          return (
            <button
              style={{ marginTop: "14px", padding: "7px 16px", background: "transparent", color: activeCount > 0 ? INK : LIGHT, border: `1px solid ${activeCount > 0 ? INK : BORDER}`, borderRadius: "2px", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Georgia',serif", cursor: "pointer", display: "block" }}
              onClick={() => setShowOptions(v => !v)}
            >
              {showOptions ? "− Hide options" : `+ Customize${activeCount > 0 ? ` (${activeCount} active)` : ""}`}
            </button>
          );
        })()}

        {/* ── Optional controls ── */}
        {showOptions && (
          <>
        {/* Profile picker — single select */}
        <label style={S.lbl}>
          Activist profile
          <span style={S.optTag}>optional</span>
        </label>
        <div style={S.grid}>
          {PROFILES.map(p => {
            const checked = profile === p.key;
            return (
              <div key={p.key} style={profileCard(checked, false)} onClick={() => setProfile(checked ? null : p.key)}>
                <div style={checkBox(checked)}>{checked ? "✓" : ""}</div>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "600", lineHeight: "1.2" }}>{p.label}</div>
                  <div style={{ fontSize: "11px", color: LIGHT, lineHeight: "1.3", marginTop: "2px" }}>{p.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
        <p style={S.hint}>
          {profile
            ? `${PROFILES.find(p => p.key === profile)?.label} selected — click again to deselect.`
            : "Skip to let the AI choose a voice, or select one profile."}
        </p>

        {/* Tone modifier */}
        <label style={S.lbl}>
          Tone modifier
          <span style={S.optTag}>optional</span>
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
          {TONES.map(t => {
            const active = tone === t.key;
            return (
              <button
                key={t.key}
                style={{ padding: "7px 16px", background: active ? INK : "transparent", color: active ? BG : INK, border: `1.5px solid ${active ? INK : BORDER}`, borderRadius: "2px", fontSize: "12px", fontFamily: "'Georgia',serif", letterSpacing: "0.04em", cursor: "pointer" }}
                onClick={() => setTone(active ? null : t.key)}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <p style={S.hint}>{tone ? `"${TONES.find(t => t.key === tone)?.label}" tone will apply across all posts and comments.` : "Skip to use a balanced, campaign-appropriate tone."}</p>
          </>
        )}

        {/* Generate button */}
        <button style={btnSolid(loading || !narrative.trim())} onClick={generate}
          disabled={loading || !narrative.trim()}>
          {loading && <span style={S.spin} />}
          {loading ? "Generating…" : output ? "Regenerate Campaign" : "Generate Campaign"}
        </button>

        <p style={S.status}>{status}</p>

        {error && (
          <div style={S.errBox}>
            <strong style={{ display: "block", marginBottom: "7px" }}>{error.heading}</strong>
            {error.body}
          </div>
        )}

        {/* Output */}
        {output && (
          <>
            <hr style={S.divider} />
            <label style={S.lbl}>Your campaign</label>
            <div style={S.outBox}>{output}</div>
            <div style={S.actRow}>
              <button style={btnOutline(copied)} onClick={handleCopy}>
                {copied ? "✓ Copied" : "Copy All"}
              </button>
              <button style={btnOutline(saved)} onClick={saved ? undefined : saveToLibrary}>
                {saved ? "✓ Saved" : "Save to Library"}
              </button>
              <button style={btnOutline(false)} onClick={handleShare}>
                Share
              </button>
              <button style={btnOutline(false)} onClick={editAndRegenerate}>
                Edit &amp; Regenerate
              </button>
            </div>
          </>
        )}
      </main>

      {/* ── Share modal ── */}
      {showShare && (
        <div style={S.overlay} onClick={() => setShowShare(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.mHead}>
              <span style={S.mTitle}>Share Campaign</span>
              <button style={{ ...btnSmall(), border: "none" }} onClick={() => setShowShare(false)}>✕ Close</button>
            </div>
            <div style={S.mBody}>{output}</div>
            <div style={S.mFoot}>
              <button style={btnOutline(shareCopied)} onClick={handleShareCopy}>
                {shareCopied ? "✓ Copied" : "Copy All"}
              </button>
              <button style={btnSmall()} onClick={() => setShowShare(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Back to top ── */}
      {output && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{ position: "fixed", bottom: "28px", right: "28px", width: "44px", height: "44px", borderRadius: "50%", background: INK, color: BG, border: "none", fontSize: "18px", cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,0.28)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, lineHeight: 1 }}
          title="Back to top"
        >↑</button>
      )}
    </div>
  );
}
