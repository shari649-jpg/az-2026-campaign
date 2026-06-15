// src/components/ConversationCoach.jsx
// Floating "The Coach" widget — sits in AppShell, available on every page

import { useState, useRef, useEffect } from "react";

const TEAL       = "#1D5C4A";
const TEAL_MID   = "#3ECFB2";
const GOLD       = "#F5C842";
const CHARCOAL   = "#4A4558";
const TERRA      = "#C1673A";
const TEAL_LIGHT = "#E1F5EE";

const API_URL = "/.netlify/functions/coaching-response";

// ── Configuration ────────────────────────────────────────────────────────────

const PERSONAS_ENGAGE = [
  { id: "coworker", label: "Republican co-worker",  desc: "Skeptical but open — you have an ongoing relationship",        emoji: "👔" },
  { id: "neighbor", label: "Rural neighbor",          desc: "Values community and self-reliance; distrustful of politics", emoji: "🏡" },
  { id: "fair",     label: "Stranger at an event",    desc: "Tabling, fair, protest — first contact, no shared history",  emoji: "🎪" },
];

const PERSONAS_TROLL = [
  { id: "bot",        label: "Bot / agitator",       desc: "Low-follower, coordinated, not engaging in good faith", emoji: "🤖" },
  { id: "realpeople", label: "Real hostile person",   desc: "Angry but real — lurkers are watching this exchange",    emoji: "😤" },
];

const TONES_ENGAGE = [
  { id: "build-trust", label: "Build trust",        desc: "Values-first, calibrated questions, common ground" },
  { id: "scorched",    label: "Push back hard",      desc: "Challenge assumptions without losing the relationship" },
  { id: "lurkers",     label: "Talk to the room",    desc: "Your reply is for observers, not just this person" },
];

const TONES_TROLL = [
  { id: "adult",    label: "Adult in the room", desc: "Calm and factual — credible to neutral observers" },
  { id: "pushback", label: "Firm pushback",     desc: "Correct the record, don't back down" },
  { id: "ignore",   label: "Don't engage",      desc: "Sometimes silence (or brevity) wins" },
];

const OPENER_INTROS = {
  coworker:   "Hey, I know we don't always see eye to eye — but I'm curious what you actually think about",
  neighbor:   "I've been thinking about something that affects all of us around here, regardless of party…",
  fair:       "Thanks for stopping! Quick question — what's the issue that matters most to you in your community?",
};

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  fab: {
    position: "fixed",
    bottom: 28,
    right: 28,
    width: 54,
    height: 54,
    borderRadius: "50%",
    background: TEAL,
    border: `3px solid ${GOLD}`,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
    boxShadow: "0 4px 16px rgba(29,92,74,0.35)",
    transition: "transform 0.15s, background 0.15s",
    fontSize: 22,
  },
  panel: {
    position: "fixed",
    bottom: 92,
    right: 28,
    width: 340,
    maxHeight: "80vh",
    background: "var(--bg, #fff)",
    border: `1.5px solid ${TEAL}`,
    borderRadius: 16,
    display: "flex",
    flexDirection: "column",
    zIndex: 999,
    boxShadow: "0 8px 32px rgba(29,92,74,0.18)",
    overflow: "hidden",
  },
  header: {
    background: TEAL,
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
  },
  body: {
    padding: "14px",
    overflowY: "auto",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: CHARCOAL,
    marginBottom: 6,
    opacity: 0.7,
  },
  choiceBtn: (selected) => ({
    width: "100%",
    padding: "9px 12px",
    borderRadius: 8,
    border: selected ? `1.5px solid ${TEAL}` : "1px solid #ddd",
    background: selected ? TEAL_LIGHT : "transparent",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s",
    marginBottom: 6,
  }),
  chip: (selected, color) => ({
    flex: 1,
    padding: "8px 6px",
    borderRadius: 8,
    border: selected ? `1.5px solid ${color || TEAL}` : "1px solid #ddd",
    background: selected ? (color ? color + "22" : TEAL_LIGHT) : "transparent",
    cursor: "pointer",
    fontSize: 12,
    textAlign: "center",
    transition: "all 0.15s",
    lineHeight: 1.4,
  }),
  primaryBtn: (disabled) => ({
    width: "100%",
    padding: "10px",
    background: disabled ? "#ccc" : TEAL,
    color: "white",
    border: "none",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.04em",
    transition: "background 0.15s",
  }),
  bubble: (isUser) => ({
    maxWidth: "88%",
    padding: "8px 11px",
    borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
    background: isUser ? TEAL : "var(--surface-alt, #f4f3f0)",
    color: isUser ? "white" : CHARCOAL,
    fontSize: 13,
    lineHeight: 1.55,
    alignSelf: isUser ? "flex-end" : "flex-start",
    whiteSpace: "pre-wrap",
  }),
  coachNote: {
    fontSize: 11,
    color: TEAL,
    background: TEAL_LIGHT,
    border: `1px solid ${TEAL_MID}`,
    borderRadius: 8,
    padding: "6px 9px",
    lineHeight: 1.5,
    alignSelf: "flex-start",
    maxWidth: "92%",
  },
  textarea: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #ddd",
    fontSize: 13,
    fontFamily: "inherit",
    color: CHARCOAL,
    background: "var(--surface-alt, #f9f9f7)",
    resize: "none",
    lineHeight: 1.5,
    outline: "none",
  },
};

// ── Main component ────────────────────────────────────────────────────────────

export default function ConversationCoach() {
  const [open, setOpen]               = useState(false);
  const [step, setStep]               = useState(1); // 1=situation, 2=persona, 3=tone, 4=chat
  const [situation, setSituation]     = useState(null);
  const [persona, setPersona]         = useState(null);
  const [tone, setTone]               = useState(null);
  const [pastedContent, setPastedContent] = useState("");
  const [starterText, setStarterText] = useState("");
  const [messages, setMessages]       = useState([]); // {role, content, isCoachNote?}
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);
  const [inputText, setInputText]     = useState("");
  const threadRef = useRef(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, loading]);

  function reset() {
    setStep(1); setSituation(null); setPersona(null); setTone(null);
    setPastedContent(""); setStarterText(""); setMessages([]);
    setError(null); setInputText("");
  }

  // ── API call ──────────────────────────────────────────────────────────────

  async function callCoach({ history, userMessage, isFirst }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          situation,
          persona,
          tone,
          pastedContent: pastedContent || "",
          history: history || [],
          userMessage: userMessage || "",
        }),
      });
      const data = await res.json();
      const text = data?.content?.[0]?.text || "";
      if (!text) throw new Error("Empty response from coach");

      // Split coaching notes (wrapped in [...]) from main reply
      const coachNoteMatch = text.match(/\[([^\]]+)\]\s*$/);
      const mainText = coachNoteMatch
        ? text.slice(0, text.lastIndexOf("[" + coachNoteMatch[1])).trim()
        : text.trim();
      const noteText = coachNoteMatch ? coachNoteMatch[1].trim() : null;

      const newMessages = [];
      if (mainText) newMessages.push({ role: "assistant", content: mainText });
      if (noteText) newMessages.push({ role: "assistant", content: noteText, isCoachNote: true });
      setMessages(prev => [...prev, ...newMessages]);
    } catch (e) {
      setError("Connection error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Launch chat ───────────────────────────────────────────────────────────

  async function launch() {
    if (!tone) return;
    setStep(4);

    if (situation === "troll") {
      // Troll mode: generate the draft response immediately
      await callCoach({ history: [], isFirst: true });
    } else {
      // Engage mode: coach opens in character
      const opener = OPENER_INTROS[persona] || "Let's start this conversation. How would you like to open?";
      const openMsg = starterText
        ? `The user wants to open with something about: "${starterText}". Start the conversation as ${persona}, responding naturally to that opener or prompting them to begin.`
        : `Start the conversation. Open as the ${persona} character. Keep it brief and natural.`;

      await callCoach({ history: [], userMessage: openMsg, isFirst: true });
    }
  }

  // ── Send user message ─────────────────────────────────────────────────────

  async function sendMessage() {
    const text = inputText.trim();
    if (!text || loading) return;
    setInputText("");
    const userMsg = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);

    // Build history for context (only non-coachNote messages)
    const history = [...messages, userMsg]
      .filter(m => !m.isCoachNote)
      .map(m => ({ role: m.role, content: m.content }));

    await callCoach({ history, userMessage: text });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const toneOptions = situation === "troll" ? TONES_TROLL : TONES_ENGAGE;
  const personaOptions = situation === "troll" ? PERSONAS_TROLL : PERSONAS_ENGAGE;

  return (
    <>
      {/* FAB */}
      <button
        style={S.fab}
        title="Open The Coach"
        onClick={() => { setOpen(o => !o); if (!open) reset(); }}
        aria-label="Open conversation coach"
      >
        🧭
      </button>

      {/* Panel */}
      {open && (
        <div style={S.panel} role="dialog" aria-label="The Coach">

          {/* Header */}
          <div style={S.header}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: GOLD, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 16,
              }}>🧭</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "white", letterSpacing: "0.02em" }}>
                  The Coach
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
                  {step === 4
                    ? situation === "troll" ? "Social media response helper" : `Practice: ${persona || "conversation"}`
                    : "Conversation practice & response help"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {step > 1 && step < 4 && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
                  aria-label="Back"
                >←</button>
              )}
              {step === 4 && (
                <button
                  onClick={reset}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 11, letterSpacing: "0.04em" }}
                >start over</button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 20, lineHeight: 1, paddingLeft: 4 }}
                aria-label="Close"
              >✕</button>
            </div>
          </div>

          {/* Body */}
          <div style={S.body} ref={step === 4 ? threadRef : null}>

            {/* Step 1 — Situation */}
            {step === 1 && (
              <div>
                <div style={S.stepLabel}>What's the situation?</div>
                <button
                  style={S.choiceBtn(situation === "engage")}
                  onClick={() => { setSituation("engage"); setStep(2); }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: situation === "engage" ? TEAL : CHARCOAL, marginBottom: 3 }}>
                    🤝 Community conversation
                  </div>
                  <div style={{ fontSize: 12, color: "#777", lineHeight: 1.4 }}>
                    Practice talking across differences — neighbor, co-worker, stranger at an event
                  </div>
                </button>
                <button
                  style={S.choiceBtn(situation === "troll")}
                  onClick={() => { setSituation("troll"); setStep(2); }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: situation === "troll" ? TEAL : CHARCOAL, marginBottom: 3 }}>
                    🛡️ Responding to a comment
                  </div>
                  <div style={{ fontSize: 12, color: "#777", lineHeight: 1.4 }}>
                    Paste in an attack or hostile reply and get a draft response
                  </div>
                </button>
              </div>
            )}

            {/* Step 2 — Persona + (troll: paste) */}
            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {situation === "troll" && (
                  <div>
                    <div style={S.stepLabel}>Paste the comment you received</div>
                    <textarea
                      style={{ ...S.textarea, minHeight: 80 }}
                      placeholder="Paste the tweet, reply, or comment here…"
                      value={pastedContent}
                      onChange={e => setPastedContent(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}
                <div>
                  <div style={S.stepLabel}>
                    {situation === "troll" ? "Who sent it?" : "Who are you talking to?"}
                  </div>
                  {personaOptions.map(p => (
                    <button
                      key={p.id}
                      style={S.choiceBtn(persona === p.id)}
                      onClick={() => { setPersona(p.id); setStep(3); }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, color: persona === p.id ? TEAL : CHARCOAL, marginBottom: 2 }}>
                        {p.emoji} {p.label}
                      </div>
                      <div style={{ fontSize: 12, color: "#777", lineHeight: 1.4 }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3 — Tone + launch */}
            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={S.stepLabel}>How do you want to respond?</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {toneOptions.map((t, i) => {
                      const colors = [TEAL, TERRA, GOLD];
                      const c = colors[i];
                      return (
                        <button
                          key={t.id}
                          style={S.chip(tone === t.id, c)}
                          onClick={() => setTone(t.id)}
                        >
                          <div style={{ fontWeight: 700, fontSize: 12, color: tone === t.id ? c : CHARCOAL, marginBottom: 2 }}>
                            {t.label}
                          </div>
                          <div style={{ fontSize: 11, color: "#888", lineHeight: 1.3 }}>{t.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {situation === "engage" && (
                  <div>
                    <div style={S.stepLabel}>Opening topic (optional)</div>
                    <textarea
                      style={{ ...S.textarea, minHeight: 56 }}
                      placeholder={`e.g. "water rights" or "healthcare costs in our area"`}
                      value={starterText}
                      onChange={e => setStarterText(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}

                <button
                  style={S.primaryBtn(!tone)}
                  disabled={!tone}
                  onClick={launch}
                >
                  {situation === "troll" ? "Generate my response →" : "Start practice session →"}
                </button>
              </div>
            )}

            {/* Step 4 — Chat */}
            {step === 4 && (
              <>
                {/* Thread */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                  {messages.map((m, i) => (
                    m.isCoachNote
                      ? <div key={i} style={S.coachNote}>💡 {m.content}</div>
                      : <div key={i} style={S.bubble(m.role === "user")}>{m.content}</div>
                  ))}
                  {loading && (
                    <div style={{ ...S.bubble(false), opacity: 0.5, fontStyle: "italic" }}>
                      thinking…
                    </div>
                  )}
                  {error && (
                    <div style={{ fontSize: 12, color: TERRA, padding: "6px 10px", background: "#fff0ec", borderRadius: 8 }}>
                      {error}
                    </div>
                  )}
                </div>

                {/* Input — only for engage mode (troll mode shows copy button) */}
                {situation === "engage" ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 4, flexShrink: 0 }}>
                    <input
                      type="text"
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder="Your reply…"
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        fontSize: 13,
                        fontFamily: "inherit",
                        color: CHARCOAL,
                        background: "var(--surface-alt, #f9f9f7)",
                        outline: "none",
                      }}
                      disabled={loading}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={loading || !inputText.trim()}
                      style={{
                        padding: "8px 12px",
                        background: TEAL,
                        color: "white",
                        border: "none",
                        borderRadius: 8,
                        cursor: loading || !inputText.trim() ? "not-allowed" : "pointer",
                        fontSize: 13,
                        opacity: loading || !inputText.trim() ? 0.5 : 1,
                      }}
                    >Send</button>
                  </div>
                ) : (
                  // Troll mode: copy button + try again
                  !loading && messages.length > 0 && (
                    <div style={{ display: "flex", gap: 8, marginTop: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          const draft = messages.find(m => !m.isCoachNote && m.role === "assistant");
                          if (draft) navigator.clipboard.writeText(draft.content);
                        }}
                        style={{ flex: 1, padding: "8px", background: GOLD, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: CHARCOAL }}
                      >
                        📋 Copy response
                      </button>
                      <button
                        onClick={() => { setMessages([]); callCoach({ history: [], isFirst: true }); }}
                        style={{ padding: "8px 10px", background: "transparent", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontSize: 12, color: CHARCOAL }}
                      >
                        ↺ Try again
                      </button>
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
