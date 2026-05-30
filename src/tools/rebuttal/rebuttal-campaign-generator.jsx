import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
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
  { key: "happy",        label: "Happy",        instruction: "Use upbeat, optimistic language. Frame the rebuttal as opportunity. Keep energy positive and forward-looking." },
  { key: "friendly",     label: "Friendly",     instruction: "Use approachable, inclusive, encouraging language. Make readers feel welcomed, not lectured." },
  { key: "witty",        label: "Witty",        instruction: "Use clever wordplay, sharp observations, and light humor. Posts should make people smile while landing the point." },
  { key: "sarcastic",    label: "Sarcastic",    instruction: "Use dry, pointed sarcasm to expose the absurdity of the false claim. Keep it cutting but not mean-spirited." },
  { key: "empathetic",   label: "Empathetic",   instruction: "Use warm, understanding language that acknowledges people's concerns while gently correcting the false narrative." },
  { key: "professional", label: "Professional", instruction: "Use clear, measured, authoritative language. Sound like the most credible voice in the room." },
  { key: "excited",      label: "Excited",      instruction: "Use high-energy, enthusiastic language. Posts should feel like the writer can barely contain themselves." },
  { key: "funny",        label: "Funny",        instruction: "Use humor, wit, and levity to disarm the false narrative. Keep it accessible and shareable." },
  { key: "dramatic",     label: "Dramatic",     instruction: "Use heightened, urgent language that conveys the stakes. Every word should feel important." },
  { key: "disgusted",    label: "Disgusted",    instruction: "Express genuine moral indignation — viscerally disappointed and outraged, but always grounded in fact." },
  { key: "angry",        label: "Angry",        instruction: "Use direct, forceful language that conveys righteous anger. Channel the outrage productively toward action." },
];

// ── Dynamic system prompt ─────────────────────────────────────────────────
function buildPrompt(chosenKey, tone) {
  const voice = chosenKey
    ? (() => { const p = PROFILES.find(p => p.key === chosenKey); return `Activist A: ${p.label} — ${p.desc}. Write their posts in an authentic voice matching this profile.`; })()
    : `Activist A: Choose a distinct voice well-suited to this topic.`;

  const activistBlock = `## Activist A
At the very start of this section, before any platform posts, include one line in this exact format:
Activist A: [If a profile was specified, use that profile's name and description. If you chose the voice yourself, name what you chose and describe it in 6–10 words.]

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
FIRST COMMENT: [1 punchy sentence]`;

  return `You are a rapid rebuttal campaign strategist producing complete social media posting plans.

ACTIVIST VOICE:
${voice}

OUTPUT STRUCTURE — follow exactly:

## Anchor Phrase
Derive one short memorable sentence specific to this false narrative as the campaign spine. State it, then in one sentence explain why it works for this claim.

## Rebuttal Lenses
Three lenses with bold titles and one-sentence explanations.

${activistBlock}

RULES:
- Write ALL posts and first comments in the third person. Never use "I" or "my" as the activist's voice. Write as if observing and reporting — "Communities are being silenced," not "I am outraged." The activist's perspective comes through the subject matter and framing, not personal declarations.
- NEVER invent, assume, or fabricate names of people, places, organizations, or specific statistics. Only use names and figures that appear explicitly in the false narrative provided.
- Anchor phrase must emerge from the specific narrative — never generic
- Always end every post with a call to action
- First comments match their platform's tone and length norms
- Never use "Voting access is not the same as equal power" unless the narrative is specifically about voting${tone ? `
- TONE MODIFIER — applies to every single post and first comment: ${tone.instruction} The activist voice should remain distinct, but all writing should be unmistakably colored by this tone.` : ""}`;
}

// ── Palette & styles ──────────────────────────────────────────────────────
const R = {
  pageBg:      "#ffffff",
  surface:     "#ffffff",
  surfaceAlt:  "#f3f4f6",
  border:      "#555555",
  borderStrong:"#111111",
  text:        "#111111",
  textMid:     "#333333",
  textMute:    "#555555",
  red:         "#c41e1e",
  redDark:     "#8b0000",
};

// Keep old single-letter aliases for existing style references
const INK = R.borderStrong, BG = R.pageBg, SURFACE = R.surface,
      BORDER = R.border, MID = R.textMid, LIGHT = R.textMute, GREEN = "#145214";

const S = {
  app:    { minHeight: "100vh", background: R.pageBg, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", color: R.text },
  header: { borderBottom: `4px solid ${R.borderStrong}`, padding: "14px 20px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", position: "sticky", top: 0, background: R.pageBg, zIndex: 40 },
  hLeft:  { display: "flex", alignItems: "center", gap: "14px" },
  hRight: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  badge:  { width: 48, height: 48, background: R.red, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 24, color: "#fff", flexShrink: 0 },
  h1:     { fontSize: "26px", fontWeight: "900", margin: "0", color: R.text },
  main:   { maxWidth: "820px", margin: "0 auto", padding: "32px 20px 80px" },
  intro:  { marginBottom: "28px" },
  introDesc: { fontSize: "17px", color: R.textMid, lineHeight: 1.6, marginTop: 8 },
  lbl:    { display: "block", fontSize: "11px", letterSpacing: "0.13em", textTransform: "uppercase", color: R.textMid, marginBottom: "8px", marginTop: "24px", fontWeight: 700 },
  optTag: { fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: R.textMute, border: `1px solid ${R.border}`, padding: "1px 6px", borderRadius: "2px", marginLeft: "8px", verticalAlign: "middle" },
  textarea:{ width: "100%", minHeight: "88px", padding: "14px", fontSize: "16px", fontFamily: "'Atkinson Hyperlegible', Georgia, serif", border: `2px solid ${R.border}`, borderRadius: "8px", background: R.surface, color: R.text, resize: "vertical", lineHeight: "1.6", outline: "none", boxSizing: "border-box" },
  pillRow:{ display: "flex", gap: "8px", marginBottom: "18px" },
  grid:   { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", marginBottom: "6px" },
  hint:   { fontSize: "12px", color: R.textMute, fontStyle: "italic", marginBottom: "18px" },
  outBox: { background: R.surface, border: `2px solid ${R.border}`, borderRadius: "8px", padding: "28px", fontSize: "15px", lineHeight: "1.85", whiteSpace: "pre-wrap", fontFamily: "'Atkinson Hyperlegible', Georgia, serif" },
  disclaimer: { background: "#fffbea", border: `2px solid #F5C842`, borderRadius: "10px", padding: "12px 18px", marginTop: "24px", marginBottom: "4px", display: "flex", gap: "10px", alignItems: "flex-start" },
  actRow: { display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" },
  divider:{ border: "none", borderTop: `2px solid ${R.borderStrong}`, margin: "30px 0" },
  status: { fontSize: "13px", color: R.textMute, fontStyle: "italic", marginTop: "14px", minHeight: "18px" },
  errBox: { background: "#FEF0F0", border: "1.5px solid #E88", borderRadius: "8px", padding: "14px 16px", color: "#900", fontSize: "14px", marginTop: "16px", lineHeight: "1.6" },
  libPanel:{ borderTop: `2px solid ${R.borderStrong}`, background: R.surface, padding: "20px 20px 28px" },
  libGrid:{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: "10px", marginTop: "14px" },
  libCard:{ border: `1.5px solid ${R.border}`, borderRadius: "8px", padding: "14px", background: R.pageBg, cursor: "pointer" },
  libNarr:{ fontSize: "13px", lineHeight: "1.45", marginBottom: "5px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  libMeta:{ fontSize: "11px", color: R.textMute, marginBottom: "10px" },
  libActs:{ display: "flex", gap: "6px", flexWrap: "wrap" },
  overlay:{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" },
  modal:  { background: R.pageBg, border: `2px solid ${R.borderStrong}`, borderRadius: "8px", width: "100%", maxWidth: "700px", maxHeight: "86vh", display: "flex", flexDirection: "column" },
  mHead:  { borderBottom: `1.5px solid ${R.border}`, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" },
  mTitle: { fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: R.textMid },
  mBody:  { padding: "20px 24px", overflowY: "auto", flex: 1, fontSize: "14px", lineHeight: "1.85", whiteSpace: "pre-wrap", fontFamily: "'Atkinson Hyperlegible', Georgia, serif" },
  mFoot:  { borderTop: `1px solid ${R.border}`, padding: "12px 20px", display: "flex", gap: "8px", justifyContent: "flex-end" },
  spin:   { display: "inline-block", width: "13px", height: "13px", border: `2px solid rgba(255,255,255,0.4)`, borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite", marginRight: "7px", verticalAlign: "middle" },
};

// Reusable button builders
const btnSolid = (disabled) => ({ padding: "15px 28px", background: disabled ? "#999" : R.red, color: "#fff", border: `3px solid ${disabled ? "#888" : R.redDark}`, borderRadius: "8px", fontSize: "18px", fontWeight: 900, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", cursor: disabled ? "not-allowed" : "pointer", marginTop: "18px", display: "inline-flex", alignItems: "center" });
const btnOutline = (active) => ({ padding: "10px 20px", background: active ? "#f0f0f0" : "transparent", color: active ? GREEN : R.borderStrong, border: `2px solid ${active ? GREEN : R.borderStrong}`, borderRadius: "8px", fontSize: "15px", fontWeight: 700, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", cursor: "pointer" });
const btnSmall = () => ({ padding: "8px 16px", background: "transparent", color: R.textMid, border: `1.5px solid ${R.border}`, borderRadius: "8px", fontSize: "14px", fontWeight: 700, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", cursor: "pointer" });
const pill = (active) => ({ padding: "8px 18px", background: active ? R.borderStrong : "transparent", color: active ? "#fff" : R.text, border: `2px solid ${R.borderStrong}`, borderRadius: "8px", fontSize: "15px", fontFamily: "'Atkinson Hyperlegible', Georgia, serif", cursor: "pointer" });
const profileCard = (checked, disabled) => ({ padding: "9px 11px", border: `1.5px solid ${checked ? R.borderStrong : R.border}`, borderRadius: "8px", background: checked ? "#f0f0f0" : R.surface, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, display: "flex", gap: "8px", alignItems: "flex-start" });
const checkBox = (checked) => ({ width: "13px", height: "13px", border: `1.5px solid ${checked ? R.borderStrong : R.border}`, borderRadius: "2px", background: checked ? R.borderStrong : "transparent", flexShrink: 0, marginTop: "2px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "9px" });

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

// ── Platform display config ───────────────────────────────────────────────
const PLATFORM_META = {
  "facebook":  { abbr: "FB", bg: "#0a4fa8", text: "#fff" },
  "instagram": { abbr: "IG", bg: "#7b1a6e", text: "#fff" },
  "threads":   { abbr: "TH", bg: "#111111", text: "#fff" },
  "bluesky":   { abbr: "BS", bg: "#0055bb", text: "#fff" },
  "twitter":   { abbr: "X",  bg: "#0369a1", text: "#fff" },
  "tiktok":    { abbr: "TK", bg: "#b91c1c", text: "#fff" },
};

// ── Parse raw markdown output into structured sections ────────────────────
function parseOutput(text) {
  if (!text) return null;

  const result = { anchorPhrase: "", anchorExplain: "", lenses: [], activist: "", platforms: [] };

  // Extract Anchor Phrase section
  const anchorMatch = text.match(/##\s*Anchor Phrase\s*\n([\s\S]*?)(?=##|$)/i);
  if (anchorMatch) {
    const lines = anchorMatch[1].trim().split("\n").filter(l => l.trim());
    result.anchorPhrase = lines[0]?.replace(/^[""]|[""]$/g, "").trim() || "";
    result.anchorExplain = lines.slice(1).join(" ").trim();
  }

  // Extract Rebuttal Lenses
  const lensMatch = text.match(/##\s*Rebuttal Lenses\s*\n([\s\S]*?)(?=##|$)/i);
  if (lensMatch) {
    const lensText = lensMatch[1];
    const lensItems = lensText.match(/\*\*([^*]+)\*\*[:\s]*(.*?)(?=\*\*|$)/gs) || [];
    lensItems.forEach(item => {
      const m = item.match(/\*\*([^*]+)\*\*[:\s]*([\s\S]*)/);
      if (m) result.lenses.push({ title: m[1].trim(), body: m[2].trim().replace(/\n/g, " ") });
    });
  }

  // Extract Activist line
  const activistMatch = text.match(/^Activist A:\s*(.+)$/m);
  if (activistMatch) result.activist = activistMatch[1].trim();

  // Extract each platform post + first comment
  const platformNames = [
    { key: "facebook",  pattern: /###\s*Facebook/i },
    { key: "instagram", pattern: /###\s*Instagram/i },
    { key: "threads",   pattern: /###\s*Threads/i },
    { key: "bluesky",   pattern: /###\s*Blue\s*[Ss]ky/i },
    { key: "twitter",   pattern: /###\s*Twitter/i },
    { key: "tiktok",    pattern: /###\s*TikTok/i },
  ];

  // Split text into platform sections
  const platformSectionRegex = /###\s*(Facebook|Instagram|Threads|Blue\s*[Ss]ky|Twitter[^\n]*|TikTok)/gi;
  const parts = text.split(platformSectionRegex);

  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i].trim();
    const body = parts[i + 1] || "";
    const key = platformNames.find(p => p.pattern.test("### " + name))?.key;
    if (!key) continue;

    // Extract POST and FIRST COMMENT
    const postMatch = body.match(/POST:\s*([\s\S]*?)(?=FIRST COMMENT:|###|##|$)/i);
    const commentMatch = body.match(/FIRST COMMENT:\s*([\s\S]*?)(?=###|##|POST:|$)/i);

    const post = postMatch ? postMatch[1].trim() : "";
    const comment = commentMatch ? commentMatch[1].trim() : "";

    if (post) {
      result.platforms.push({ key, name, post, comment });
    }
  }

  return result;
}

// ── Rendered output component ─────────────────────────────────────────────
function RebuttalOutput({ output, onCopy, onSave, onShare, onEdit, copied, saved }) {
  const [copiedPlatform, setCopiedPlatform] = useState(null);
  const parsed = parseOutput(output);

  const copyPlatformPost = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPlatform(key);
      setTimeout(() => setCopiedPlatform(null), 2000);
    } catch {}
  };

  // If parsing fails or produces no platforms, fall back to raw display
  if (!parsed || parsed.platforms.length === 0) {
    return (
      <>
        <div style={S.outBox}>{output}</div>
        <div style={S.actRow}>
          <button style={btnOutline(copied)} onClick={onCopy}>{copied ? "✓ Copied" : "Copy All"}</button>
          <button style={btnOutline(saved)} onClick={saved ? undefined : onSave}>{saved ? "✓ Saved" : "Save to Library"}</button>
          <button style={btnOutline(false)} onClick={onShare}>Share</button>
          <button style={btnOutline(false)} onClick={onEdit}>Edit &amp; Regenerate</button>
        </div>
      </>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Anchor Phrase */}
      {parsed.anchorPhrase && (
        <div style={{ background: R.borderStrong, color: "#fff", borderRadius: "10px 10px 0 0", padding: "20px 24px", marginBottom: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.65)", marginBottom: 8 }}>Anchor Phrase</div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.3, marginBottom: parsed.anchorExplain ? 10 : 0 }}>"{parsed.anchorPhrase}"</div>
          {parsed.anchorExplain && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>{parsed.anchorExplain}</div>}
        </div>
      )}

      {/* Rebuttal Lenses */}
      {parsed.lenses.length > 0 && (
        <div style={{ background: "#1a1a1a", padding: "20px 24px", marginBottom: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>Rebuttal Lenses</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {parsed.lenses.map((lens, i) => (
              <div key={i}>
                <span style={{ fontWeight: 700, color: "#fff" }}>{lens.title}:</span>{" "}
                <span style={{ color: "rgba(255,255,255,0.82)", lineHeight: 1.6, fontSize: 14 }}>{lens.body}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activist voice label */}
      {parsed.activist && (
        <div style={{ background: "#2a2a2a", padding: "10px 24px", marginBottom: 16, fontSize: 13, color: "rgba(255,255,255,0.7)", fontStyle: "italic" }}>
          Voice: {parsed.activist}
        </div>
      )}

      {/* Platform cards */}
      {parsed.platforms.map(({ key, name, post, comment }) => {
        const meta = PLATFORM_META[key] || { abbr: "?", bg: R.borderStrong, text: "#fff" };
        const isCopied = copiedPlatform === key;
        return (
          <div key={key} style={{ border: `2px solid ${R.border}`, borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
            {/* Platform header */}
            <div style={{ background: meta.bg, padding: "10px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ background: "rgba(255,255,255,0.2)", color: meta.text, fontWeight: 900, fontSize: 12, padding: "3px 8px", borderRadius: 6 }}>{meta.abbr}</span>
              <span style={{ fontWeight: 700, color: meta.text, fontSize: 17 }}>{name}</span>
            </div>
            {/* Post */}
            <div style={{ padding: "16px 18px", borderBottom: `1px solid ${R.border}`, background: R.surface }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: R.textMute, marginBottom: 8 }}>Post</div>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: R.text, margin: 0, whiteSpace: "pre-wrap" }}>{post}</p>
              <button
                onClick={() => copyPlatformPost(key, post)}
                style={{ marginTop: 12, padding: "8px 18px", background: isCopied ? "#333" : R.borderStrong, color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                {isCopied ? "✓ Copied!" : "Copy Post"}
              </button>
            </div>
            {/* First Comment */}
            {comment && (
              <div style={{ padding: "12px 18px", background: R.surfaceAlt }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: R.textMute, marginBottom: 6 }}>First Comment</div>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: R.textMid, margin: 0 }}>{comment}</p>
              </div>
            )}
          </div>
        );
      })}

      {/* Action buttons */}
      <div style={{ ...S.actRow, marginTop: 8 }}>
        <button style={btnOutline(copied)} onClick={onCopy}>{copied ? "✓ Copied All" : "Copy All (Raw)"}</button>
        <button style={btnOutline(saved)} onClick={saved ? undefined : onSave}>{saved ? "✓ Saved" : "Save to Library"}</button>
        <button style={btnOutline(false)} onClick={onShare}>Share</button>
        <button style={btnOutline(false)} onClick={onEdit}>Edit &amp; Regenerate</button>
      </div>
    </div>
  );
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
  const location = useLocation();

  useEffect(() => {
    loadLibrary();
    // Check if Library navigated here with a campaign to load
    if (location.state?.loadCampaign) {
      const c = location.state.loadCampaign;
      setNarrative(c.narrative || "");
      setOutput(c.output || "");
      setTone(c.tone || null);
      setSaved(true);
    }
  }, []);

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
        @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea:focus { border-color: ${R.borderStrong} !important; outline: 4px solid ${R.borderStrong} !important; }
        button:hover { opacity: 0.82; }
        button:disabled { opacity: 1; }
      `}</style>

      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.hLeft}>
          <div style={S.badge}>R</div>
          <h1 style={S.h1}>Rebuttal Generator</h1>
        </div>
        <div style={S.hRight}>
          <a href="/messaging" style={{ ...btnSmall(), textDecoration: "none" }}>← Message Machine</a>
          {library.length > 0 && (
            <button style={btnSmall()} onClick={() => setShowLib(v => !v)}>
              {showLib ? "Hide Library" : `Rebuttal Library (${library.length})`}
            </button>
          )}
          {(output || narrative) && (
            <button style={btnSmall()} onClick={reset}>↩ New</button>
          )}
        </div>
      </header>

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

        {/* Intro */}
        <div style={S.intro}>
          <p style={S.introDesc}>
            Turn a false narrative into a multi-platform rebuttal campaign with an anchor phrase, 3 lenses to focus your advocacy, and ready-to-post content for every social media platform. Start by entering the false narrative (or lie). Click on <strong>Options</strong> to fine tune your request (not required).
          </p>
        </div>

        {/* Narrative input */}
        <label style={S.lbl} htmlFor="narrative-input">False narrative to rebut</label>
        <textarea
          id="narrative-input"
          style={S.textarea}
          placeholder="e.g. Gerrymandering doesn't stop anyone from voting, so it isn't harmful."
          value={narrative}
          onChange={e => setNarrative(e.target.value)}
          disabled={loading}
        />

        {/* Options toggle */}
        {(() => {
          const activeCount = (profile !== null ? 1 : 0) + (tone !== null ? 1 : 0);
          return (
            <button
              style={{ marginTop: "14px", padding: "9px 18px", background: "transparent", color: activeCount > 0 ? R.borderStrong : R.textMute, border: `1.5px solid ${activeCount > 0 ? R.borderStrong : R.border}`, borderRadius: "8px", fontSize: "14px", fontWeight: 700, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", cursor: "pointer", display: "block" }}
              onClick={() => setShowOptions(v => !v)}
            >
              {showOptions ? "− Hide Options" : `+ Options${activeCount > 0 ? ` (${activeCount} active)` : ""}`}
            </button>
          );
        })()}

        {/* ── Optional controls ── */}
        {showOptions && (
          <>
        {/* Single profile picker */}
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
        <p style={S.hint}>{profile ? `Using: ${PROFILES.find(p => p.key === profile)?.label}. Click again to deselect.` : "Skip to let the AI choose a voice suited to this topic."}</p>

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
                style={{ padding: "8px 16px", background: active ? R.borderStrong : "transparent", color: active ? "#fff" : R.text, border: `2px solid ${active ? R.borderStrong : R.border}`, borderRadius: "8px", fontSize: "14px", fontWeight: 700, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", cursor: "pointer" }}
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
          {loading ? "Generating…" : output ? "Generate Again" : "Generate"}
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
            <label style={S.lbl}>Your rebuttal campaign</label>
            <div style={S.disclaimer}>
              <span style={{ fontSize: "20px", flexShrink: 0 }}>⚠️</span>
              <p style={{ fontSize: "14px", color: "#4A4558", lineHeight: 1.6, margin: 0 }}>
                <strong>AI-Generated Content:</strong> This campaign was created by an AI and may contain inaccuracies. Please verify all facts, figures, names, and claims before publishing.
              </p>
            </div>
            <RebuttalOutput
              output={output}
              onCopy={handleCopy}
              onSave={saveToLibrary}
              onShare={handleShare}
              onEdit={editAndRegenerate}
              copied={copied}
              saved={saved}
            />
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
