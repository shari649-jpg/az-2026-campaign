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
