import { useState, useEffect, useRef } from "react";
import { saveCampaign as fbSave, loadAllCampaigns, deleteCampaign as fbDelete } from "../../lib/campaignLibrary";
import { FACTUAL_ACCURACY_GUARDRAIL } from "../../lib/guardrails";
import {
  AI_TELL_PHRASING_BAN, detectBannedStructures,
  HASHTAG_BODY_BAN, JSON_ONLY_INSTRUCTION, JSON_ESCAPING_INSTRUCTION,
} from "../../lib/messageRules";
import {
  loadAllStorms, loadPosts as loadStormPosts, createPost as createStormPost,
  MEDIA_TYPES as STORM_MEDIA_TYPES, STORM_STATUS, PUSH_TO_STORM_KEY,
} from "../../lib/stormLibrary";
import { useAuth } from "../../context/AuthContext";
import { auth, db } from "../../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import HelpTooltip from "../../components/common/HelpTooltip";
import { HELP } from "../../lib/helpContent";

const PLATFORMS = [
  { id: "facebook", name: "Facebook", abbr: "FB", maxChars: 63206, bg: "#0a4fa8", text: "#fff" },
  { id: "instagram", name: "Instagram", abbr: "IG", maxChars: 2200, bg: "#7b1a6e", text: "#fff" },
  { id: "threads", name: "Threads", abbr: "TH", maxChars: 500, bg: "#111111", text: "#fff" },
  { id: "bluesky", name: "BlueSky", abbr: "BS", maxChars: 300, bg: "#0055bb", text: "#fff" },
  { id: "twitter", name: "Twitter / X", abbr: "X", maxChars: 280, bg: "#0369a1", text: "#fff" },
  { id: "tiktok", name: "TikTok", abbr: "TK", maxChars: 2200, bg: "#b91c1c", text: "#fff" },
];

// Platform-call consolidation (Aug 2026, TODO #8) — generateAll now sends
// ONE combined call for every selected platform instead of splitting into
// PLATFORM_GROUP_A/B/C (removed). That splitting existed specifically to
// keep each call's output small enough to stay fast under the old 26-
// second synchronous Netlify timeout; now that generateAll runs through
// Background Functions (no more 26s ceiling, real per-group work already
// proven safe running concurrently), the tradeoff flips: one combined call
// pays the ~7,000-char guardrail/platform-voice overhead once instead of
// up to 3 times, which is the actual per-generation cost problem measured
// in Handoff #36. Known, accepted tradeoff (same one already named in the
// TODO item that scoped this): a single larger call is somewhat slower
// end-to-end than the fastest of 3 parallel smaller ones, and a bad
// response now affects the whole generation rather than one platform pair
// — acceptable since Background Functions removed the timeout risk that
// made the old design necessary, and a failed generation is fully visible
// and retryable, not a silent partial gap.

// Shared platform-voice guidance for Neutral + AZ modes (identical in both).
// Each platform gets a real baseline persona — who's talking, to whom — not
// just formatting rules. The priority-rule paragraph up top ensures Tone/Style/
// Voice settings modulate that persona rather than flattening it (e.g. a
// "Professional" tone should still read sharper on Twitter/X than on Facebook).
const PLATFORM_VOICE_GUIDE = `PLATFORM VOICE — each platform below has its own fixed baseline personality; the Tone, Style, and Voice/Persona settings specified for this post modulate HOW that personality delivers the message, they never flatten or replace it. A "Professional" tone on Twitter/X should still read sharper and more clipped than the same "Professional" tone on Facebook; a "Sarcastic" tone on Facebook should still read warmer and more explanatory than the same "Sarcastic" tone on Twitter/X.

- Facebook: Older-skewing, community- and family-oriented readers. Warm, explanatory register — take the time to walk through context, like a longtime neighbor at a town meeting. Detailed storytelling, clear call to action, 2–5 paragraphs.
- Instagram: Younger-adult, millennial-leaning readers. Visual, punchy, values-driven — write like a real feed post, not a press release. Emotional hook at start.
- Threads: Conversational middle ground between Instagram and Twitter/X — casual, in-the-moment, like joining a conversation already happening. 2–4 sentences.
- BlueSky: Policy-literate, community-minded readers who reward nuance and depth over punchlines. Thoughtful and substantive. Strict 300-char limit.
- Twitter/X: Baseline snark and wit — sharp, a little irreverent, even when the underlying topic is serious. This is Twitter's inherent voice and should come through regardless of tone. Punchy headline style, max 280 chars.
- TikTok: Gen Z-adjacent, informal, "smart friend" energy. Trendy hook in first line, energetic language.`;

// National mode's platform-voice guidance — same persona layer, laid over the
// National Messaging Style Guide's own per-platform structural notes.
const PLATFORM_VOICE_GUIDE_NATIONAL = `PLATFORM VOICE — each platform below has its own fixed baseline personality on top of the National Style Guide above; the Tone, Style, and Voice/Persona settings modulate HOW that personality delivers the message, they never flatten or replace it. A "Professional" tone on Twitter/X should still read sharper and more clipped than the same "Professional" tone on Facebook; the same tone on Facebook should still read warmer and more explanatory than on Twitter/X.

- Facebook: Older-skewing, community- and family-oriented readers. Richardson letter format — full story with history and context, 3–4 paragraphs, start with the cost a real person is paying, end with one specific action.
- Instagram/Threads: Younger-adult, millennial-leaning readers. Lead with the most visceral, concrete version of the cost. Make the first sentence hit. Keep it human and visual.
- BlueSky: Policy-literate, community-minded readers who reward nuance and depth. Thoughtful and substantive. Strict 300-char limit.
- Twitter/X: Baseline snark and wit — sharp, a little irreverent, even on serious topics. One devastating specific fact. Or one contrast. Or one direct question. Never vague. Max 280 chars.
- TikTok: Gen Z-adjacent, informal, "smart friend" energy. Open with the hook nobody expects a politician to say out loud. Authenticity and mild irreverence. The "wait, really?" moment.`;

// Fixed generous max_tokens for every generateAll call. Deliberately NOT a
// formula scaled to input size (an earlier version of this file had one) —
// Anthropic bills by tokens actually generated, not by max_tokens reserved,
// so there's no cost to setting this high. A calculated "just enough"
// ceiling only recreates the truncation bug at a slightly larger input size;
// a flat, generous number removes that failure mode instead of narrowing it.
//
// RAISED (Aug 2026, platform-call consolidation, TODO #8): this used to
// cover at most 2 platforms per call (PLATFORM_GROUPS); one combined call
// now has to produce up to all 6 at once. Matches
// generate-message-background.mjs's own MAX_TOKENS_CEILING exactly, so
// this can't get silently clamped smaller than what's actually requested.
const GENERATION_MAX_TOKENS = 8000;

const AUDIENCES = ["Democrat","Independent","Persuadable Republican","Disillusioned Voter","Brand New Voter"];

// Style (Aug 2026 messaging-modifier revision): collapsed from 4 options to
// 3 — "Contrast with Opponent" is gone, absorbed into "Strong Contrast".
// Each non-neutral style now carries a real instructional block (see
// STYLE_DEFINITIONS below) instead of just a label with nothing behind it —
// previously "Style: Contrast with Opponent" reached Claude as a bare
// string with zero definition, same root gap the Tone Modifiers had.
const STYLES = [
  { id: "neutral", label: "Neutral" },
  { id: "pro_democrat", label: "Pro Democrat" },
  { id: "strong_contrast", label: "Strong Contrast" },
];

// Real instructional text per style, injected into the prompt alongside the
// bare label. Neutral intentionally has no entry — no additional
// instruction beyond the label, matching prior (lack of) behavior.
const STYLE_DEFINITIONS = {
  pro_democrat: `PRO DEMOCRAT STYLE: Focus this post on what we stand for and the specific, concrete benefits to people — economic gains, quality of life, stronger families, better education building a stronger society and economy. Lead with what's offered, not what's opposed.`,
  strong_contrast: `STRONG CONTRAST STYLE: Create a strong, direct contrast with opposing candidates, parties, or policies using specific, verifiable records, votes, public statements, and policy consequences. State what we support, what they support or have done, and how the difference affects people. Use assertive language. This must comply fully with the FACTUAL ACCURACY guardrail above — do not invent facts, misrepresent positions, speculate about motives, demean individuals, or target protected characteristics. Where a claim is uncertain, flag it for verification rather than presenting it as fact.`,
};

// Tone Modifiers (Aug 2026 messaging-modifier revision): previously these 11
// labels reached Claude as bare words with NO instructional text behind any
// of them anywhere in this file — that absence is why modifiers were
// inconsistent and why Casual/Friendly read as nearly identical. Casual and
// Friendly are now merged into one option, "Friendly", combining both
// definitions. Every modifier below now carries a real, concrete
// instruction — most with a specific required mechanical marker (a rhetorical
// question, clipped fragments, etc.) so the model has something to actually
// execute, not just a vibe to approximate.
const MODIFIERS = ["Friendly","Witty","Sarcastic","Empathetic","Professional","Excited","Funny","Dramatic","Disgusted","Angry"];

const TONE_MODIFIER_DEFINITIONS = {
  Friendly: "Contractions required. Conversational connectors (\"look,\" \"here's the thing,\" \"so\"). Shorter paragraphs. Warmer address terms and softer transitions. Vary sentence length — don't let every sentence run the same length or rhythm.",
  Sarcastic: "Must include one instance of irony, exaggeration, or mock-sincerity (e.g., stating the opposite of what's meant, or restating an official's justification in a way that exposes its absurdity). Include at least one rhetorical question mocking the framing.",
  Angry: "Shorter, clipped sentences. Fragments allowed. Direct address. No hedging language (\"might,\" \"could,\" \"seems\").",
  Disgusted: "Visceral or contemptuous language. Physical/sensory metaphors acceptable. Shorter sentences than Friendly.",
  Witty: "Requires wordplay, an unexpected comparison, or a punchline structure in at least one sentence. Should not read as purely declarative.",
  Empathetic: "Recognizes people's concerns and emotions, uses compassionate language, and focuses on shared experiences and support.",
  Professional: "Clear, polished, factual, and respectful; avoids slang, exaggeration, and overly casual phrasing.",
  Excited: "Energetic, optimistic, and action-oriented; uses vivid language and momentum to make an opportunity or achievement feel urgent and motivating.",
  Funny: "Light, witty, and approachable; may use playful phrasing or gentle humor without mocking people or minimizing serious issues.",
  Dramatic: "High-stakes, emotionally resonant, and urgent; emphasizes consequences, conflict, and the importance of the moment without overstating facts.",
};
const VOICE_PRESETS = [
  {
    id: "mom_blog",
    label: "Mom Blog",
    text: "Mom Blog voice: relatable, conversational — like chatting with a friend. Emphasize authenticity and emotional connection over formal tone. Use personal anecdotes; make complex topics feel approachable and fun. Be honest and comfortable with vulnerability — real-life struggles, from parenting mishaps to career hurdles, without sugarcoating. Validate the reader's own experience. Lean into life tips and reflective, inspirational moments — life lessons, humor, and motivation around wellness, relationships, and self-growth — written as engaging narratives that spark comments and shares."
  },
  {
    id: "bro_code",
    label: "Bro Code",
    text: "Bro Code voice: casual — advice from a trusted buddy, not a lecture. Blend humor, practicality, and motivation. Sarcasm and self-deprecation are fine; stay authentic, never preachy. Motivational but grounded — \"level up your game\" energy, no corporate polish. Short sentences and short paragraphs, contractions throughout. Structure: hook with a one-line pain point or question, deliver value fast (a list or how-to), close with a clear call to action."
  },
];

// Rural Arizona Style (Aug 2026 messaging-modifier revision) — REPLACES the
// former County Voice system entirely (the 15 individual county profiles +
// Rural Multi-County sentinel/voice are gone). This is now a single,
// unified style, available as one toggle any time AZ Coalition mode is
// selected — not gated to specific counties or a dropdown. If the input
// names a specific place, the model is instructed to ground any additional
// place references within that same area rather than pulling in landmarks
// from elsewhere in Arizona (see the instruction folded into the block
// itself, below). The bilingual-integration instruction some of the old
// county profiles carried (e.g. Cochise, Santa Cruz, Yuma) was deliberately
// NOT carried forward into this unified version — dropped on purpose, not
// an oversight.
//
// Layered ON TOP of Voice/Persona, not a replacement for it — Rural AZ
// Style is about place/local stakes, persona (Mom Blog, Bro Code, etc.) is
// about who's speaking. Same relationship the old County Voice layer had.
const RURAL_AZ_STYLE = `RURAL ARIZONA STYLE:
Core Positioning: Rural Arizona neighbors fighting for our water, jobs, families, and fair votes—from small towns to tribal lands. We live your realities, show up consistently, fix what [name villain] (corporations, DC politicians, billionaires, etc.) break, instead talk about small business, local leaders, communities. Speak as a lifelong rural neighbor (40-65)—blunt, warm, no jargon, like coffee chats at the county fair or VFW.

Key traits: neighborly ("we/our" over "I/you"), practical (solutions before complaints), proud/humble (honoring hard work, faith, land without flash). Emotional promise: "We see your struggles because we live them too. Let's fix this together." Target Democrats, left-leaning Independents, and democracy-minded Republicans craving stability over DC drama.

Tone & Execution Rules: Use short sentences, plain words ("jobs/water/schools/SS checks"), active voice—warm but direct: "Phoenix water cuts hit our farms hard. Here's the fix." Practice hopeful realism: name problems (drought/childcare deserts), end with steps ("Join a community group," "attend a local meeting of your school board or city council," etc). Bridge-build with "neighbors/families/retirees/workers/tribes" over "Democrats"; invite indies/soft GOP. Start every post with local stakes ("When Phoenix cuts water, [County] farms/lake/seniors feel it first"), weave in place names (Kingman VFW, Navajo Nation, Payson trails), dominate "we/our" ("Our kids need childcare").

If the input names a specific place or county, ground any additional place references — landmarks, towns, local institutions — within that same county or region. Do not introduce place names from elsewhere in Arizona.

Never mock conservatives/guns/faith (shared rural culture), never use coastal jargon ("defund/Latinx"), never go party-first—instead lead with shared values. Always respect regional culture: Diné nods north, mining grit east, military Cochise, retirees west. Never use "out here" or any derivative.`;

// National frames defined above; SPEAKER_PERSPECTIVES defined above

// Layer 2 national frames — available in both AZ and National mode
const NATIONAL_FRAMES = [
  {
    id: "anti_corruption",
    label: "Anti-Corruption",
    desc: "Donor influence, rate hikes, stock trades, slush funds",
    prompt: "Emphasize the money trail: who gave, who got, what it cost regular people. Connect every corrupt act to a specific cost someone is paying today. If the input names a specific villain (a person, an official, a party), use that name directly. If it does not, name the mechanism instead — the donor class, the politicians who take corporate money then do their bidding — without inventing a specific name that isn't in the input.",
  },
  {
    id: "economic_populism",
    label: "Economic Populism",
    desc: "Costs, wages, prices, housing, healthcare",
    prompt: "Emphasize record profits vs. real costs; the rigged economy vs. hard work. Lead with a specific dollar amount, price increase, or wage gap. Connect the economic pain to specific policy choices that protected it.",
  },
  {
    id: "democracy_results",
    label: "Democracy & Results",
    desc: "Voting rights, oversight, agencies, courts",
    prompt: "Emphasize: democracy gives you leverage over the people rigging the system — that's why they want to destroy it. Corruption and democracy are the same story. Don't defend institutions for their own sake; argue that a functioning democracy is what gives people power over those dismantling it.",
  },
  {
    id: "competence_contrast",
    label: "Competence Contrast",
    desc: "Gridlock, chaos, failed promises",
    prompt: "Use the Shapiro model: builders vs. chaos-makers, results vs. performance. If the input names a specific opponent or party, use that name directly. If it does not, talk about the chaos, the corruption, the cost without inventing a name — let the audience make the connection. Forward-looking, not nostalgic.",
  },
];

const SPEAKER_PERSPECTIVES = [
  { id: "first",  label: 'First person ("I" / "We")',       desc: "Speaking as the coalition or candidate" },
  { id: "second", label: 'Second person ("You")',            desc: "Speaking directly to the reader" },
  { id: "third",  label: 'Third person ("They" / "Arizonans")', desc: "Talking about people or events" },
];

// Defaults used when optional fields are left blank
const DEFAULT_AUDIENCE = "general moderate voter who is not very engaged in politics";
const DEFAULT_STYLE    = "neutral";

// Human-readable generation params captured at Push-to-Storm time (Handoff
// #22, option A) so a Storm post pushed from here can show what settings
// produced it. Only meaningful fields are included — Storms' own native
// Generate/Rephrase has no equivalent concept, so a post created directly
// in Storms simply has none of this and shows nothing.
function modeLabel(mode) {
  return mode === "az" ? "Arizona" : mode === "national" ? "National" : "Neutral";
}

const T = {
  pageBg:   "var(--bg)",
  surface:  "var(--bg)",
  surfaceAlt:"var(--surface-alt)",
  border:   "var(--border-strong)",
  borderStrong: "var(--charcoal-dark)",
  text:     "var(--text)",
  textMid:  "var(--text-mid)",
  textMute: "var(--text-mute)",
  teal:     "var(--teal)",
  tealDark: "var(--teal-mid)",
  gold:     "var(--gold)",
  goldDark: "var(--gold-dark)",
  turquoise:"var(--turquoise)",
  terracotta:"var(--terracotta)",
  charcoal: "var(--charcoal)",
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
function DesertLoader({ statusMsg }) {
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
      background: "linear-gradient(160deg, var(--teal) 0%, #0f3329 50%, #2a1a08 100%)",
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
      {statusMsg && (
        <div style={{ fontFamily:"'Atkinson Hyperlegible', Georgia, serif", fontSize:13, color:"rgba(255,255,255,0.65)", textAlign:"center", maxWidth: 320, marginTop: 10, textTransform: "none", letterSpacing: "normal" }}>
          {statusMsg}
        </div>
      )}
    </div>
  );
}

/* ── Platform Message Card ── */
function PlatformCard({ platform: p, message, onUpdate, onCopy, onRegen, loading, contradictionNote, onDismissContradiction }) {
  const [localOpt, setLocalOpt] = useState("");
  const [expanded, setExpanded] = useState(false);
  const charCount = (message || "").length;
  const over = charCount > p.maxChars;
  const phrasingFlags = detectBannedStructures(message || "");

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
        {contradictionNote && (
          <span title="Possible self-contradiction — expand to review" style={{
            fontSize: 10.5, fontWeight: 800, color: "#8a6215", background: "#fff3d6",
            border: "1px solid #e0c568", borderRadius: 999, padding: "2px 8px",
          }}>
            ⚠️ Check this
          </span>
        )}
        {phrasingFlags.length > 0 && (
          <span title="Possible AI-sounding phrasing — expand to review" style={{
            fontSize: 10.5, fontWeight: 800, color: "#8a1f3a", background: "#fde8ec",
            border: "1px solid #eab3c0", borderRadius: 999, padding: "2px 8px",
          }}>
            🤖 Sounds AI-ish
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: over ? '#fca5a5' : 'rgba(255,255,255,0.7)', marginRight: 10 }}>
          {charCount.toLocaleString()} / {p.maxChars.toLocaleString()}
        </span>
        <span style={{ fontSize: 16, opacity: 0.85, flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={{ padding: 24 }}>
          {contradictionNote && (
            <div style={{ background: "#fffaf0", border: "2px solid #e0c568", borderRadius: 10, padding: "12px 16px", marginBottom: 16, position: "relative" }}>
              <button onClick={onDismissContradiction} aria-label="Dismiss" style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#8a6215", fontWeight: 900 }}>✕</button>
              <p style={{ fontSize: 14, fontWeight: 800, color: "#8a6215", marginBottom: 4 }}>⚠️ Possible self-contradiction</p>
              <p style={{ fontSize: 13.5, color: "#6b4f14", lineHeight: 1.5, paddingRight: 20 }}>{contradictionNote} Was this intentional?</p>
            </div>
          )}
          {phrasingFlags.length > 0 && (
            <div style={{ background: "#fde8ec", border: "2px solid #eab3c0", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "#8a1f3a", marginBottom: 4 }}>🤖 Possible AI-sounding phrasing</p>
              <p style={{ fontSize: 13.5, color: "#7a1a33", lineHeight: 1.5 }}>Matches {phrasingFlags.join(", ")} — worth a manual reword before this goes out.</p>
            </div>
          )}
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
            <HelpTooltip text={HELP.messageMachine.copy} label={`Help: Copy ${p.name} text`} />
            <button style={{ ...S.btnDark, opacity: loading ? 0.5 : 1 }} disabled={loading} onClick={() => handleQuick("shorten")} title="Regenerate a shorter version">Shorten</button>
            <button style={{ ...S.btnDark, opacity: loading ? 0.5 : 1 }} disabled={loading} onClick={() => handleQuick("expand")} title="Regenerate a more detailed version">Expand</button>
            <button style={{ ...S.btnDark, opacity: loading ? 0.5 : 1 }} disabled={loading} onClick={() => onRegen(p.id, "", message)} title="Rephrase this message">Rephrase</button>
            <HelpTooltip text={HELP.messageMachine.refine} label={`Help: Expand, Shorten & Rephrase for ${p.name}`} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main App ── */
export default function App() {
  const { role } = useAuth();
  const canPushToStorm = role === "administrator" || role === "manager";
  const [view, setView]             = useState("form");
  const [msgMode, setMsgMode]       = useState("");   // "" (neutral, default) | "az" | "national"
  const [msgFrame, setMsgFrame]     = useState("");      // NATIONAL_FRAMES id or ""
  const [formData, setFormData]     = useState({ issue:"", focalPoint:"", audience:"", voice:"", ruralStyle:false, style:"", modifier:"", perspective:"", platforms:[] });
  const [fromResearch, setFromResearch] = useState(false);
  // NOTE (Aug 2026 messaging-modifier revision): the old countySuggestion
  // state — which surfaced an "Apply <County> voice" pill when Research/
  // RaceComparison pushed a detected county — was removed along with
  // COUNTY_VOICES. There's no longer a per-county voice to suggest;
  // Rural AZ Style (below) is a single manual toggle, not county-detected.
  // RaceComparison.jsx and DistrictProfiles.jsx still push a `county` field
  // in their payload (see rr_pending_article below) — it's simply no longer
  // read here. Left as a flagged, deliberate decision, not fixed elsewhere
  // in this pass; those two files were out of scope for this session.
  const [proModeOpen, setProModeOpen] = useState(false); // Pro Mode panel — collapsed by default
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
  const [pushModal, setPushModal]   = useState(false);
  const [pushStorms, setPushStorms] = useState([]);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError]   = useState("");
  const [notif, setNotif]           = useState(null);
  const [genError, setGenError]     = useState(null); // persistent error panel for generation failures
  const [creditsExhaustedMsg, setCreditsExhaustedMsg] = useState(""); // real server message for genError === "credits"
  // Background Functions rearchitecture (Aug 2026, TODO #7) — generateAll's
  // loader is no longer a fixed "wait for one fetch" spinner; it reflects
  // a real Firestore listener on a generationJobs/{jobId} doc that a
  // Background Function updates whenever it actually finishes (up to 15
  // minutes, not bounded by the old 26-second synchronous ceiling that was
  // hit in production on large research-block inputs). This message is
  // what's shown while that listener is still waiting.
  const [genStatusMsg, setGenStatusMsg] = useState("");
  // Cleanup handles for the current generateAll job — a Firestore listener
  // unsubscribe function and a safety-timeout id. Held in a ref (not
  // state) since they're plumbing, not render inputs; cleared and
  // replaced on every new generateAll call, and torn down on unmount so a
  // component that's gone doesn't keep calling setState from a stale
  // listener.
  const activeJobRef = useRef({ unsub: null, timeoutId: null });
  useEffect(() => () => {
    if (activeJobRef.current.unsub) activeJobRef.current.unsub();
    if (activeJobRef.current.timeoutId) clearTimeout(activeJobRef.current.timeoutId);
  }, []);
  const [contradictionFlags, setContradictionFlags] = useState({}); // { [platformId]: "explanation" } — self-contradictions the model noticed (Handoff #22), never blocking, just surfaced for a human to decide
  const [hashtags, setHashtags]     = useState(null);
  const [hashLoading, setHashLoading] = useState(false);

  // ── URL-aware ingestion (Handoff #16 punch list) ──
  // Lets someone paste a news URL directly into Message Machine instead of
  // detouring through Rapid Response and pushing back over. Reuses Rapid
  // Response's own fetch_and_analyze action on the shared rapid-response.mjs
  // Netlify function — same scrape + SSRF guard + analysis pipeline, same
  // per-user daily AI-call limit, zero new retrieval code.
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput]       = useState("");
  const [urlFetching, setUrlFetching] = useState(false);
  const [urlError, setUrlError]       = useState("");

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
        try { localStorage.removeItem(MM_DRAFT_KEY); } catch {}
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
        // p.county (pushed by RaceComparison.jsx / DistrictProfiles.jsx) is
        // deliberately not read here anymore — see the note above
        // formData's ruralStyle field. No per-county suggestion exists now.
        localStorage.removeItem("rr_pending_article");
        try { localStorage.removeItem(MM_DRAFT_KEY); } catch {}
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
        try { localStorage.removeItem(MM_DRAFT_KEY); } catch {}
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

  // buildPromptParts (Aug 2026, prompt caching) — returns { staticSystem,
  // dynamicPrompt } instead of one flat string. staticSystem is every block
  // that's byte-identical across every call in this mode regardless of
  // Issue/Content, Audience, Voice, Style, Tone, Frame, or County —
  // structured so it can be sent as its own cache_control-tagged block by
  // generate-message-background.mjs. dynamicPrompt is everything that
  // varies per call. See the guardrail/platform-voice-guide constants
  // above for the "settings specified for this post" wording fix this
  // reorder required — that fix is what makes moving Tone/Style/Voice
  // AFTER PLATFORM_VOICE_GUIDE actually safe, not just a reorder for its
  // own sake.
  //
  // Single source of truth for prompt CONTENT: buildPrompt() below is a
  // thin wrapper that just concatenates these two pieces back into one
  // string, for the one caller that still needs a flat string
  // (regenPlatform's fallback path, which goes through the original
  // synchronous generate-message.mjs — deliberately NOT extended to
  // caching in this pass, same "generateAll only" scoping Background
  // Functions and consolidation both used). generateAll uses
  // buildPromptParts() directly.
  const buildPromptParts = (platforms) => {
    const plats = PLATFORMS.filter(p=>platforms.includes(p.id)).map(p=>`${p.name} (max ${p.maxChars} chars)`).join(", ");
    const audienceLabel = formData.audience || DEFAULT_AUDIENCE;
    const styleObj = STYLES.find(s=>s.id===(formData.style||DEFAULT_STYLE));
    const styleLabel = styleObj ? styleObj.label : "Neutral";
    // Style definitions (Aug 2026 messaging-modifier revision) — see
    // STYLE_DEFINITIONS above. Neutral has no entry, so styleDefBlock is ""
    // and behavior is unchanged from before this revision for that case.
    const styleDef = STYLE_DEFINITIONS[formData.style] || "";
    const styleDefBlock = styleDef ? `${styleDef}\n` : "";
    // Tone Modifier definitions (Aug 2026 messaging-modifier revision) —
    // previously this was just "Tone: <label>" with no instructional text
    // behind the label at all. See TONE_MODIFIER_DEFINITIONS above.
    const modifierDef = formData.modifier ? TONE_MODIFIER_DEFINITIONS[formData.modifier] : "";
    const modifierLine = formData.modifier ? `Tone: ${formData.modifier} — ${modifierDef}` : "";

    const perspObj = SPEAKER_PERSPECTIVES.find(p => p.id === formData.perspective);
    const perspLine = perspObj ? `Grammatical person: ${perspObj.label} — ${perspObj.desc}` : "";

    // Rural AZ Style (Aug 2026 messaging-modifier revision) — REPLACES the
    // old per-county COUNTY_VOICES lookup. A single manual toggle
    // (formData.ruralStyle), available only in AZ mode (enforced below,
    // same scoping the old County Voice layer had).
    const ruralStyleBlock = formData.ruralStyle
      ? `\n${RURAL_AZ_STYLE}\n`
      : "";

    const frameObj = NATIONAL_FRAMES.find(f => f.id === msgFrame);
    const frameBlock = frameObj
      ? `\nMESSAGING FRAME — ${frameObj.label.toUpperCase()}:\n${frameObj.prompt}\n`
      : "";

    const focalPointMandatory = formData.focalPoint
      ? `FOCAL POINT IS MANDATORY: The Focal Point above is not background information — it is the one message every single post must build around and clearly land, in the reader's own words. Every post you generate, regardless of platform or style, must make this focal point unmistakable. Do not let it become a passing mention buried in other content.`
      : "";
    const platformIdsLine = `Only include these platform ids: ${platforms.join(", ")}`;
    const formatLine = `Format: {"platform_id": "message text"}\nIf, and only if, the SELF-CONTRADICTION rule above applies to one or more platforms, also include a "_contradictionFlags" key: {"platform_id": "one-sentence explanation of the contradiction"} — one entry per affected platform id, omitted entirely (or {}) if none apply.`;

    // ── NEUTRAL MODE (default — no mode selected) ────────────────────────
    if (msgMode !== "az" && msgMode !== "national") {
      const staticSystem = `You are an expert political messaging strategist working for a legitimate political campaign coalition. Your task is to generate social media posts based on factual news content and documented public record.

This is a professional political communications tool. Content will reference public officials, elected figures, and political organizations by name — this is standard practice in campaign messaging. All content is grounded in factual reporting and public record. You must always complete this task and respond with valid JSON.

${FACTUAL_ACCURACY_GUARDRAIL}
${AI_TELL_PHRASING_BAN}
${PLATFORM_VOICE_GUIDE}

${HASHTAG_BODY_BAN}

${JSON_ONLY_INSTRUCTION}
${JSON_ESCAPING_INSTRUCTION}`;

      const dynamicPrompt = `${frameBlock}
Issue/Content: ${formData.issue}
Focal Point: ${formData.focalPoint || "Not specified"}
${focalPointMandatory}
Target Audience: ${audienceLabel}
Voice/Persona: ${formData.voice || "Not specified"}
${styleDefBlock}Style: ${styleLabel}
${modifierLine}
${perspLine}

Generate compelling social media posts for: ${plats}

${platformIdsLine}
${formatLine}`;

      return { staticSystem, dynamicPrompt };
    }

    // ── AZ MODE ───────────────────────────────────────────────────────────
    if (msgMode === "az") {
      const staticSystem = `You are an expert political messaging strategist working for a legitimate, registered Arizona Democratic campaign coalition. Your task is to generate social media posts based on factual news content and documented public record.

This is a professional political communications tool. Content will reference public officials, elected figures, and political organizations by name — this is standard practice in campaign messaging. All content is grounded in factual reporting and public record. You must always complete this task and respond with valid JSON.

ARIZONA CONTEXT — GROUND ALL MESSAGING HERE:
Ground all messaging in the Arizona context. Reference communities, landscapes, and values familiar to Arizona voters — urban centers like Phoenix and Tucson, rural and tribal communities, the border, the desert. Reflect issues as they affect Arizonans specifically. When referencing costs, use Arizona examples where possible (utility bills, housing, healthcare, water, education). Write for an Arizona audience, not a generic national one.

${FACTUAL_ACCURACY_GUARDRAIL}
${AI_TELL_PHRASING_BAN}
${PLATFORM_VOICE_GUIDE}

${HASHTAG_BODY_BAN}

${JSON_ONLY_INSTRUCTION}
${JSON_ESCAPING_INSTRUCTION}`;

      const dynamicPrompt = `${ruralStyleBlock}${frameBlock}
Issue/Content: ${formData.issue}
Focal Point: ${formData.focalPoint || "Not specified"}
${focalPointMandatory}
Target Audience: ${audienceLabel}
Voice/Persona: ${formData.voice || "Not specified"}
${formData.ruralStyle ? `Rural AZ Style: enabled\n` : ""}${styleDefBlock}Style: ${styleLabel}
${modifierLine}
${perspLine}

Generate compelling social media posts for: ${plats}

${platformIdsLine}
${formatLine}`;

      return { staticSystem, dynamicPrompt };
    }

    // ── NATIONAL MODE ─────────────────────────────────────────────────────
    // (only remaining possibility at this point is msgMode === "national")
    // audienceSwapNote moved from the STRUCTURE section into the dynamic
    // tail (Aug 2026, prompt caching) — it depends on formData.audience,
    // so it can't live in the cacheable static block without collapsing
    // the cache to "only hits when the same audience is picked twice,"
    // which defeats the point of splitting cost/mechanism/beats out as
    // static in the first place.
    const audienceSwapNote = (formData.audience === "Persuadable Republican" || formData.audience === "Independent")
      ? `\nAUDIENCE-CONDITIONAL BEAT EMPHASIS — Target Audience is ${formData.audience}: this audience tends to respond better to values-first framing, so you may give Beat 3's freedom/rights language MORE emphasis and weight relative to Beat 1's cost. This is an emphasis shift only, not a reorder: Beat 1 still opens the post with a concrete cost, and Beat 3's freedom language still must stay anchored to that same cost — don't drop Beat 1 or move Beat 3 ahead of it, just give Beat 3 more space and stronger language.\n`
      : "";

    const staticSystem = `You are an expert political messaging strategist working for a legitimate progressive campaign coalition. Your task is to generate social media posts based on factual news content and documented public record.

This is a professional political communications tool. Content will reference public officials, elected figures, and political organizations by name — this is standard practice in campaign messaging. All content is grounded in factual reporting and public record. You must always complete this task and respond with valid JSON.

NATIONAL MESSAGING STYLE — APPLY TO ALL OUTPUT:

VOICE — Write like a trusted neighbor at a kitchen table, not a press release. Short sentences. Plain words. Active voice. Present tense. "Families" not "constituents." "Your water bill" not "utility rates." First person only when it's real. Never sound like a committee wrote it.

STRUCTURE — Use the five-beat framework:
1. THE COST: Lead with a specific, human cost — a price, a wait time, a denied claim, a lost hour of work, a specific number. Never open with an abstract value word (freedom, democracy, rights, justice) — the reader should feel a concrete consequence in the first sentence, before any framing is applied. If a sentence could apply to any topic, rewrite it with the specific fact from the input.
2. THE RIGGING: Name the mechanism or villain responsible for the cost named in Beat 1. If the input names a specific villain (Trump, a political party, a named official), use that name directly. If it does not, do not invent one — frame it generally (a rigged system, corporate donors, the billionaire class). Corruption language must be earned — see EARNED CORRUPTION LANGUAGE below — never a bare label with no specific act behind it.
3. THE THREAT TO AMERICANS: Only now, after the cost and mechanism are established, reframe the stakes using freedom, rights, or democracy language — and only when directly anchored to the specific cost already named in Beat 1. Freedom language must never stand alone as an abstraction.
4. THE FIX: A specific reform, bill, ban, or change — not "we need change." The fix should map directly to the mechanism named in Beat 2.
5. THE ASK: One low-barrier action, framed as the mechanism that restores what was named in Beat 1 and Beat 3 — vote, call, sign, share. Keep this concrete and singular: one ask per post, not a list.

VILLAIN FRAMING — If the input content names a specific villain (Trump, a political party, a named official), use that name directly — don't launder it into vague language. If the input does NOT name a specific person or party, do not invent one: frame the villain generally as billionaires, corporate donors, or a rigged system, and let the audience make the connection. Never invent a named villain that isn't present in the input.

HOPE DISCIPLINE — Anger opens the door. Hope closes the deal. Every message must end somewhere: a reform, an action, a change that's possible. Rage without resolution loses people.

SPECIFICITY RULE — Every abstract claim needs a concrete anchor: a price, a place, a person, a number, a named reform. "Corporate greed" alone is not enough. "Record profits while your grocery bill went up 23%" is. Every message should answer: What exactly happened? To whom? What did it cost? Who made it happen? What would change it?

EARNED CORRUPTION LANGUAGE — A corruption label (corrupt, rigged, bought off, etc.) is only earned when paired with the specific act and specific cost behind it, per the SPECIFICITY RULE above — never used bare.
- Wrong: "Corrupt Republicans voted for this."
- Right: "The politicians who voted for this took $2 million from the company that benefits. That's not a coincidence."

FORBIDDEN PHRASES — Never use "We must," "Now is the time," or "History will judge," in any form. For the phrases below, use the specific replacement shown — don't just delete the phrase, replace it with the concrete alternative:
- "systemic inequities" → "a system that's rigged"
- "electoral integrity" → "your vote counting"
- "reproductive freedom" → "the right to decide"
- "corporate accountability mechanisms" → "rules that stop companies from cheating you"
- "a lot of us feel..." → "most families are finding..."
- "out here we know..." → "in [specific place], people are dealing with..."

${FACTUAL_ACCURACY_GUARDRAIL}
${AI_TELL_PHRASING_BAN}
${PLATFORM_VOICE_GUIDE_NATIONAL}

${HASHTAG_BODY_BAN}

${JSON_ONLY_INSTRUCTION}
${JSON_ESCAPING_INSTRUCTION}`;

    const dynamicPrompt = `${frameBlock}
Issue/Content: ${formData.issue}
Focal Point: ${formData.focalPoint || "Not specified"}
${focalPointMandatory}
Target Audience: ${audienceLabel}
${audienceSwapNote}Voice/Persona: ${formData.voice || "Not specified"}
${styleDefBlock}Style: ${styleLabel}
${modifierLine}
${perspLine}

Generate compelling social media posts for: ${plats}

${platformIdsLine}
${formatLine}`;

    return { staticSystem, dynamicPrompt };
  };

  const buildPrompt = (platforms) => {
    const { staticSystem, dynamicPrompt } = buildPromptParts(platforms);
    return `${staticSystem}\n\n${dynamicPrompt}`;
  };

  const MM_DRAFT_KEY = "mm_draft_session";

// Detect arrival source from localStorage push keys
function detectArrivalSource() {
  try {
    if (localStorage.getItem("rebuttal_push_results")) return "Rebuttal Generator";
    if (localStorage.getItem("mm_load_campaign"))      return "Library";
    const rrRaw = localStorage.getItem("rr_pending_article");
    if (rrRaw) {
      try {
        const p = JSON.parse(rrRaw);
        if ((p.sourcePublication || "").includes("Research")) return "Research";
      } catch {}
      return "Rapid Response";
    }
  } catch {}
  return null;
}
  const buildRegenPrompt = (platformId, currentText, regenOpt) => {
    const platform = PLATFORMS.find(p => p.id === platformId);
    const currentLen = currentText.length;
    const audienceLabel = formData.audience || DEFAULT_AUDIENCE;
    const styleObj = STYLES.find(s=>s.id===(formData.style||DEFAULT_STYLE));
    const styleLabel = styleObj ? styleObj.label : "Neutral";
    // Style/Tone definitions (Aug 2026 messaging-modifier revision) — same
    // constants buildPromptParts uses, so regen (Shorten/Expand/Rephrase)
    // gets the same real instructional text behind Style/Tone that initial
    // generation now does, instead of a bare label as before. Rural AZ
    // Style is deliberately NOT added here — regen never carried county/
    // persona-layer content before this revision either (a known, flagged
    // gap — see the accompanying report's §9), and this revision doesn't
    // change that scoping.
    const styleDef = STYLE_DEFINITIONS[formData.style] || "";
    const styleDefLine = styleDef ? `- ${styleDef}\n` : "";
    const modifierDef = formData.modifier ? TONE_MODIFIER_DEFINITIONS[formData.modifier] : "";
    const modifierLine = formData.modifier ? `Tone modifier: ${formData.modifier} — ${modifierDef}` : "";
    const frameObj = NATIONAL_FRAMES.find(f => f.id === msgFrame);
    const frameBlock = frameObj ? `\nMESSAGING FRAME — ${frameObj.label.toUpperCase()}:\n${frameObj.prompt}\n` : "";
    const modeLabel = msgMode === "national" ? "progressive coalition (National Messaging Style)"
                     : msgMode === "az"       ? "Arizona Democratic campaign coalition"
                     : "political campaign coalition";
    const perspObj = SPEAKER_PERSPECTIVES.find(p => p.id === formData.perspective);
    const perspLine = perspObj ? `Grammatical person: ${perspObj.label} — ${perspObj.desc}` : "";

    const instruction = regenOpt === "shorten"
      ? `SHORTEN this message. It is currently ${currentLen} characters. You MUST produce a version that is meaningfully shorter — at least 20% fewer characters. Keep the core message and call to action but cut filler, reduce examples, and tighten every sentence. Do not add new content.`
      : regenOpt === "expand"
      ? `EXPAND this message with more detail, context, and persuasive depth. Keep the same tone and platform style. Do not change the core message.`
      : `REPHRASE this message. Keep the same length, meaning, and platform style but use different wording, sentence structure, and framing.`;

    return `You are an expert political messaging strategist for a legitimate ${modeLabel}.

${FACTUAL_ACCURACY_GUARDRAIL}
${AI_TELL_PHRASING_BAN}
${frameBlock}
Your task is to rewrite the following existing ${platform?.name} post.

CURRENT MESSAGE (${currentLen} characters):
${currentText}

INSTRUCTION: ${instruction}

Context:
- Platform: ${platform?.name} (max ${platform?.maxChars} chars)
- Target Audience: ${audienceLabel}
${styleDefLine}- Style: ${styleLabel}
${modifierLine}
${perspLine}
- Original issue: ${formData.issue}
${formData.focalPoint ? `- Focal Point (mandatory — do not let ${regenOpt === "shorten" ? "shortening" : regenOpt === "expand" ? "expanding" : "rephrasing"} drop or dilute this): ${formData.focalPoint}` : ""}

${HASHTAG_BODY_BAN}
${JSON_ONLY_INSTRUCTION}
${JSON_ESCAPING_INSTRUCTION}
Format: {"${platformId}": "rewritten message text"}
If, and only if, the SELF-CONTRADICTION rule above applies, also include: {"_contradictionFlags": {"${platformId}": "one-sentence explanation of the contradiction"}} — omitted entirely if it doesn't apply.`;
  };

  // Shared response-parsing logic — extracted (Aug 2026, Background
  // Functions rearchitecture) so both callAPI's direct synchronous path
  // (still used for single-platform regen and MisinfoMonitor) and
  // generateAll's new job-polling path parse a raw Claude response
  // identically, instead of this fragile truncation/malformed-JSON
  // handling existing in two copies that could drift.
  const parseGeneratedPayload = (data, maxTokens) => {
    const text = data.content.map(i=>i.text||"").join("");
    const cleaned = text.replace(/```json|```/g,"").trim();
    if (!cleaned.startsWith("{")) {
      const err = new Error("content_flagged");
      err.type = "content_flagged";
      err.raw = cleaned;
      throw err;
    }
    try {
      return JSON.parse(cleaned);
    } catch (parseErr) {
      const posMatch = parseErr.message.match(/position (\d+)/);
      const errPos = posMatch ? parseInt(posMatch[1], 10) : null;
      console.error("[Message Machine] JSON.parse failed on Claude's response.");
      console.error("  stop_reason:", data.stop_reason);
      console.error("  max_tokens requested:", maxTokens);
      console.error("  raw response length:", cleaned.length, "chars");
      console.error("  parse error:", parseErr.message);
      if (errPos !== null) {
        const start = Math.max(0, errPos - 150);
        const end = Math.min(cleaned.length, errPos + 150);
        console.error(`  text around error position ${errPos} (chars ${start}-${end}):`, cleaned.slice(start, end));
      } else {
        console.error("  raw response (last 300 chars):", cleaned.slice(-300));
      }
      const truncated = data.stop_reason === "max_tokens";
      const err = new Error(truncated ? "response_truncated" : "parse_error");
      err.type = truncated ? "truncated" : "connection";
      err.raw = cleaned;
      throw err;
    }
  };

  const callAPI = async (prompt, maxTokens=1000) => {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
    const res = await fetch("/.netlify/functions/generate-message", {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ max_tokens:maxTokens, messages:[{role:"user",content:prompt}] }),
    });
    if (res.status === 429) {
      const limitData = await res.json();
      const err = new Error("rate_limit_exceeded");
      err.type = "rate_limit_exceeded";
      err.limitData = limitData;
      throw err;
    }
    if (res.status === 402) {
      const creditData = await res.json();
      const err = new Error("credits_exhausted");
      err.type = "credits_exhausted";
      err.creditMessage = creditData.message;
      throw err;
    }
    const data = await res.json();
    if (data.error) {
      const err = new Error(data.error);
      err.type = "auth_or_server_error";
      throw err;
    }
    if (data.usageWarning) {
      const { used, limit, remaining } = data.usageWarning;
      notify(`⚠️ ${used}/${limit} daily AI calls used — ${remaining} remaining.`, "warn");
    }
    if (data.creditWarning) {
      notify(`⚠️ ${data.creditWarning.message}`, "warn");
    }
    return parseGeneratedPayload(data, maxTokens);
  };

  // ── URL-aware ingestion: pull an article straight into Issue/Content ──
  const fetchArticleFromUrl = async (targetUrl) => {
    if (!targetUrl) return;
    setUrlError("");
    setUrlFetching(true);
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
        setUrlError("Please sign in again to fetch articles.");
        setUrlFetching(false);
        return;
      }
      if (res.status === 429) {
        setUrlError("Daily AI call limit reached. Resets at midnight UTC.");
        setUrlFetching(false);
        return;
      }
      if (res.status === 400) {
        setUrlError("That URL isn't allowed. Double-check it and try again.");
        setUrlFetching(false);
        return;
      }
      if (res.status === 422) {
        setUrlError("Couldn't read that page — try pasting the article text into Issue/Content directly instead.");
        setUrlFetching(false);
        return;
      }
      if (res.status === 402) {
        const creditData = await res.json();
        setUrlError(creditData.message || "Your organization's AI-generation credits are used up. Contact an Administrator to add more.");
        setUrlFetching(false);
        return;
      }

      const data = await res.json();
      if (data.usageWarning) {
        const { used, limit, remaining } = data.usageWarning;
        notify(`⚠️ ${used}/${limit} daily AI calls used — ${remaining} remaining.`, "warn");
      }
      if (data.creditWarning) {
        notify(`⚠️ ${data.creditWarning.message}`, "warn");
      }
      const raw = data.result?.content?.filter(b => b.type === "text").map(b => b.text).join("") || "";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

      // Same issueText shape Rapid Response's own "Push to Message Machine"
      // button builds — keeps the two entry points producing identical output.
      const issueText = `${parsed.title}\n\n${parsed.summary}\n\nKey Points:\n${(parsed.keyPoints || []).map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\nSource: ${targetUrl}`;
      setFormData(f => ({ ...f, issue: issueText, focalPoint: "" }));
      setFromResearch(true); // reuses the existing gold "add your focal point" hint
      setUrlInput("");
      setShowUrlInput(false);
      if (genError) setGenError(null);
      notify("Article loaded into Issue/Content — add a focal point below.");
    } catch {
      setUrlError("Couldn't read that page — try pasting the article text into Issue/Content directly instead.");
    }
    setUrlFetching(false);
  };

  const validate = () => {
    if (!formData.issue.trim())      return "Please describe the issue.";
    if (!formData.platforms.length)  return "Please select at least one platform.";
    return null;
  };

  // Applies one group's Claude result (or error) onto the accumulating
  // textOnly/flags objects and any warning notifications — shared by the
  // "all complete" handler below so the per-group logic exists once.
  const applyGroupResult = (group, textOnly, flags) => {
    if (group.error) {
      // Surfaced via notify rather than the full-page genError panel —
      // a partial failure (one group blocked, others succeeded) shouldn't
      // hide the results that DID come back. genError below is reserved
      // for the "nothing came back at all" case.
      const msg = group.error === "rate_limit_exceeded"
        ? (group.limitData?.message || "Daily AI-call limit reached for one platform group.")
        : group.error === "credits_exhausted"
          ? (group.creditMessage || "Your organization's AI-generation credits are used up.")
          : "One platform group failed to generate — try regenerating it individually.";
      notify(`⚠️ ${group.platformIds.join(", ")}: ${msg}`, "err");
      return false;
    }
    if (group.usageWarning) {
      const { used, limit, remaining } = group.usageWarning;
      notify(`⚠️ ${used}/${limit} daily AI calls used — ${remaining} remaining.`, "warn");
    }
    if (group.creditWarning) {
      notify(`⚠️ ${group.creditWarning}`, "warn");
    }
    try {
      const parsed = parseGeneratedPayload(group.data, GENERATION_MAX_TOKENS);
      const { _contradictionFlags, ...rest } = parsed;
      Object.assign(textOnly, rest);
      Object.assign(flags, _contradictionFlags || {});
      return true;
    } catch (err) {
      notify(`⚠️ ${group.platformIds.join(", ")}: generation came back malformed — try regenerating it individually.`, "err");
      return false;
    }
  };

  const generateAll = async () => {
    const err = validate(); if (err) { notify(err,"err"); return; }
    setGenerating(true); setShowLoader(true); setHashtags(null); setGenError(null);
    setGenStatusMsg("Generating your posts — this can take a little longer than usual right now, that's expected.");

    // Clean up any listener/timeout from a previous, still-in-flight
    // generateAll call before starting a new one.
    if (activeJobRef.current.unsub) activeJobRef.current.unsub();
    if (activeJobRef.current.timeoutId) clearTimeout(activeJobRef.current.timeoutId);

    try {
      const selected = formData.platforms;
      // One combined group, all selected platforms in a single call — see
      // the "Platform-call consolidation" comment near the top of this
      // file (right after the PLATFORMS array) for why this replaced the
      // old 3-way PLATFORM_GROUPS split.
      // Prompt caching (Aug 2026) — sends the static/dynamic split from
      // buildPromptParts() instead of one flat string, so
      // generate-message-background.mjs can send Claude a real
      // cache_control-tagged system block. See buildPromptParts() itself
      // for exactly what's in each half.
      const { staticSystem, dynamicPrompt } = buildPromptParts(selected);
      const groups = [{ platformIds: selected, staticSystem, dynamicPrompt, maxTokens: GENERATION_MAX_TOKENS }];

      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/.netlify/functions/start-message-generation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ groups }),
      });
      if (res.status === 429) {
        const limitData = await res.json();
        const e = new Error("rate_limit_exceeded"); e.type = "rate_limit_exceeded"; e.limitData = limitData;
        throw e;
      }
      if (res.status === 402) {
        const creditData = await res.json();
        const e = new Error("credits_exhausted"); e.type = "credits_exhausted"; e.creditMessage = creditData.message;
        throw e;
      }
      const startData = await res.json();
      if (startData.error || !startData.jobId) {
        const e = new Error(startData.error || "Failed to start generation."); e.type = "auth_or_server_error";
        throw e;
      }

      // Listen for the Background Function to finish — replaces the old
      // Promise.all(3 synchronous fetches). Resolves this promise once the
      // job reaches a terminal state (complete/error), or after a 4-minute
      // safety timeout if something got stuck — 15 minutes is the real
      // ceiling a Background Function has, but 4 minutes is a reasonable
      // "something's wrong, stop waiting silently" point for an
      // interactive tool someone's sitting in front of.
      await new Promise((resolve, reject) => {
        const jobRef = doc(db, "generationJobs", startData.jobId);
        const unsub = onSnapshot(jobRef, snap => {
          if (!snap.exists()) return; // shouldn't happen, ignore a stray empty read
          const job = snap.data();
          if (job.status === "pending") return;

          clearTimeout(activeJobRef.current.timeoutId);
          unsub();
          activeJobRef.current = { unsub: null, timeoutId: null };

          if (job.status === "error") {
            const e = new Error(job.error || "Generation failed."); e.type = "connection";
            reject(e);
            return;
          }

          const textOnly = {};
          const flags = {};
          let anySucceeded = false;
          (job.groupResults || []).forEach(g => { if (applyGroupResult(g, textOnly, flags)) anySucceeded = true; });

          if (!anySucceeded) {
            const e = new Error("generation_failed"); e.type = "connection";
            reject(e);
            return;
          }

          setMessages(textOnly);
          setContradictionFlags(flags);
          resolve();
        }, err => {
          clearTimeout(activeJobRef.current.timeoutId);
          activeJobRef.current = { unsub: null, timeoutId: null };
          reject(err);
        });

        const timeoutId = setTimeout(() => {
          unsub();
          activeJobRef.current = { unsub: null, timeoutId: null };
          const e = new Error("generation_timeout"); e.type = "connection";
          reject(e);
        }, 4 * 60 * 1000);

        activeJobRef.current = { unsub, timeoutId };
      });

      setShowLoader(false);
      setView("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch(e) {
      setShowLoader(false);
      if (e.type === "content_flagged") {
        setGenError("flagged");
      } else if (e.type === "rate_limit_exceeded") {
        setGenError("ratelimit");
      } else if (e.type === "credits_exhausted") {
        setCreditsExhaustedMsg(e.creditMessage || "");
        setGenError("credits");
      } else if (e.type === "truncated") {
        setGenError("truncated");
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
      const { _contradictionFlags, ...textOnly } = r;
      setMessages(p=>({...p,...textOnly}));
      const note = _contradictionFlags && _contradictionFlags[platformId];
      setContradictionFlags(p => {
        if (!note) {
          if (!(platformId in p)) return p;
          const next = { ...p };
          delete next[platformId];
          return next;
        }
        return { ...p, [platformId]: note };
      });
    } catch(e) {
      if (e.type === "content_flagged") {
        setGenError("flagged");
      } else if (e.type === "rate_limit_exceeded") {
        setGenError("ratelimit");
      } else if (e.type === "credits_exhausted") {
        setCreditsExhaustedMsg(e.creditMessage || "");
        setGenError("credits");
      } else if (e.type === "truncated") {
        setGenError("truncated");
      } else {
        setGenError("connection");
      }
    }
    setPlatLoad(p=>({...p,[platformId]:false}));
  };

  const copyText = async (text, name) => { await navigator.clipboard.writeText(text); notify(`${name} message copied!`); };

  const dismissContradiction = (platformId) => {
    setContradictionFlags(p => {
      const next = { ...p };
      delete next[platformId];
      return next;
    });
  };

  const generateHashtags = async () => {
    setHashLoading(true); setHashtags(null);
    try {
      const platNames = PLATFORMS.filter(p=>formData.platforms.includes(p.id)).map(p=>p.name).join(", ");
      const prompt = `You are a social media expert for progressive political campaigns.

FACTUAL ACCURACY — NON-NEGOTIABLE: Only suggest hashtags that are real, established, and verifiable. Do not invent hashtag campaigns that do not exist.

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

  // ── Push to Storm (Handoff #15, decision #7) — Admin/Manager only ─────────
  // Message Machine's platform ids (facebook/instagram/twitter/threads/tiktok/
  // bluesky) already match Storm posts' texts keys 1:1, so `messages` can be
  // handed straight to a Storm post's `texts` field with no remapping.
  const derivedPostTitle = () => (formData.issue || "Untitled").trim().slice(0, 60);

  const openPushModal = async () => {
    setPushError(""); setPushModal(true); setPushLoading(true);
    try {
      const all = await loadAllStorms();
      setPushStorms(all.filter(s => s.status !== STORM_STATUS.ARCHIVED));
    } catch {
      setPushError("Couldn't load storms — check your connection and try again.");
    }
    setPushLoading(false);
  };

  const buildGenParams = () => {
    const params = { mode: modeLabel(msgMode) };
    if (formData.audience) params.audience = formData.audience;
    if (formData.voice) params.voice = formData.voice;
    if (formData.modifier) params.tone = formData.modifier;
    return params;
  };

  const pushToExistingStorm = async (storm) => {
    setPushLoading(true); setPushError("");
    try {
      const existingPosts = await loadStormPosts(storm.id);
      await createStormPost(storm.id, {
        title: derivedPostTitle(),
        mediaType: STORM_MEDIA_TYPES.VIDEO, // placeholder — no media at push time; staff adds it manually
        media: [],
        texts: { ...messages },
        genParams: buildGenParams(),
        order: existingPosts.length,
      });
      setPushModal(false);
      notify(`Pushed to "${storm.title}" — add media in Storm Posts to finish it.`);
    } catch {
      setPushError("Push failed — check your connection and try again.");
    }
    setPushLoading(false);
  };

  const pushToNewStorm = () => {
    try {
      localStorage.setItem(PUSH_TO_STORM_KEY, JSON.stringify({
        texts: { ...messages },
        title: derivedPostTitle(),
        genParams: buildGenParams(),
        pushedAt: new Date().toISOString(),
      }));
      window.location.href = "/storms";
    } catch {
      setPushError("Browser storage is disabled — can't stage this push. Copy the posts manually instead.");
    }
  };

  // County picker lives inside Pro Mode — open the panel when a loaded campaign
  // has a county so the restored selection is visible, not silently applied.
  const loadCampaign = (c) => { setFormData(c.formData); if (c.formData?.ruralStyle) setProModeOpen(true); setMessages(c.messages); setHashtags(null); setView("results"); notify(`Loaded: ${c.name}`); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const deleteCampaign = async (id) => {
    try {
      await fbDelete(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      notify("Campaign deleted.");
    } catch { notify("Delete failed — please try again.", "err"); }
  };

  const [formKey, setFormKey] = useState(0);

  const startNewCampaign = () => {
    try { localStorage.removeItem(MM_DRAFT_KEY); } catch {}
    setFormData({ issue:"", focalPoint:"", audience:"", voice:"", ruralStyle:false, style:"", modifier:"", perspective:"", platforms:[] });
    setMsgMode("");
    setMsgFrame("");
    setFromResearch(false);
    setCountySuggestion("");
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
    try {
      localStorage.setItem(MM_DRAFT_KEY, JSON.stringify({
        formData, messages, view, savedAt: new Date().toISOString(),
      }));
    } catch {}
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
      {showLoader && <DesertLoader statusMsg={genStatusMsg} />}

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
                  try { localStorage.removeItem(MM_DRAFT_KEY); } catch {}
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

      {/* AI DISCLAIMER */}
      <div style={{ maxWidth:860, margin:"0 auto", padding:"16px 20px 0" }}>
        <div style={{ background: "rgba(29,92,74,0.08)", border: `2px solid ${T.teal}`, borderRadius: 8, padding: "14px 20px", fontSize: 17, fontWeight: 700, color: T.teal, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚠️</span> AI-generated content — always verify facts and claims before publishing.
        </div>
      </div>

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
          background: genError === "flagged" ? "#7f1d1d" : genError === "ratelimit" ? "#4c1d95" : genError === "credits" ? "#4A3163" : genError === "truncated" ? "#92400e" : "#7a3820",
          color:"#fff",
          border:`2px solid ${genError === "flagged" ? "#b91c1c" : genError === "ratelimit" ? "#7c3aed" : genError === "credits" ? "#0E7A8C" : genError === "truncated" ? "#c2670a" : "var(--terracotta)"}`,
          borderRadius:12, padding:"14px 48px 14px 20px",
          boxShadow:"0 8px 32px rgba(0,0,0,0.45)",
        }}>
          <button onClick={() => setGenError(null)} aria-label="Dismiss" style={{
            position:"absolute", top:10, right:14,
            background:"none", border:"none", cursor:"pointer",
            fontSize:20, color:"rgba(255,255,255,0.8)", fontWeight:900, fontFamily:"inherit", lineHeight:1,
          }}>✕</button>
          <p style={{ fontSize:16, fontWeight:900, marginBottom:4 }}>
            {genError === "flagged" ? "⚠️ Generation blocked" : genError === "ratelimit" ? "🚦 Daily limit reached" : genError === "credits" ? "🚫 Generation credits used up" : genError === "truncated" ? "✂️ Response cut off" : "⚠️ Generation failed"}
          </p>
          <p style={{ fontSize:14, color:"rgba(255,255,255,0.85)", lineHeight:1.5 }}>
            {genError === "flagged"
              ? "The AI declined this request. Edit the Issue / Content field and try again."
              : genError === "ratelimit"
              ? "You've used all your AI calls for today. Resets at midnight UTC. Contact an admin for more access."
              : genError === "credits"
              ? (creditsExhaustedMsg || "Your organization's AI-generation credits are used up. Contact an Administrator to add more.")
              : genError === "truncated"
              ? "Claude's reply was cut off before it finished — usually from a lot of source content. Try fewer platforms at once, or trim what's in Issue/Content."
              : "Request timed out. Try again — or select fewer platforms at once, then generate the rest separately."}
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

            {genError === "truncated" && (
              <div role="alert" style={{
                background:"#fffbeb", border:`3px solid #c2670a`,
                borderRadius:12, padding:"20px 24px", marginBottom:28,
                position:"relative",
              }}>
                <button
                  onClick={() => setGenError(null)}
                  aria-label="Dismiss error"
                  style={{
                    position:"absolute", top:14, right:16,
                    background:"none", border:"none", cursor:"pointer",
                    fontSize:22, color:"#c2670a", fontWeight:900, lineHeight:1,
                    fontFamily:"inherit",
                  }}
                >✕</button>
                <p style={{ fontSize:18, fontWeight:900, color:"#92400e", marginBottom:10 }}>
                  ✂️ Claude's response was cut off
                </p>
                <p style={{ fontSize:16, color:T.textMid, lineHeight:1.6, marginBottom:10 }}>
                  This isn't a timeout — Claude finished writing but the reply was longer than it had room for, usually because there's a lot of source content in <strong style={{ color:T.text }}>Issue / Content</strong> (e.g. multiple full candidate profiles).
                </p>
                <p style={{ fontSize:15, color:T.textMid, lineHeight:1.6 }}>
                  <strong>Try:</strong> Generate with fewer platforms selected at once, or trim the Issue / Content field down to what's actually relevant.
                </p>
              </div>
            )}

            {genError === "connection" && (
              <div role="alert" style={{
                background:"var(--terracotta-light)", border:`3px solid var(--terracotta)`,
                borderRadius:12, padding:"20px 24px", marginBottom:28,
                position:"relative",
              }}>
                <button
                  onClick={() => setGenError(null)}
                  aria-label="Dismiss error"
                  style={{
                    position:"absolute", top:14, right:16,
                    background:"none", border:"none", cursor:"pointer",
                    fontSize:22, color:"var(--terracotta)", fontWeight:900, lineHeight:1,
                    fontFamily:"inherit",
                  }}
                >✕</button>
                <p style={{ fontSize:18, fontWeight:900, color:"var(--terracotta)", marginBottom:10 }}>
                  ⚠️ Generation failed
                </p>
                <p style={{ fontSize:16, color:T.textMid, lineHeight:1.6, marginBottom:10 }}>
                  The request timed out or couldn't connect. This can happen with longer content, or with several platforms generating at once on a slower connection.
                </p>
                <p style={{ fontSize:15, color:T.textMid, lineHeight:1.6 }}>
                  <strong>Try:</strong> Hit Generate again — it usually works on a second attempt. If it keeps happening, select fewer platforms at once, then generate the rest separately.
                </p>
              </div>
            )}

            {genError === "ratelimit" && (
              <div role="alert" style={{
                background:"#f5f0ff", border:`3px solid #7c3aed`,
                borderRadius:12, padding:"20px 24px", marginBottom:28,
                position:"relative",
              }}>
                <button
                  onClick={() => setGenError(null)}
                  aria-label="Dismiss error"
                  style={{
                    position:"absolute", top:14, right:16,
                    background:"none", border:"none", cursor:"pointer",
                    fontSize:22, color:"#7c3aed", fontWeight:900, lineHeight:1,
                    fontFamily:"inherit",
                  }}
                >✕</button>
                <p style={{ fontSize:18, fontWeight:900, color:"#7c3aed", marginBottom:10 }}>
                  🚦 Daily limit reached
                </p>
                <p style={{ fontSize:16, color:T.textMid, lineHeight:1.6, marginBottom:10 }}>
                  You've used all your AI calls for today. Your limit resets at midnight UTC.
                </p>
                <p style={{ fontSize:15, color:T.textMid, lineHeight:1.6 }}>
                  Need more access?{" "}
                  <a href="mailto:info@arizonacoalition.net?subject=Daily%20AI%20limit%20reached" style={{ color:"#7c3aed", fontWeight:700, textDecoration:"none" }}>
                    Contact your coalition administrator
                  </a>.
                </p>
              </div>
            )}

            {genError === "credits" && (
              <div role="alert" style={{
                background:"#f2effa", border:`3px solid #4A3163`,
                borderRadius:12, padding:"20px 24px", marginBottom:28,
                position:"relative",
              }}>
                <button
                  onClick={() => setGenError(null)}
                  aria-label="Dismiss error"
                  style={{
                    position:"absolute", top:14, right:16,
                    background:"none", border:"none", cursor:"pointer",
                    fontSize:22, color:"#4A3163", fontWeight:900, lineHeight:1,
                    fontFamily:"inherit",
                  }}
                >✕</button>
                <p style={{ fontSize:18, fontWeight:900, color:"#4A3163", marginBottom:10 }}>
                  🚫 Generation credits used up
                </p>
                <p style={{ fontSize:16, color:T.textMid, lineHeight:1.6, marginBottom:10 }}>
                  {creditsExhaustedMsg || "Your organization's AI-generation credits are used up."}
                </p>
                <p style={{ fontSize:15, color:T.textMid, lineHeight:1.6 }}>
                  An Administrator can add more from the Admin panel's Orgs tab ("Grant comp credits") — no purchase needed for this today.
                </p>
              </div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:22 }}>

              {/* ── Messaging Mode + Frame ── */}
              <section style={{ ...S.card, background: msgMode === "national" ? "#f0f7f5" : T.surface, border: `2px solid ${msgMode === "national" ? T.teal : T.border}` }}>
                <fieldset style={{ border:"none", padding:0 }}>
                  <legend style={S.label}>Messaging Mode <span style={{ fontWeight:400, fontSize:13, textTransform:"none", letterSpacing:0, color:T.textMute }}>(optional)</span><HelpTooltip text={HELP.messageMachine.mode} label="Help: Messaging Mode" /></legend>
                  <p style={{ ...S.hint, marginBottom:12 }}>Default: Neutral — no regional or national style guide applied</p>
                  <div style={{ display:"flex", gap:12, marginBottom: 16, flexWrap:"wrap" }}>
                    {[
                      { id:"az", label:"🌵 AZ Coalition", desc:"Arizona-grounded messaging, local communities and context" },
                      { id:"national", label:"🇺🇸 National Style", desc:"National Messaging Style Guide — four-beat structure, neighbor voice" },
                    ].map(m => {
                      const on = msgMode === m.id;
                      return (
                        <label key={m.id} style={{
                          flex:"1 1 200px", display:"flex", flexDirection:"column", gap:4,
                          padding:"14px 16px", borderRadius:10, cursor:"pointer",
                          border: on ? `3px solid ${T.teal}` : `2px solid ${T.border}`,
                          background: on ? "#e8f4f1" : T.surface,
                          transition:"all 0.15s",
                        }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <input type="radio" name="msgMode" value={m.id} checked={on}
                              onChange={() => setMsgMode(on ? "" : m.id)}
                              onClick={() => { if(on) setMsgMode(""); }}
                              style={{ width:20, height:20, accentColor:T.teal, cursor:"pointer", flexShrink:0 }} />
                            <span style={{ fontSize:17, fontWeight:900, color: on ? T.teal : T.text }}>{m.label}</span>
                          </div>
                          <span style={{ fontSize:13, color:T.textMute, paddingLeft:30, lineHeight:1.4 }}>{m.desc}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </section>

              {/* Issue */}
              <section style={S.card}>
                <label htmlFor="issue" style={S.label}>Issue / Content <span style={{color:T.red}} aria-label="required">*</span><HelpTooltip text={HELP.messageMachine.issue} label="Help: Issue field" /></label>
                <textarea id="issue" rows={6} style={{...S.textarea,resize:"vertical"}}
                  placeholder="Describe the issue using as little or as much detail as you wish, or paste in text. Have a news article instead? Paste its URL below."
                  value={formData.issue} onChange={e=>{ upd("issue",e.target.value); if(genError) setGenError(null); }} />

                <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
                  {!showUrlInput ? (
                    <button type="button" onClick={()=>setShowUrlInput(true)}
                      style={{ background:"none", border:"none", color:T.teal, fontWeight:700, fontSize:15, cursor:"pointer", padding:0, fontFamily:"inherit", textDecoration:"underline" }}>
                      🔗 Or paste a URL to fetch an article
                    </button>
                  ) : (
                    <div>
                      <label htmlFor="article-url" style={{...S.label, fontSize:13, marginBottom:8}}>Article URL<HelpTooltip text={HELP.messageMachine.urlIngest} label="Help: Article URL" /></label>
                      <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                        <input id="article-url" type="url" style={{...S.input, flex:1, minWidth:220}}
                          placeholder="https://example.com/article"
                          value={urlInput}
                          onChange={e=>{ setUrlInput(e.target.value); if(urlError) setUrlError(""); }}
                          disabled={urlFetching}
                          onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); fetchArticleFromUrl(urlInput.trim()); } }}
                        />
                        <button type="button" onClick={()=>fetchArticleFromUrl(urlInput.trim())}
                          disabled={urlFetching || !urlInput.trim()}
                          style={{...S.btnDark, opacity:(urlFetching || !urlInput.trim())?0.6:1, cursor:(urlFetching || !urlInput.trim())?"not-allowed":"pointer"}}>
                          {urlFetching ? "Fetching…" : "Fetch Article"}
                        </button>
                        <button type="button" onClick={()=>{ setShowUrlInput(false); setUrlInput(""); setUrlError(""); }}
                          style={{ background:"none", border:"none", color:T.textMute, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
                          Cancel
                        </button>
                      </div>
                      {urlError
                        ? <p style={{...S.hint, color:T.red}}>{urlError}</p>
                        : <p style={S.hint}>Pulls the article's summary and key points into Issue/Content above — same engine as Rapid Response.</p>}
                    </div>
                  )}
                </div>
              </section>

              {/* Focal Point */}
              <section style={{...S.card, ...(fromResearch && !formData.focalPoint ? { border:"2px solid var(--gold)", background:"var(--gold-light)" } : {})}}>
                <label htmlFor="focal" style={{...S.label, ...(fromResearch && !formData.focalPoint ? { color:"var(--teal)" } : {})}}>
                  Focal Point{fromResearch && !formData.focalPoint ? " ← Add your key message here" : ""}
                </label>
                <input id="focal" type="text"
                  style={{...S.input, ...(fromResearch && !formData.focalPoint ? { borderColor:"#F5C842", boxShadow:"0 0 0 3px rgba(245,200,66,0.25)" } : {})}}
                  placeholder={fromResearch && !formData.focalPoint ? 'What is the key message you want to emphasize?' : 'e.g. "Hobbs fights for rural Arizona" or "Local school funding at stake"'}
                  value={formData.focalPoint}
                  onChange={e=>{ upd("focalPoint",e.target.value); if(e.target.value) setFromResearch(false); }}
                  autoFocus={fromResearch && !formData.focalPoint}
                />
                <p style={S.hint}>{fromResearch && !formData.focalPoint ? "Content has been loaded from Research — add a focal point to frame your message before generating." : "The one thing you want every post to drive home"}</p>
              </section>

              {/* ── Pro Mode toggle ── */}
              {(() => {
                const proModeActiveCount = [
                  formData.audience, formData.voice, formData.ruralStyle,
                  formData.style, formData.modifier, formData.perspective, msgFrame,
                ].filter(Boolean).length;
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <button type="button" onClick={() => setProModeOpen(o => !o)}
                      style={{
                        display:"flex", alignItems:"center", justifyContent:"space-between",
                        flex:1, padding:"12px 18px",
                        borderRadius: proModeOpen ? "10px 10px 0 0" : 10,
                        cursor:"pointer",
                        fontFamily:"inherit", fontSize:15, fontWeight:700,
                        background: proModeOpen ? "#e8f4f1" : T.surface,
                        border: `2px solid ${proModeOpen ? T.teal : T.border}`,
                        borderBottom: proModeOpen ? "none" : `2px solid ${T.border}`,
                        color: T.teal,
                      }}>
                      <span>⚙️ Pro Mode — Frame, Audience, Voice, Style &amp; Rural AZ Style
                        {proModeActiveCount > 0 ? ` (${proModeActiveCount} active)` : ""}
                      </span>
                      <span style={{ fontSize:18, transform: proModeOpen ? "rotate(180deg)" : "none", transition:"transform 0.15s" }}>▾</span>
                    </button>
                    <HelpTooltip text={HELP.messageMachine.proModeToggle} label="Help: Pro Mode" align="end" />
                    </div>
                  </div>
                );
              })()}

              {proModeOpen && (
              <div style={{
                display:"flex", flexDirection:"column", gap:22,
                background:"#e8f4f1", border:`2px solid ${T.teal}`, borderTop:"none",
                borderRadius:"0 0 14px 14px",
                padding:20, marginTop:0,
              }}>

              {/* Messaging Frame — relocated here for Pro users */}
              <section style={S.card}>
                <fieldset style={{ border:"none", padding:0 }}>
                  <legend style={S.label}>Messaging Frame <span style={{ fontWeight:400, fontSize:13, textTransform:"none", letterSpacing:0, color:T.textMute }}>(optional)</span><HelpTooltip text={HELP.messageMachine.messagingFrame} label="Help: Messaging Frame" /></legend>
                  <p style={{ ...S.hint, marginBottom:12 }}>Focus the entire message on one strategic theme. Leave blank for general messaging.</p>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    {NATIONAL_FRAMES.map(f => {
                      const on = msgFrame === f.id;
                      return (
                        <label key={f.id} style={{
                          display:"flex", flexDirection:"column", gap:3,
                          padding:"11px 14px", borderRadius:9, cursor:"pointer",
                          border: on ? `3px solid ${T.charcoal}` : `2px solid ${T.border}`,
                          background: on ? "#f5f3ff" : T.surface,
                          transition:"all 0.15s",
                        }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <input type="radio" name="msgFrame" value={f.id} checked={on}
                              onChange={() => setMsgFrame(on ? "" : f.id)}
                              onClick={() => { if(on) setMsgFrame(""); }}
                              style={{ width:18, height:18, accentColor:T.charcoal, cursor:"pointer", flexShrink:0 }} />
                            <span style={{ fontSize:15, fontWeight:900, color: on ? T.charcoal : T.text }}>{f.label}</span>
                          </div>
                          <span style={{ fontSize:12, color:T.textMute, paddingLeft:26, lineHeight:1.4 }}>{f.desc}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </section>

              {/* Rural AZ Style — AZ mode only. Replaces the old 15-county +
                  Rural Multi-County picker with a single toggle (Aug 2026
                  messaging-modifier revision). */}
              {msgMode === "az" && (
                <section style={S.card}>
                  <fieldset style={{ border:"none", padding:0 }}>
                    <legend style={S.label}>Rural AZ Style <span style={{ fontWeight:400, fontSize:13, textTransform:"none", letterSpacing:0, color:T.textMute }}>(optional — layers on top of Voice/Persona)</span><HelpTooltip text={HELP.messageMachine.countyVoice} label="Help: Rural AZ Style" /></legend>
                    <p style={{ ...S.hint, marginBottom:10 }}>Grounds the message in a shared rural Arizona voice — small towns, tribal communities, farm-and-ranch families. Stacks with Voice/Persona rather than replacing it. If your Issue/Content names a specific place, the model will keep any added place references within that same area.</p>
                    <label style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer", marginTop:4 }}>
                      <input type="checkbox" checked={!!formData.ruralStyle}
                        onChange={() => upd("ruralStyle", !formData.ruralStyle)}
                        style={{ width:24, height:24, accentColor:T.teal, cursor:"pointer", flexShrink:0 }} />
                      <span style={{ fontSize:18, fontWeight: formData.ruralStyle ? 700 : 400, color:T.text }}>Enable Rural AZ Style</span>
                    </label>
                  </fieldset>
                </section>
              )}

              {/* Audience + Voice */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 }}>
                <section style={S.card}>
                  <fieldset style={{ border:"none", padding:0 }}>
                    <legend style={S.label}>Target Audience <span style={{ fontWeight:400, fontSize:13, textTransform:"none", letterSpacing:0, color:T.textMute }}>(optional)</span><HelpTooltip text={HELP.messageMachine.audienceStyleTone} label="Help: Target Audience, Style & Tone" /></legend>
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
                  <label htmlFor="voice" style={S.label}>Voice / Persona<HelpTooltip text={HELP.messageMachine.voicePersona} label="Help: Voice / Persona" /></label>
                  <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                    {VOICE_PRESETS.map(p => {
                      const on = formData.voice === p.text;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => upd("voice", on ? "" : p.text)}
                          style={{
                            padding:"6px 14px", borderRadius:20, fontSize:13, fontWeight:700,
                            cursor:"pointer", fontFamily:"inherit",
                            background: on ? T.teal : "transparent",
                            color: on ? "#fff" : T.teal,
                            border: `1.5px solid ${T.teal}`,
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <input id="voice" type="text" style={S.input}
                    placeholder='e.g. "Rural AZ neighborly mom" or "GenZ activist"'
                    value={formData.voice} onChange={e=>upd("voice",e.target.value)} />
                  <p style={S.hint}>Who is speaking? Pick a preset to start, then edit freely — or write your own from scratch.</p>
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
                    <p style={{ ...S.hint, marginBottom:10 }}>Pick a word that describes the feeling behind the message</p>
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

              {/* Speaker Perspective */}
              <section style={S.card}>
                <fieldset style={{ border:"none", padding:0 }}>
                  <legend style={S.label}>Speaker Perspective <span style={{ fontWeight:400, fontSize:13, textTransform:"none", letterSpacing:0, color:T.textMute }}>(optional)</span></legend>
                  <div style={{ display:"flex", flexDirection:"column", gap:12, marginTop:8 }}>
                    {SPEAKER_PERSPECTIVES.map(sp => {
                      const on = formData.perspective === sp.id;
                      return (
                        <label key={sp.id} style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer" }}>
                          <input type="radio" name="perspective" value={sp.id} checked={on}
                            onChange={() => upd("perspective", on ? "" : sp.id)}
                            onClick={() => { if(on) upd("perspective",""); }}
                            style={{ width:22, height:22, accentColor:T.teal, cursor:"pointer", flexShrink:0 }} />
                          <span style={{ fontSize:18, color:T.text }}>
                            <span style={{ fontWeight: on ? 900 : 700 }}>{sp.label}</span>
                            <span style={{ fontWeight:400, color:T.textMute, fontSize:15 }}> — {sp.desc}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p style={S.hint}>This changes whether posts sound like a statement, a direct conversation, or a news update</p>
                </fieldset>
              </section>

              </div>
              )}

              {/* Platforms */}
              <section style={S.card}>
                <fieldset style={{ border:"none", padding:0 }}>
                  <legend style={S.label}>Platforms <span style={{color:T.red}} aria-label="required">*</span><HelpTooltip text={HELP.messageMachine.platforms} label="Help: Platforms" /></legend>
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
              <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginTop:8, alignItems:"center" }}>
                <button onClick={generateAll} disabled={generating} style={{
                  ...S.btnPrimary, flex:1, minWidth:200, fontSize:20, padding:"18px 24px",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:14,
                  opacity: generating ? 0.65 : 1, cursor: generating ? "not-allowed" : "pointer",
                }}>
                  Generate Messages →
                </button>
                <HelpTooltip text={HELP.messageMachine.generate} label="Help: Generate Messages" />
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
                {canPushToStorm && (
                  <span style={{ display:"inline-flex", alignItems:"center" }}>
                    <button onClick={openPushModal} style={{ ...S.btnSecondary, fontSize:15, padding:"9px 16px", borderColor:"var(--turquoise)", color:"var(--teal)" }}>
                      ⛈️ Push to Storm →
                    </button>
                    <HelpTooltip text={HELP.messageMachine.pushToStorm} label="Help: Push to Storm" />
                  </span>
                )}
                {/* Primary action — gold, right-aligned */}
                <span style={{ display:"inline-flex", alignItems:"center", marginLeft:"auto" }}>
                  <button onClick={()=>setSaveModal(true)} style={{ ...S.btnPrimary, fontSize:15, padding:"9px 18px" }}>
                    Save to Library
                  </button>
                  <HelpTooltip text={HELP.messageMachine.saveLibrary} label="Help: Save to Library" align="end" />
                </span>
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
              {/* Error panels in results view (from Expand/Shorten/Rephrase failures) */}
              {genError === "truncated" && (
                <div role="alert" style={{ background:"#fffbeb", border:`3px solid #c2670a`, borderRadius:12, padding:"18px 22px", position:"relative" }}>
                  <button onClick={() => setGenError(null)} aria-label="Dismiss" style={{ position:"absolute", top:12, right:14, background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#c2670a", fontWeight:900, fontFamily:"inherit" }}>✕</button>
                  <p style={{ fontSize:17, fontWeight:900, color:"#92400e", marginBottom:8 }}>✂️ Response cut off</p>
                  <p style={{ fontSize:15, color:T.textMid, lineHeight:1.6 }}>
                    Claude's reply was longer than it had room for — this isn't a timeout. Try again, or use <strong style={{ color:T.text }}>Shorten</strong> instead of Expand if the source content is long.
                  </p>
                </div>
              )}
              {genError === "connection" && (
                <div role="alert" style={{ background:"var(--terracotta-light)", border:`3px solid var(--terracotta)`, borderRadius:12, padding:"18px 22px", position:"relative" }}>
                  <button onClick={() => setGenError(null)} aria-label="Dismiss" style={{ position:"absolute", top:12, right:14, background:"none", border:"none", cursor:"pointer", fontSize:20, color:"var(--terracotta)", fontWeight:900, fontFamily:"inherit" }}>✕</button>
                  <p style={{ fontSize:17, fontWeight:900, color:"var(--terracotta)", marginBottom:8 }}>⚠️ Regeneration failed</p>
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
                  onCopy={copyText} onRegen={regenPlatform} loading={!!platLoad[p.id]}
                  contradictionNote={contradictionFlags[p.id]}
                  onDismissContradiction={() => dismissContradiction(p.id)} />
              ))}
            </div>

            {/* Hashtag Section */}
            <div style={{ marginTop:40, borderTop:`4px solid ${T.borderStrong}`, paddingTop:36 }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:16, marginBottom: hashtags || hashLoading ? 28 : 0 }}>
                <div>
                  <h3 style={{ fontSize:26, fontWeight:900, color:T.text, marginBottom:6 }}>Hashtag Suggestions<HelpTooltip text={HELP.messageMachine.hashtags} label="Help: Hashtag Suggestions" /></h3>
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

      {/* PUSH TO STORM MODAL */}
      {pushModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={e=>{ if(e.target===e.currentTarget && !pushLoading) setPushModal(false); }}>
          <div style={{ background:T.surface, border:`3px solid ${T.borderStrong}`, borderRadius:16, padding:36, maxWidth:520, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.35)", maxHeight:"80vh", overflowY:"auto" }}>
            <h3 style={{ fontSize:28, fontWeight:900, color:T.text, marginBottom:10 }}>⛈️ Push to Storm</h3>
            <p style={{ color:T.textMid, fontSize:16, marginBottom:22 }}>
              Sends these platform texts straight into a Storm post as a starting point. Media isn't included — add that afterward in Storm Posts.
            </p>

            {pushError && (
              <div style={{ background:"#fff5f5", border:"2px solid #b91c1c", borderRadius:10, padding:"12px 16px", color:"#b91c1c", fontSize:14.5, marginBottom:18 }}>
                {pushError}
              </div>
            )}

            <button onClick={pushToNewStorm} disabled={pushLoading} style={{
              ...S.btnPrimary, width:"100%", fontSize:17, padding:"14px", marginBottom:20,
              opacity:pushLoading?0.6:1, cursor:pushLoading?"not-allowed":"pointer",
            }}>
              + Create New Storm With This
            </button>

            <p style={{ fontSize:13, fontWeight:800, color:T.textMid, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>
              Or add to an existing storm
            </p>

            {pushLoading && pushStorms.length === 0 ? (
              <p style={{ color:T.textMute, fontSize:15, textAlign:"center", padding:"20px 0" }}>Loading storms…</p>
            ) : pushStorms.length === 0 ? (
              <p style={{ color:T.textMute, fontSize:15, textAlign:"center", padding:"10px 0" }}>No storms yet — create one above.</p>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:22 }}>
                {pushStorms.map(storm => (
                  <button key={storm.id} onClick={()=>pushToExistingStorm(storm)} disabled={pushLoading}
                    style={{
                      display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, textAlign:"left",
                      background:T.pageBg, border:`2px solid ${T.borderStrong}`, borderRadius:10, padding:"12px 16px",
                      cursor:pushLoading?"not-allowed":"pointer", opacity:pushLoading?0.6:1, fontFamily:"inherit",
                    }}>
                    <span style={{ fontWeight:700, color:T.text, fontSize:15 }}>{storm.title}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:T.textMute, textTransform:"capitalize", flexShrink:0 }}>{(storm.status||"draft").replace("_"," ")}</span>
                  </button>
                ))}
              </div>
            )}

            <button onClick={()=>{ if(!pushLoading){ setPushModal(false); setPushError(""); } }}
              style={{ ...S.btnSecondary, width:"100%", fontSize:16, padding:"12px", justifyContent:"center" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
