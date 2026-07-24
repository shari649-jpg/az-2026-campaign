// src/tools/sandbox/PromptSandboxPage.jsx
//
// Prompt Sandbox (Handoff #26 follow-up) — a freeform-prompt testing ground
// for Managers/Administrators, scoped to campaign/advocacy content the same
// way Storms is. Built so a manager can bring their own reusable rule-block
// (tone list, sentence-structure bans, etc.) and just adjust the small
// per-use fields — character count, hashtag, platform, post count — instead
// of retyping the whole thing every time. Presets let that rule-block be
// saved and reloaded.
//
// Deliberately NOT wired into Storms yet — this is the "get a feel for what
// works" sandbox mentioned in Handoff #26; if a pattern proves out here it
// gets built into Storms properly later, per that conversation.

import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { auth } from "../../firebase";
import {
  savePreset, loadPresets, updatePreset, deletePreset, PLATFORMS, CHAR_LIMITS,
} from "../../lib/sandboxLibrary";
import {
  JSON_ONLY_INSTRUCTION, JSON_ESCAPING_INSTRUCTION, HASHTAG_BODY_BAN, contradictionFlagFormat,
  lengthTargetHint, detectBannedStructures, AI_TELL_PHRASING_BAN,
} from "../../lib/messageRules";

const PURPLE      = "var(--purple)";
const TEAL        = "var(--teal)";
const CHARCOAL    = "var(--charcoal)";
const TERRACOTTA  = "var(--terracotta)";
const GOLD        = "var(--gold)";
const BORDER      = "var(--border)";
const SURFACE_ALT = "var(--surface-alt)";

function buildSandboxPrompt({ promptText, charMin, charMax, hashtag, platform, postCount }) {
  const platformDef = PLATFORMS.find(p => p.key === platform);
  const lines = [
    "You are an expert political messaging strategist working for a legitimate political campaign coalition's internal content sandbox.",
    "",
    promptText.trim(),
    "",
  ];

  const constraints = [];
  if (charMin || charMax) {
    constraints.push(`${lengthTargetHint(charMin, charMax)} (counting spaces, excluding the hashtag below.)`);
  }
  if (platformDef) {
    const platformLimit = CHAR_LIMITS[platform];
    constraints.push(`Written for ${platformDef.label}${platformLimit ? ` (platform max ${platformLimit} characters)` : ""}. Match its natural voice and rhythm.`);
  }
  if (hashtag) {
    constraints.push(`The hashtag #${hashtag.replace(/^#/, "")} will be appended after generation — do not include it in the post body and do not count it toward the character limit.`);
  } else {
    constraints.push(HASHTAG_BODY_BAN);
  }
  constraints.push(`Generate ${postCount} distinct post${postCount === 1 ? "" : "s"} — no two should feel formulaic or reuse the same structure.`);

  lines.push(...constraints, "");

  // Placed last, right before the JSON contract, deliberately — instructions
  // near the end of a prompt get more consistent adherence than the same
  // instruction stated once earlier and buried under everything after it.
  // This doesn't replace the freeform prompt's own rules; it re-surfaces
  // the two failure modes real testing actually produced (undershooting
  // length, and the banned "X, not Y" framing slipping through) right
  // before generation.
  const reminders = [`Before finalizing, silently re-check each post against every rule stated above — including any banned sentence structures or phrasing rules — and revise any post that violates one.`];
  if (charMin || charMax) reminders.push(lengthTargetHint(charMin, charMax));
  lines.push("FINAL CHECK:", ...reminders, "");

  lines.push(JSON_ESCAPING_INSTRUCTION);
  lines.push(JSON_ONLY_INSTRUCTION);
  lines.push(`Format: {"posts": ["post text", "post text", ...]}`);
  lines.push(contradictionFlagFormat("posts"));

  return lines.filter(Boolean).join("\n");
}

// One retry pass for any post that came back under the minimum. Real
// testing showed models reliably undershoot a character-count target
// (every post short, none over), so this isn't an edge case worth just
// flagging — it's the expected outcome often enough that the app should
// try to fix it once automatically before falling back to a visible flag.
async function expandPost(text, min, max, hashtagContext) {
  const prompt = [
    `Rewrite the post below so it lands ${max ? `between ${min} and ${max}` : `at least ${min}`} characters (counting spaces, excluding any hashtag). It currently runs short. Keep the same meaning, tone, and voice — add one more concrete detail or consequence to reach length rather than padding with filler or hedging.`,
    "",
    `CURRENT POST (${text.length} characters):`,
    text,
    "",
    hashtagContext ? HASHTAG_BODY_BAN : "",
    JSON_ESCAPING_INSTRUCTION,
    JSON_ONLY_INSTRUCTION,
    `Format: {"post": "rewritten post text"}`,
  ].filter(Boolean).join("\n");

  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const res = await fetch("/.netlify/functions/generate-sandbox-text", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error || !data.content) return null;
  const raw = data.content.map(i => i.text || "").join("");
  const cleaned = raw.replace(/```json|```/g, "").trim();
  if (!cleaned.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed.post === "string" ? parsed.post : null;
  } catch {
    return null;
  }
}

// Second-pass AI judge (opt-in, Sandbox-only for now — see "verify with a
// second AI check" toggle below). The regex in detectBannedStructures is
// fast and free but only catches phrasings someone has actually seen and
// encoded; a model asked directly "does this violate the rule?" leans on
// what models are actually good at — recognizing a pattern on request —
// instead of what they're bad at, which is never producing it unprompted.
// This costs one extra API call per post, which is exactly the tradeoff
// being tested here before deciding whether it's worth wiring in
// everywhere else. Kept intentionally simple: it flags, it doesn't
// rewrite — an auto-rewrite step would be a second cost decision on top
// of this one.
async function judgePost(text) {
  const prompt = [
    "You are reviewing a single political social media post for a phrasing quality check. Be direct and honest — the goal is catching real instances a writer would want to fix, not being lenient or hedging.",
    "",
    AI_TELL_PHRASING_BAN,
    "",
    "POST TO REVIEW:",
    text,
    "",
    "Does this specific post violate the rule above?",
    JSON_ONLY_INSTRUCTION,
    `Format: {"violates": true or false, "reason": "one-sentence explanation naming the exact phrase, or empty string if it does not violate"}`,
  ].join("\n");

  const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const res = await fetch("/.netlify/functions/generate-sandbox-text", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error || !data.content) return null;
  const raw = data.content.map(i => i.text || "").join("");
  const cleaned = raw.replace(/```json|```/g, "").trim();
  if (!cleaned.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(cleaned);
    return typeof parsed.violates === "boolean" ? parsed : null;
  } catch {
    return null;
  }
}

export default function PromptSandboxPage() {
  const { user, isManager } = useAuth();

  const [promptText, setPromptText] = useState("");
  const [charMin, setCharMin]       = useState("");
  const [charMax, setCharMax]       = useState("");
  const [hashtag, setHashtag]       = useState("");
  const [platform, setPlatform]     = useState("");
  const [postCount, setPostCount]   = useState(3);
  const [useJudge, setUseJudge]     = useState(false); // opt-in second-pass AI check — off by default so cost is a deliberate choice, not a default

  const [presets, setPresets]           = useState([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName]     = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  const [results, setResults]           = useState([]); // [{text, valid}]
  const [callCount, setCallCount]       = useState(null); // total API calls this run (generate + expand retries + judge), shown so the cost tradeoff is visible
  const [contradictionFlags, setContradictionFlags] = useState({});
  const [scopeDeclined, setScopeDeclined] = useState("");
  const [generating, setGenerating]     = useState(false);
  const [notice, setNotice]             = useState(null); // { type, msg }
  const [copiedIdx, setCopiedIdx]       = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setPresetsLoading(true);
      try {
        const p = await loadPresets(user.uid);
        setPresets(p);
      } catch {
        setNotice({ type: "error", msg: "Couldn't load saved presets." });
      }
      setPresetsLoading(false);
    })();
  }, [user]);

  if (!isManager) {
    return (
      <div style={{ maxWidth: 640, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", color: PURPLE }}>Manager/Administrator access only</h2>
        <p style={{ color: CHARCOAL }}>The Prompt Sandbox isn't available for your role.</p>
      </div>
    );
  }

  function applyPreset(id) {
    setSelectedPresetId(id);
    if (!id) return;
    const p = presets.find(x => x.id === id);
    if (!p) return;
    setPromptText(p.promptText || "");
    setCharMin(p.charMin ?? "");
    setCharMax(p.charMax ?? "");
    setHashtag(p.hashtag || "");
    setPlatform(p.platform || "");
    setPostCount(p.postCount || 1);
    setPresetName(p.name || "");
  }

  async function handleSavePreset() {
    if (!presetName.trim()) {
      setNotice({ type: "error", msg: "Give this preset a name before saving." });
      return;
    }
    setSavingPreset(true);
    const data = { name: presetName.trim(), promptText, charMin: charMin || null, charMax: charMax || null, hashtag, platform, postCount };
    try {
      if (selectedPresetId) {
        await updatePreset(user.uid, selectedPresetId, data);
      } else {
        const id = await savePreset(user.uid, data);
        setSelectedPresetId(id);
      }
      const p = await loadPresets(user.uid);
      setPresets(p);
      setNotice({ type: "success", msg: "Preset saved." });
    } catch {
      setNotice({ type: "error", msg: "Couldn't save the preset — try again." });
    }
    setSavingPreset(false);
  }

  async function handleDeletePreset() {
    if (!selectedPresetId) return;
    try {
      await deletePreset(user.uid, selectedPresetId);
      setPresets(await loadPresets(user.uid));
      setSelectedPresetId("");
      setPresetName("");
    } catch {
      setNotice({ type: "error", msg: "Couldn't delete the preset." });
    }
  }

  async function handleGenerate() {
    if (!promptText.trim()) {
      setNotice({ type: "error", msg: "Enter a prompt first." });
      return;
    }
    setGenerating(true);
    setNotice(null);
    setResults([]);
    setContradictionFlags({});
    setScopeDeclined("");
    setCallCount(null);
    let calls = 0; // total API calls this run — generate + expand retries + judge — surfaced at the end so the cost tradeoff of the judge toggle is visible, not assumed

    const prompt = buildSandboxPrompt({ promptText, charMin, charMax, hashtag, platform, postCount });

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/.netlify/functions/generate-sandbox-text", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({ max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
      });
      calls++;

      if (res.status === 429) {
        const limitData = await res.json();
        setNotice({ type: "error", msg: limitData.error || "Daily generation limit reached." });
        setGenerating(false);
        return;
      }
      if (res.status === 403) {
        const d = await res.json();
        setNotice({ type: "error", msg: d.error });
        setGenerating(false);
        return;
      }

      const data = await res.json();
      if (data.error) {
        setNotice({ type: "error", msg: data.error });
        setGenerating(false);
        return;
      }
      let usageMsg = null;
      if (data.usageWarning) {
        const { used, limit, remaining } = data.usageWarning;
        usageMsg = `${used}/${limit} daily AI calls used — ${remaining} remaining.`;
        setNotice({ type: "warning", msg: usageMsg });
      }

      const text = data.content.map(i => i.text || "").join("");
      const cleaned = text.replace(/```json|```/g, "").trim();
      if (!cleaned.startsWith("{")) {
        setNotice({ type: "error", msg: "The response wasn't returned in the expected format. Try rephrasing the prompt." });
        setGenerating(false);
        return;
      }
      const parsed = JSON.parse(cleaned);

      if (parsed._scopeDeclined) {
        setScopeDeclined(parsed._scopeDeclined);
        setGenerating(false);
        return;
      }

      const posts = Array.isArray(parsed.posts) ? parsed.posts : [];
      const max = charMax ? parseInt(charMax, 10) : null;
      const min = charMin ? parseInt(charMin, 10) : null;

      // Real testing showed the model reliably undershoots length targets
      // rather than occasionally missing — worth one automatic retry per
      // short post before just flagging it. Sequential, not parallel, so
      // this doesn't burn through rate limit any faster than necessary.
      let expandedCount = 0;
      const finalTexts = [];
      for (const t of posts) {
        if (min && t.length < min) {
          setNotice({ type: "warning", msg: `Expanding a post that came back short (${t.length}/${min} min)…` });
          const expanded = await expandPost(t, min, max, !!hashtag);
          calls++;
          if (expanded) { finalTexts.push(expanded); expandedCount++; }
          else finalTexts.push(t);
        } else {
          finalTexts.push(t);
        }
      }

      // Opt-in second-pass AI judge — one extra call PER POST, sequential
      // so a slow/failed judge call doesn't fan out into a burst. This is
      // the actual cost being tested: turning this on roughly doubles the
      // API calls (and daily-limit usage) this button press consumes.
      const judgeResults = [];
      if (useJudge) {
        for (let i = 0; i < finalTexts.length; i++) {
          setNotice({ type: "warning", msg: `Running AI verification check (${i + 1}/${finalTexts.length})…` });
          const verdict = await judgePost(finalTexts[i]);
          calls++;
          judgeResults.push(verdict);
        }
      }

      setResults(finalTexts.map((t, i) => ({
        text: t,
        valid: (!max || t.length <= max) && (!min || t.length >= min),
        structureFlags: detectBannedStructures(t),
        judgeFlag: useJudge ? (judgeResults[i]?.violates ? (judgeResults[i].reason || "Flagged by AI check.") : null) : null,
        judgeUnavailable: useJudge && judgeResults[i] === null,
      })));
      if (parsed._contradictionFlags) setContradictionFlags(parsed._contradictionFlags);
      setCallCount(calls);
      if (expandedCount > 0) {
        setNotice({ type: "success", msg: `${expandedCount} post${expandedCount === 1 ? "" : "s"} auto-expanded to meet the minimum — still worth a read before using.${usageMsg ? ` (${usageMsg})` : ""}` });
      } else if (usageMsg) {
        setNotice({ type: "warning", msg: usageMsg });
      } else {
        setNotice(null);
      }
    } catch (err) {
      setNotice({ type: "error", msg: "Generation failed — try again." });
    }
    setGenerating(false);
  }

  function copyPost(idx, text) {
    const withTag = hashtag ? `${text} #${hashtag.replace(/^#/, "")}` : text;
    navigator.clipboard.writeText(withTag);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }

  const inputStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: "var(--font-body)",
  };
  const labelStyle = { fontSize: 13, fontWeight: 700, color: PURPLE, marginBottom: 6, display: "block" };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 80px" }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          color: TEAL, background: "var(--teal-light)", padding: "4px 10px", borderRadius: 20,
        }}>
          Manager / Administrator only · Sandbox
        </span>
      </div>
      <h1 style={{ fontFamily: "var(--font-display)", color: PURPLE, marginBottom: 4 }}>Prompt Sandbox</h1>
      <p style={{ color: CHARCOAL, marginBottom: 28, maxWidth: 640 }}>
        Bring your own freeform prompt. Character count, hashtag, platform, and post count get layered in
        automatically — factual-accuracy and campaign-scope rules always apply underneath, regardless of what's typed below.
      </p>

      {/* Presets */}
      <div style={{ background: "var(--surface)", border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <label style={labelStyle}>Saved presets</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={selectedPresetId}
            onChange={e => applyPreset(e.target.value)}
            disabled={presetsLoading}
            style={{ ...inputStyle, width: "auto", minWidth: 220, flex: "1 1 220px" }}
          >
            <option value="">— New / unsaved —</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            placeholder="Preset name"
            value={presetName}
            onChange={e => setPresetName(e.target.value)}
            style={{ ...inputStyle, width: "auto", flex: "1 1 180px" }}
          />
          <button onClick={handleSavePreset} disabled={savingPreset} style={{
            background: PURPLE, color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>
            {savingPreset ? "Saving…" : selectedPresetId ? "Update preset" : "Save preset"}
          </button>
          {selectedPresetId && (
            <button onClick={handleDeletePreset} style={{
              background: "none", color: TERRACOTTA, border: `1px solid ${TERRACOTTA}`,
              borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Freeform prompt */}
      <label style={labelStyle}>Freeform prompt</label>
      <textarea
        value={promptText}
        onChange={e => setPromptText(e.target.value)}
        placeholder={`Write social media posts for a social storm about... Each post must:\n• Use a distinct emotional tone...\n• Sound like a real, furious, heartbroken, or fed-up human wrote it...`}
        rows={10}
        style={{ ...inputStyle, marginBottom: 20, resize: "vertical", lineHeight: 1.5 }}
      />

      {/* Structured fields */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
        <div>
          <label style={labelStyle}>Min characters</label>
          <input type="number" min="0" value={charMin} onChange={e => setCharMin(e.target.value)} style={inputStyle} placeholder="e.g. 250" />
        </div>
        <div>
          <label style={labelStyle}>Max characters</label>
          <input type="number" min="0" value={charMax} onChange={e => setCharMax(e.target.value)} style={inputStyle} placeholder="e.g. 300" />
        </div>
        <div>
          <label style={labelStyle}>Hashtag (optional)</label>
          <input value={hashtag} onChange={e => setHashtag(e.target.value.replace(/^#/, ""))} style={inputStyle} placeholder="RepublicanCostOfCorruption" />
        </div>
        <div>
          <label style={labelStyle}>Platform (optional)</label>
          <select value={platform} onChange={e => setPlatform(e.target.value)} style={inputStyle}>
            <option value="">Not platform-specific</option>
            {PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Number of posts</label>
          <input type="number" min="1" max="10" value={postCount} onChange={e => setPostCount(parseInt(e.target.value, 10) || 1)} style={inputStyle} />
        </div>
      </div>

      <label style={{
        display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20,
        padding: "12px 16px", background: SURFACE_ALT, borderRadius: 10, cursor: "pointer",
      }}>
        <input type="checkbox" checked={useJudge} onChange={e => setUseJudge(e.target.checked)} style={{ marginTop: 3 }} />
        <span style={{ fontSize: 13, color: CHARCOAL, lineHeight: 1.5 }}>
          <strong style={{ color: PURPLE }}>Also verify each post with a second AI check</strong> — asks Claude directly whether each post violates the phrasing rules, in addition to the regex check. Catches paraphrases the regex misses, but costs <strong>one extra API call per post</strong> (counts against the daily limit). Off by default so the cost is a choice, not a default.
        </span>
      </label>

      <button
        onClick={handleGenerate}
        disabled={generating}
        style={{
          background: generating ? "#aaa" : PURPLE, color: "#fff", border: "none", borderRadius: 10,
          padding: "14px 28px", fontWeight: 700, fontSize: 15, cursor: generating ? "not-allowed" : "pointer",
          marginBottom: 12,
        }}
      >
        {generating ? "Generating…" : "Generate"}
      </button>

      {callCount !== null && (
        <p style={{ fontSize: 12.5, color: "#8A7F92", marginBottom: 20 }}>
          This run used <strong>{callCount}</strong> API call{callCount === 1 ? "" : "s"} total
          {useJudge ? " (generation + expand retries, if any + 1 verification check per post)" : " (generation + expand retries, if any)"} — each counts against your daily limit.
        </p>
      )}

      {notice && (
        <div style={{
          background: notice.type === "error" ? "#fdf2f2" : notice.type === "warning" ? "var(--gold-light)" : "#f0faf5",
          border: `1px solid ${notice.type === "error" ? "#f5c6c6" : notice.type === "warning" ? GOLD : "#a8dfc0"}`,
          color: notice.type === "error" ? "#c41e1e" : CHARCOAL,
          borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 14,
        }}>
          {notice.msg}
        </div>
      )}

      {scopeDeclined && (
        <div style={{ background: SURFACE_ALT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
          <strong style={{ color: PURPLE }}>Out of scope:</strong> <span style={{ color: CHARCOAL }}>{scopeDeclined}</span>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {results.map((r, idx) => {
            const hasStructureFlag = r.structureFlags && r.structureFlags.length > 0;
            const hasJudgeFlag = !!r.judgeFlag;
            const flagged = !r.valid || hasStructureFlag || hasJudgeFlag;
            return (
              <div key={idx} style={{
                background: "#fff", border: `1px solid ${flagged ? TERRACOTTA : BORDER}`,
                borderRadius: 10, padding: 16,
              }}>
                <p style={{ color: CHARCOAL, whiteSpace: "pre-wrap", marginBottom: 10, lineHeight: 1.6 }}>{r.text}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: r.valid ? TEAL : TERRACOTTA }}>
                    {r.text.length} characters{!r.valid && " — outside range"}
                  </span>
                  <button onClick={() => copyPost(idx, r.text)} style={{
                    background: "none", border: `1px solid ${PURPLE}`, color: PURPLE,
                    borderRadius: 6, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
                  }}>
                    {copiedIdx === idx ? "Copied!" : "Copy"}
                  </button>
                </div>
                {hasStructureFlag && (
                  <p style={{ marginTop: 10, fontSize: 13, color: TERRACOTTA }}>
                    <strong>Regex flag:</strong> matches {r.structureFlags.join(", ")} — worth a manual reword.
                  </p>
                )}
                {hasJudgeFlag && (
                  <p style={{ marginTop: 10, fontSize: 13, color: PURPLE }}>
                    <strong>🧑‍⚖️ AI check flag:</strong> {r.judgeFlag}
                  </p>
                )}
                {r.judgeUnavailable && (
                  <p style={{ marginTop: 10, fontSize: 12, color: "#8A7F92", fontStyle: "italic" }}>
                    AI verification check didn't return a usable answer for this post — not flagged, but not confirmed clean either.
                  </p>
                )}
                {contradictionFlags.posts && idx === 0 && (
                  <p style={{ marginTop: 10, fontSize: 13, color: TERRACOTTA }}>
                    <strong>Possible self-contradiction:</strong> {contradictionFlags.posts}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
