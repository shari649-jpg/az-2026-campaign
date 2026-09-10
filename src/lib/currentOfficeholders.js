
/








































Currentofficeholders · JS
// src/lib/currentOfficeholders.js
//
// Single source of truth for who currently holds key offices — built Sept
// 2026, same root cause and same fix pattern as electionCalendar.js. The
// model has a strong training-data prior for "who was President" from
// whenever its training data was assembled, and — exactly like the
// election-date incident — will confidently state that prior as current
// fact unless given something more authoritative to defer to instead.
// Confirmed real incident: messages generated during this app's real use
// described Donald Trump in PAST tense, as a former/past president,
// despite his being the actual sitting President at time of generation.
// Same mechanism as the DATE FIDELITY incident (electionCalendar.js's own
// header comment): this isn't the model inventing something from nothing,
// it's deriving a wrong "current" fact from a stale prior instead of
// treating this as unstated and writing around it — which is exactly the
// "deriving isn't the same as inventing" gap guardrails.js's DATE FIDELITY
// rule already exists to close for dates. This file and its matching
// OFFICEHOLDER FIDELITY guardrail rule close the same gap for officeholder
// identity/tense.
//
// This constant is injected into every AI prompt this app builds via
// currentOfficeholdersBlock() below, specifically so the model never has
// to guess, assume, or derive a current officeholder's identity or tense
// from a training-data prior. guardrails.js's OFFICEHOLDER FIDELITY rule
// instructs the model to treat this block — plus whatever the user's own
// input says — as the only legitimate source for any statement about who
// currently holds one of these offices, and forbids "correcting" it using
// outside knowledge (the exact mechanism that caused this incident).
//
// Deliberately structured as a small, extensible record (not just a single
// hardcoded President string) so a future office can be added here without
// a redesign — same reasoning as electionCalendar.js's own "don't let this
// quietly become permanent" note. Currently only President is populated,
// since that's the confirmed real incident; add Vice President, Governor,
// etc. here if/when a similar incident surfaces for one of those.
//
// ⚠️ UPDATE THIS ON EVERY TRANSITION OF OFFICE. Nothing in the app enforces
// this automatically — unlike electionCalendar.js's isElectionCalendarStale()
// staleness banner, there is no equivalent check here yet, because there's
// no reliable single "this office holder has changed" trigger the way
// Election Day is a known date. Worth reconsidering once other offices are
// added — a manual reminder alone won't scale past one or two entries.
 
export const CURRENT_OFFICEHOLDERS = {
  president: "Donald Trump",
};
 
// The fact block injected into every AI prompt. Kept short and unambiguous
// on purpose — meant to be read as ground truth, not persuasive copy —
// paired with guardrails.js's OFFICEHOLDER FIDELITY rule wherever it's used.
export function currentOfficeholdersBlock() {
  const o = CURRENT_OFFICEHOLDERS;
  return `CURRENT OFFICEHOLDERS (authoritative — do not override, recompute, or "correct" using outside knowledge):
- President of the United States: ${o.president} — write about the presidency in PRESENT tense (he IS the President), never as a past or former officeholder, unless the user's own input explicitly states otherwise.`;
}
 
