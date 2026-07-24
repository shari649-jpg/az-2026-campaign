// src/lib/messageRules.js
//
// Shared, tool-agnostic prompt fragments — the sibling to guardrails.js
// flagged in Handoff #26 (§4 / punch list "Shared message-rules file").
// guardrails.js owns FACTUAL_ACCURACY_GUARDRAIL (a content-truth rule).
// This file owns everything that isn't about truth: who we are, how the
// model must format its response, and — new with the Prompt Sandbox —
// what topics the model is allowed to write about at all.
//
// Consolidation is intentionally partial (per Handoff #26): this pulls in
// the JSON-escaping fix and the hashtag-ban wording that were duplicated/
// inconsistent across Message Machine, Rebuttal, and Storms. It does NOT
// touch platform-voice personas — that's flagged as a separate, bigger
// decision and stays out of this file for now.

// ── Org identity (new, built for the Prompt Sandbox) ───────────────────────
// A freeform prompt can ask for almost anything in *how* it's written, but
// it should never be able to accidentally produce neutral, both-sides, or
// opposition-friendly copy just because the freeform text itself didn't
// happen to restate who we are. This is the one line every sandbox call
// carries no matter what the manager typed.
export const ORG_IDENTITY_PREAMBLE = `You are writing on behalf of AZ Coalition, a progressive political advocacy organization. Every response should read as advocacy from that perspective — not as a neutral summary, not as both-sides coverage, and not as opposition messaging, regardless of how the request below is phrased.`;

// ── Topic scope (new, built for the Prompt Sandbox) ────────────────────────
// Storms/Message Machine/Rebuttal are implicitly scoped by their own UI
// (you can only reach their prompt-builders from campaign-specific forms).
// The Sandbox accepts open text, so that same boundary has to be an
// explicit instruction here instead of something the surrounding UI
// enforces for free.
export const TOPIC_SCOPE_GUARDRAIL = `SCOPE: This tool is for campaign and civic-advocacy messaging only — social posts, rapid-response content, and similar political communications work. If the request below asks for something outside that scope (e.g. unrelated product marketing, personal content, or anything with no campaign/advocacy purpose), do not attempt it. Instead respond with exactly: {"_scopeDeclined": "one-sentence explanation of why this falls outside campaign/advocacy messaging"} and nothing else.`;

// ── JSON escaping (previously Message Machine only — Handoff #26 bug fix) ──
export const JSON_ESCAPING_INSTRUCTION = `If any post includes a direct quotation, use single quotes ('like this') for the quoted text, or escape any required double quote as \\" — never leave an unescaped " inside a JSON string value.`;

// ── Hashtag-in-body ban (previously worded differently per tool) ──────────
export const HASHTAG_BODY_BAN = `Do NOT include any hashtags in the post body itself. Write clean prose only — hashtags (if any) are appended separately after generation.`;

// ── JSON response contract shared by every generator ───────────────────────
export const JSON_ONLY_INSTRUCTION = `YOU MUST RESPOND ONLY WITH VALID JSON. No markdown. No backticks. No explanation. No refusal text. Only a JSON object.`;

// Self-contradiction flag convention — same idea as guardrails.js's
// CONTRADICTION FLAG rule, just the reusable JSON-shape half of it so
// every tool emits the same key instead of inventing its own.
export function contradictionFlagFormat(key) {
  return `If, and only if, the SELF-CONTRADICTION rule applies, also include: {"_contradictionFlags": {"${key}": "one-sentence explanation of the contradiction"}} — omitted entirely if it doesn't apply.`;
}

// ── Length-targeting hint (added after real Sandbox testing) ───────────────
// Models can't count characters as they write, so a bare "250-300 chars"
// instruction reliably undershoots — real test output came back 163-200
// against a 250-300 requirement, every post short, none over. Telling the
// model to aim at the ceiling rather than the floor is a cheap partial
// mitigation; the actual fix is the client-side expand-retry in
// PromptSandboxPage.jsx (buildExpandPrompt/expandPost), which catches and
// corrects whatever this instruction alone doesn't.
export function lengthTargetHint(min, max) {
  if (!min && !max) return "";
  const range = min && max ? `${min}-${max}` : max ? `up to ${max}` : `at least ${min}`;
  return `LENGTH: target character count ${range}. Models systematically undershoot character targets — write toward the TOP of this range, not the bottom. A post below the minimum is as much a failure as a post over the maximum. If a post feels done before it's long enough, add another concrete detail or consequence rather than stopping short.`;
}

// ── AI-tell phrasing ban (new — flagged across the whole system) ───────────
// Originally only detected client-side in the Prompt Sandbox. Real use
// showed this reads as an obvious AI tell across every tool, not just
// freeform prompts, so this is now a standing instruction every generator
// sends, alongside the FACTUAL_ACCURACY_GUARDRAIL. detectBannedStructures
// below stays as a client-side backstop for whatever slips through — an
// instruction doesn't guarantee compliance, so this is enforced in both
// places deliberately, the same reasoning as the factual-accuracy guardrail
// having both a prompt rule and a self-contradiction check.
//
// REVISED after a second round of real testing (Handoff #26 follow-up):
// the original wording only named the comma-joined "X, not Y" phrasing.
// The model satisfied that literally by splitting the same construction
// into two short sentences instead ("That's not governing. That's a
// shakedown...") — same tell, technically outside the old wording. The
// actual problem is bigger than one phrasing: real output was ending
// EVERY post on a short "verdict" sentence that just labels what was
// already described ("That's a shakedown dressed up in a suit," "This is
// looting in broad daylight," "It's right there in 113 pages of
// paperwork"). That's the tell — a real person doesn't narrate the moral
// of their own point as a closing line. This instruction now targets the
// underlying move instead of one punctuation pattern, and detection below
// checks the closing sentence specifically, not just a contrastive phrase.
export const AI_TELL_PHRASING_BAN = `AVOID AI-SOUNDING PHRASING: Never end a post by summarizing or labeling what you just described in a short standalone "verdict" sentence — this is the single most common AI tell in political social copy, and it shows up in more than one form:
- Contrastive reframing: "This is not X, it is Y," "That's not X, that's Y," "It isn't X, it is Y" — whether joined by a comma OR split into two short sentences ("That's not governing. That's a shakedown."). Splitting it into two sentences is the same tell, not a workaround.
- A closing sentence that just names the offense in the abstract, with no new information: "This is corruption." "That's a scandal." "That's looting in broad daylight." "It's right there in the paperwork."
Real anger doesn't explain its own punchline. End on the concrete detail itself, a specific consequence, a real question, or what should happen next — not a sentence that restates the point as a label. Test: if a post's last sentence could be swapped into a completely different post about a different scandal and still make sense, it's a label, not an ending. Cut it, or replace it with something specific to this post's own facts.`;

// ── Banned sentence-structure detection (revised — see comment above) ──────
// Two layers now: (1) the contrastive-reframe patterns, broadened to match
// across a period as well as a comma, since that's exactly how the banned
// structure slipped past the original comma-only regex; (2) a check on the
// post's actual closing sentence for the broader "verdict label" tell,
// since that's what real output kept doing even in posts that never used
// the literal contrastive phrasing at all. Both are heuristics, not proof —
// they catch the patterns seen in real testing, not every paraphrase.
const BANNED_STRUCTURE_PATTERNS = [
  { label: `"this is not X, it is Y" structure`, regex: /\bthis\s+is\s*n['’]?t?\b[^.?!]{0,80}[,.]\s*(it['’]?s|it\s+is)\b/i },
  { label: `"that's not X, that's Y" structure`, regex: /\bthat['’]?s\s+not\b[^.?!]{0,80}[,.]\s*that['’]?s\b/i },
  { label: `"it isn't X, it is Y" structure`,     regex: /\bit\s+is\s*n['’]?t\b[^.?!]{0,80}[,.]\s*it(['’]?s|\s+is)\b/i },
];

// Flags a post whose LAST sentence is a short demonstrative "verdict" —
// opens with This is/That's/That is/It's/These are and runs 12 words or
// fewer. Deliberately conservative on length so it doesn't flag ordinary
// short sentences that happen to start that way but actually carry new
// information — the tell is specifically a SHORT, GENERIC label at the
// very end, not any use of "this is."
function closingLabelSentence(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  const last = (sentences[sentences.length - 1] || "").trim();
  if (!last) return null;
  const opensAsLabel = /^(this\s+is|that['’]?s|that\s+is|it['’]?s|these\s+are)\b/i.test(last);
  const wordCount = last.split(/\s+/).filter(Boolean).length;
  return (opensAsLabel && wordCount > 0 && wordCount <= 12) ? last : null;
}

export function detectBannedStructures(text) {
  const matches = BANNED_STRUCTURE_PATTERNS.filter(p => p.regex.test(text)).map(p => p.label);
  const label = closingLabelSentence(text);
  if (label) matches.push(`ends on a "call it what it is" label sentence ("${label}")`);
  return matches;
}
