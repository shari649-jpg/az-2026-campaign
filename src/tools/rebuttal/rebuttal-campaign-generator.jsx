import { useState, useEffect } from "react";
import { saveCampaign, loadAllCampaigns, deleteCampaign } from "../../lib/campaignLibrary";
import { FACTUAL_ACCURACY_GUARDRAIL } from "../../lib/guardrails";
import { AI_TELL_PHRASING_BAN, detectBannedStructures } from "../../lib/messageRules";
import { auth } from "../../firebase";

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

## Contradiction Check
Only include this section at all if the SELF-CONTRADICTION rule below applies to at least one platform's post — omit the entire section if it applies to none. If it applies, list one line per affected platform in this exact format:
[Platform name]: [one specific sentence naming the contradiction between that post's own stated evidence and its own conclusion]

${FACTUAL_ACCURACY_GUARDRAIL}
${AI_TELL_PHRASING_BAN}

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
      BORDER = "var(--border)", MID = "#555", LIGHT = "#888", GREEN = "#2A6A2A",
      TEAL = "var(--teal)", GOLD = "var(--gold)"; // INK/BG/SURFACE/MID/LIGHT/GREEN are this tool's own deliberate newspaper-editorial look, left as-is — only TEAL/GOLD/BORDER are shared brand tokens

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

// Reusable button builders — aligned with Message Machine style
const btnSolid = (disabled) => ({ padding: "12px 28px", background: disabled ? "#999" : INK, color: BG, border: "none", borderRadius: 8, fontSize: "15px", fontWeight: 700, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", cursor: disabled ? "not-allowed" : "pointer", marginTop: "18px" });
const btnOutline = (active) => ({ padding: "9px 18px", background: active ? "#e6f4f0" : "transparent", color: active ? TEAL : INK, border: `2px solid ${active ? TEAL : INK}`, borderRadius: 8, fontSize: "14px", fontWeight: 700, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", cursor: "pointer" });
const btnSmall = () => ({ padding: "7px 16px", background: "transparent", color: MID, border: `1.5px solid ${BORDER}`, borderRadius: 8, fontSize: "13px", fontWeight: 700, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", cursor: "pointer" });
const pill = (active) => ({ padding: "8px 18px", background: active ? TEAL : "transparent", color: active ? "#fff" : INK, border: `2px solid ${active ? TEAL : INK}`, borderRadius: 8, fontSize: "14px", fontWeight: 700, fontFamily: "'Atkinson Hyperlegible', Georgia, serif", cursor: "pointer" });
const profileCard = (checked, disabled) => ({ padding: "9px 11px", border: `2px solid ${checked ? TEAL : BORDER}`, borderRadius: 8, background: checked ? "#e8f5f1" : SURFACE, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, display: "flex", gap: "8px", alignItems: "flex-start" });
const checkBox = (checked) => ({ width: "13px", height: "13px", border: `1.5px solid ${checked ? TEAL : BORDER}`, borderRadius: "3px", background: checked ? TEAL : "transparent", flexShrink: 0, marginTop: "2px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "9px" });

// ── Error messages ────────────────────────────────────────────────────────
const ERROR_MSGS = {
  CONTENT_FLAGGED: { heading: "This topic was flagged before it reached the AI.", body: "Anthropic's API filters certain sensitive phrases — particularly around elections — before they can be processed, even when the intent is to rebut them. Try rephrasing your input as a description of the false claim rather than quoting it directly. For example: \"False narratives are circulating that claim [describe the claim].\" This signals you're building a rebuttal, not spreading misinformation." },
  RATE_LIMITED:    { heading: "Too many requests — please wait a moment.",          body: "The API has received too many requests in a short window. Wait 30–60 seconds and try again." },
  OVERLOADED:      { heading: "The AI is temporarily overloaded.",                  body: "Anthropic's servers are under heavy load. Wait a minute and try generating again." },
  CREDITS_EXHAUSTED: { heading: "🚫 Generation credits used up", body: "Your organization's AI-generation credits are used up. An Administrator can add more from the Admin panel's Orgs tab (\"Grant comp credits\") — no purchase needed for this today." },
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

// ── Output parser ─────────────────────────────────────────────────────────
function parseOutput(text) {
  const result = { anchor: null, anchorWhy: null, lenses: [], activist: null, platforms: {}, contradictions: {} };

  // Anchor phrase
  const anchorMatch = text.match(/##\s*Anchor Phrase\s*\n+([\s\S]*?)(?=\n##|\n###|$)/i);
  if (anchorMatch) {
    const lines = anchorMatch[1].trim().split("\n").filter(l => l.trim());
    result.anchor = lines[0]?.replace(/^\*+|\*+$/g, "").trim();
    result.anchorWhy = lines.slice(1).join(" ").trim() || null;
  }

  // Rebuttal lenses
  const lensesMatch = text.match(/##\s*Rebuttal Lenses\s*\n+([\s\S]*?)(?=\n##|\n###|$)/i);
  if (lensesMatch) {
    const block = lensesMatch[1].trim();
    const lines = block.split("\n").map(l => l.trim()).filter(l => l);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      // Match bold title — possibly with inline description
      const inlineMatch = line.match(/\*\*(.+?)\*\*[:\s—–-]*(.*)/);
      if (inlineMatch) {
        const title = inlineMatch[1].trim();
        let body = inlineMatch[2].trim();
        // If no inline body, check next line for description
        if (!body && i + 1 < lines.length && !lines[i + 1].match(/^\*\*/)) {
          body = lines[i + 1].replace(/^[-–—]\s*/, "").trim();
          i++; // consume the description line
        }
        result.lenses.push({ title, body });
      } else if (line.match(/^[-•]\s+/) || line.match(/^\d+\.\s+/)) {
        // Fallback: bullet or numbered line
        const clean = line.replace(/^[-•\d.]+\s*/, "").replace(/^\*\*|\*\*$/g, "").trim();
        if (clean) result.lenses.push({ title: clean, body: "" });
      }
      i++;
    }
  }

  // Activist label
  const actMatch = text.match(/Activist:\s*(.+)/i);
  if (actMatch) result.activist = actMatch[1].trim();

  // Platforms
  const PLAT_NAMES = ["Facebook", "Instagram", "Threads", "BlueSky", "Twitter/X", "TikTok"];
  PLAT_NAMES.forEach(name => {
    const escaped = name.replace("/", "\\/");
    const platMatch = text.match(new RegExp(`###\\s*${escaped}\\s*\\n+([\\s\\S]*?)(?=\\n###|\\n##|$)`, "i"));
    if (!platMatch) return;
    const block = platMatch[1];
    const postMatch = block.match(/POST:\s*([\s\S]*?)(?=FIRST COMMENT:|$)/i);
    const commentMatch = block.match(/FIRST COMMENT:\s*([\s\S]*?)(?=\n###|\n##|$)/i);
    result.platforms[name] = {
      post: postMatch ? postMatch[1].trim() : "",
      comment: commentMatch ? commentMatch[1].trim() : "",
    };
  });

  // Contradiction Check (Handoff #22 self-contradiction flag) — optional,
  // only present when the model actually noticed one. Never blocking.
  const contraMatch = text.match(/##\s*Contradiction Check\s*\n+([\s\S]*?)(?=\n##|$)/i);
  if (contraMatch) {
    const block = contraMatch[1].trim();
    PLAT_NAMES.forEach(name => {
      const escaped = name.replace("/", "\\/");
      const lineMatch = block.match(new RegExp(`^${escaped}\\s*:\\s*(.+)$`, "im"));
      if (lineMatch) result.contradictions[name] = lineMatch[1].trim();
    });
  }

  return result;
}

// ── Structured output renderer ────────────────────────────────────────────
function CampaignOutput({ output, onCopy, onSave, onPushToMachine, onEdit, copied, saved }) {
  const [copiedPlat, setCopiedPlat] = useState(null);
  const [dismissedContradictions, setDismissedContradictions] = useState({});
  const parsed = parseOutput(output);
  const hasPlatforms = Object.keys(parsed.platforms).length > 0;

  // Reset dismissals whenever the output itself changes (a fresh generation
  // or edit should show any contradiction flags again, not carry over an
  // old dismissal from a previous version of the text).
  useEffect(() => { setDismissedContradictions({}); }, [output]);

  const copyPlat = async (text, key) => {
    await copyText(text);
    setCopiedPlat(key);
    setTimeout(() => setCopiedPlat(null), 2000);
  };

  const PLAT_COLORS = {
    "Facebook": "#0a4fa8", "Instagram": "#7b1a6e", "Threads": "#111111",
    "BlueSky": "#0055bb", "Twitter/X": "#0369a1", "TikTok": "#b91c1c",
  };
  const PLAT_ABBR = {
    "Facebook": "FB", "Instagram": "IG", "Threads": "TH",
    "BlueSky": "BS", "Twitter/X": "X", "TikTok": "TK",
  };

  // If parsing failed, fall back to raw text
  if (!parsed.anchor && !hasPlatforms) {
    return (
      <div style={S.outBox}>{output}</div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Anchor Phrase card */}
      {parsed.anchor && (
        <div style={{ background: INK, color: BG, borderRadius: "4px", padding: "20px 24px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#aaa", marginBottom: "8px" }}>Anchor Phrase</div>
          <div style={{ fontSize: "20px", fontWeight: "700", lineHeight: "1.35", marginBottom: parsed.anchorWhy ? "10px" : 0, fontFamily: "'Georgia',serif" }}>
            "{parsed.anchor}"
          </div>
          {parsed.anchorWhy && (
            <div style={{ fontSize: "13px", color: "#ccc", lineHeight: "1.6", fontStyle: "italic" }}>{parsed.anchorWhy}</div>
          )}
        </div>
      )}

      {/* Rebuttal Lenses */}
      {parsed.lenses.length > 0 && (
        <div style={{ border: `1.5px solid ${BORDER}`, borderRadius: "4px", padding: "18px 22px", background: SURFACE }}>
          <div style={{ fontSize: "10px", letterSpacing: "0.16em", textTransform: "uppercase", color: LIGHT, marginBottom: "14px" }}>Rebuttal Lenses</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {parsed.lenses.map((lens, i) => (
              <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: INK, color: BG, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", flexShrink: 0, marginTop: "1px" }}>{i + 1}</div>
                <div>
                  <span style={{ fontWeight: "700", fontSize: "13px" }}>{lens.title}</span>
                  {lens.body && <span style={{ fontSize: "13px", color: MID }}> — {lens.body}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activist label */}
      {parsed.activist && (
        <div style={{ fontSize: "12px", color: MID, fontStyle: "italic", paddingLeft: "4px" }}>
          Voice: {parsed.activist}
        </div>
      )}

      {/* Platform cards */}
      {hasPlatforms && Object.entries(parsed.platforms).map(([name, { post, comment }]) => {
        const bg = PLAT_COLORS[name] || INK;
        const abbr = PLAT_ABBR[name] || name.slice(0, 2).toUpperCase();
        const fullText = `POST:\n${post}${comment ? `\n\nFIRST COMMENT:\n${comment}` : ""}`;
        const contradictionNote = !dismissedContradictions[name] ? parsed.contradictions[name] : null;
        const phrasingFlags = detectBannedStructures(post);
        return (
          <div key={name} style={{ border: `2px solid ${BORDER}`, borderRadius: "4px", overflow: "hidden" }}>
            {/* Platform header */}
            <div style={{ background: bg, color: "#fff", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "900" }}>{abbr}</div>
              <span style={{ fontWeight: "700", fontSize: "14px", letterSpacing: "0.03em" }}>{name}</span>
              {contradictionNote && (
                <span title="Possible self-contradiction — see below" style={{
                  fontSize: "10px", fontWeight: "800", color: "#8a6215", background: "#fff3d6",
                  border: "1px solid #e0c568", borderRadius: "999px", padding: "2px 8px",
                }}>
                  ⚠️ Check this
                </span>
              )}
              {phrasingFlags.length > 0 && (
                <span title="Possible AI-sounding phrasing — see below" style={{
                  fontSize: "10px", fontWeight: "800", color: "#8a1f3a", background: "#fde8ec",
                  border: "1px solid #eab3c0", borderRadius: "999px", padding: "2px 8px",
                }}>
                  🤖 Sounds AI-ish
                </span>
              )}
              <button
                onClick={() => copyPlat(fullText, name)}
                style={{ marginLeft: "auto", padding: "4px 12px", background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "2px", fontSize: "11px", cursor: "pointer", fontFamily: "'Georgia',serif", letterSpacing: "0.06em", textTransform: "uppercase" }}
              >
                {copiedPlat === name ? "✓ Copied" : "Copy"}
              </button>
            </div>
            {contradictionNote && (
              <div style={{ background: "#fffaf0", border: "none", borderBottom: `1.5px solid #e0c568`, padding: "10px 16px", position: "relative" }}>
                <button
                  onClick={() => setDismissedContradictions(d => ({ ...d, [name]: true }))}
                  aria-label="Dismiss"
                  style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#8a6215", fontWeight: "800" }}
                >
                  ✕
                </button>
                <p style={{ fontSize: "12.5px", color: "#6b4f14", lineHeight: "1.5", margin: 0, paddingRight: "20px" }}>
                  <strong>Possible self-contradiction:</strong> {contradictionNote} Was this intentional?
                </p>
              </div>
            )}
            {phrasingFlags.length > 0 && (
              <div style={{ background: "#fde8ec", border: "none", borderBottom: `1.5px solid #eab3c0`, padding: "10px 16px" }}>
                <p style={{ fontSize: "12.5px", color: "#8a1f3a", lineHeight: "1.5", margin: 0 }}>
                  <strong>Possible AI-sounding phrasing:</strong> matches {phrasingFlags.join(", ")} — worth a manual reword.
                </p>
              </div>
            )}
            {/* Post */}
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}`, background: SURFACE }}>
              <div style={{ fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: LIGHT, marginBottom: "6px" }}>Post</div>
              <p style={{ fontSize: "14px", lineHeight: "1.75", color: INK, whiteSpace: "pre-wrap", margin: 0 }}>{post}</p>
            </div>
            {/* First comment */}
            {comment && (
              <div style={{ padding: "12px 16px", background: "#F7F5F0" }}>
                <div style={{ fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: LIGHT, marginBottom: "6px" }}>First Comment</div>
                <p style={{ fontSize: "13px", lineHeight: "1.65", color: MID, fontStyle: "italic", margin: 0 }}>{comment}</p>
              </div>
            )}
          </div>
        );
      })}

      {/* Action row */}
      <div style={S.actRow}>
        <button style={{ ...btnOutline(false), background: "var(--purple)", borderColor: "var(--purple-dark)", color: "#fff", fontWeight: "700" }} onClick={onPushToMachine}>
          Push to Message Machine →
        </button>
        <button style={btnOutline(copied)} onClick={onCopy}>
          {copied ? "✓ Copied" : "Copy All"}
        </button>
        <button style={btnOutline(saved)} onClick={saved ? undefined : onSave}>
          {saved ? "✓ Saved" : "Save to Library"}
        </button>
        <button style={btnOutline(false)} onClick={onEdit}>Edit &amp; Regenerate</button>
      </div>
    </div>
  );
}

export default function RebuttalGenerator() {
  const [narrative,   setNarrative]   = useState("");
  const [profile,     setProfile]     = useState(null);  // single selected profile key or null
  const [tone,        setTone]        = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [output,      setOutput]      = useState("");
  const [loading,     setLoading]     = useState(false);
  const [status,      setStatus]      = useState("");
  const [error,       setError]       = useState(null);
  const [creditWarning, setCreditWarning] = useState(""); // org generation-credit low-balance warning (Aug 2026)
  const [copied,      setCopied]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [library,     setLibrary]     = useState([]);
  const [showLib,     setShowLib]     = useState(false);
  const [showShare,   setShowShare]   = useState(false); // kept for safety, unused

  // Load library on mount, also check for pushed campaigns
  useEffect(() => {
    loadLibrary();
    try {
      // Check for BS Monitor push first
      const misinfoRaw = localStorage.getItem("rebuttal_push_results");
      if (misinfoRaw) {
        const entry = JSON.parse(misinfoRaw);
        setNarrative(entry.narrative || "");
        localStorage.removeItem("rebuttal_push_results");
        return;
      }
      // Check for library-pushed campaign
      const saved = localStorage.getItem("rebuttal_load_campaign");
      if (saved) {
        const entry = JSON.parse(saved);
        setNarrative(entry.narrative || "");
        setOutput(entry.output || "");
        setTone(entry.tone ?? null);
        setProfile(entry.profile ? (PROFILES.find(p => p.label === entry.profile)?.key ?? null) : null);
        localStorage.removeItem("rebuttal_load_campaign");
      }
    } catch {}
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
    setOutput(""); setStatus(""); setError(null); setCreditWarning("");
    setCopied(false); setSaved(false);
  };

  // ── Generate — two sequential calls to stay under 10s timeout ────────────
  const generate = async () => {
    if (!narrative.trim()) return;
    setLoading(true); setOutput(""); setError(null); setCreditWarning("");
    setCopied(false); setSaved(false);

    const callAPI = async (systemPrompt, userContent, maxTokens) => {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/.netlify/functions/generate-rebuttal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        const raw = (err?.error?.message || "").toLowerCase();
        if (res.status === 402) {
          const e = new Error("CREDITS_EXHAUSTED");
          e.creditMessage = err.message; // real server-provided balance message
          throw e;
        }
        if (raw.includes("string did not match") || raw.includes("pattern") || res.status === 400) throw new Error("CONTENT_FLAGGED");
        if (res.status === 429) throw new Error("RATE_LIMITED");
        if (res.status === 529 || res.status === 503) throw new Error("OVERLOADED");
        throw new Error("GENERIC");
      }
      const data = await res.json();
      if (data.creditWarning) {
        setCreditWarning(data.creditWarning.message);
      }
      return data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    };

    const toneObj = TONES.find(t => t.key === tone) ?? null;
    const systemPrompt = buildPrompt(profile, toneObj);

    try {
      // ── Call 1: Anchor phrase + lenses only ──────────────────────────────
      setStatus("Step 1 of 2 — Building anchor phrase and lenses…");

      const call1User = `False narrative to rebut: "${narrative.trim()}"

Generate ONLY the following two sections — do not write any platform posts yet:

## Anchor Phrase
Derive one short memorable sentence specific to this false narrative as the campaign spine. State it, then in one sentence explain why it works for this claim.

## Rebuttal Lenses
Three lenses with bold titles and one-sentence explanations.

Stop after the Rebuttal Lenses section.`;

      const part1 = await callAPI(systemPrompt, call1User, 500);

      // ── Call 2: Platform posts using part1 as context ────────────────────
      setStatus("Step 2 of 2 — Writing platform posts…");

      const call2User = `False narrative to rebut: "${narrative.trim()}"

The anchor phrase and lenses have already been established:

${part1}

Now write the Activist section with platform-specific posts for all 6 platforms. Follow the output structure exactly as specified — include the Activist label line, then all 6 platforms each with POST: and FIRST COMMENT: paired.`;

      const part2 = await callAPI(systemPrompt, call2User, 1400);

      setOutput(`${part1}\n\n${part2}`);
      setStatus("Campaign ready.");

    } catch (e) {
      if (e.message === "CREDITS_EXHAUSTED" && e.creditMessage) {
        setError({ heading: ERROR_MSGS.CREDITS_EXHAUSTED.heading, body: e.creditMessage });
      } else {
        setError(ERROR_MSGS[e.message] ?? ERROR_MSGS.GENERIC);
      }
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

  // ── Push to Message Machine — loads directly into MM results view ──────────
  const pushToMachine = () => {
    if (!output) return;
    const parsed = parseOutput(output);

    // Map rebuttal platform names to MM platform IDs
    const platMap = {
      "Facebook":   "facebook",
      "Instagram":  "instagram",
      "Threads":    "threads",
      "BlueSky":    "bluesky",
      "Twitter/X":  "twitter",
      "TikTok":     "tiktok",
    };

    // Build messages object: { platformId: "post text" }
    const messages = {};
    Object.entries(parsed.platforms || {}).forEach(([name, data]) => {
      const id = platMap[name];
      if (id && data.post) messages[id] = data.post;
    });

    // Build issue text for Edit Parameters (anchor + lenses)
    const issueText = [
      narrative.trim(),
      parsed.anchor ? `\nAnchor phrase: "${parsed.anchor}"` : "",
      parsed.lenses.length > 0 ? `\nKey angles:\n${parsed.lenses.map((l, i) => `${i + 1}. ${l.title}${l.body ? ` — ${l.body}` : ""}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");

    const payload = { messages, issueText, platforms: Object.keys(messages), pushedAt: new Date().toISOString() };

    try {
      localStorage.setItem("rebuttal_push_results", JSON.stringify(payload));
      window.location.href = "/messaging";
    } catch {
      setError({ heading: "Push failed.", body: "Browser storage is disabled. Your rebuttal content could not be sent. Copy the posts manually using the Copy buttons above." });
    }
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

      {/* ── AI disclaimer ── */}
      <div style={{ margin: "16px 32px 0", background: "rgba(29,92,74,0.08)", border: `2px solid ${TEAL}`, borderRadius: 8, padding: "14px 20px", fontSize: 17, fontWeight: 700, color: TEAL, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>⚠️</span> AI-generated content — always verify facts and claims before publishing.
      </div>

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

        {creditWarning && (
          <div style={{
            background: "#fffaf0", border: "1.5px solid #e0c568", borderRadius: 8,
            padding: "12px 16px", marginTop: "10px", display: "flex",
            justifyContent: "space-between", alignItems: "center", gap: "12px",
          }}>
            <span style={{ fontSize: "14px", color: INK }}>⚠️ {creditWarning}</span>
            <button
              onClick={() => setCreditWarning("")}
              aria-label="Dismiss"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: INK, fontWeight: 900, fontFamily: "inherit", flexShrink: 0 }}
            >✕</button>
          </div>
        )}

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
            <CampaignOutput
              output={output}
              onCopy={handleCopy}
              onSave={saveToLibrary}
              onPushToMachine={pushToMachine}
              onEdit={editAndRegenerate}
              copied={copied}
              saved={saved}
            />
          </>
        )}
      </main>
    </div>
  );
}
